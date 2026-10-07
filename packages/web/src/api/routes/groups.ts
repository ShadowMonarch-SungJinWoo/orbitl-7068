import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { authed, withUser } from "../middleware/auth";
import { db } from "../database";
import * as s from "../database/schema";
import { autoFlagContent, visibleGroupMessages } from "./moderation";
import { user as authUser } from "../database/auth-schema";

/** Invite codes are user-typed, so keep them short but guarantee uniqueness. */
async function uniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const [clash] = await db.select().from(s.studyGroups).where(eq(s.studyGroups.inviteCode, code));
    if (!clash) return code;
  }
  // Astronomically unlikely; fall back to something that cannot collide.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}

/** Owner-only guard for destructive/administrative group actions. */
async function assertOwner(userId: string, groupId: string) {
  const [group] = await db.select().from(s.studyGroups).where(eq(s.studyGroups.id, groupId));
  if (!group) throw new ORPCError("NOT_FOUND", { message: "Group not found" });
  if (group.ownerId !== userId) {
    throw new ORPCError("FORBIDDEN", { message: "Only the group owner can do that" });
  }
  return group;
}

/**
 * Older rows predate the denormalized name columns, so fill any gaps from the
 * auth user table on read. Keeps the member list honest without a migration.
 */
async function withMemberIdentity(rows: (typeof s.groupMembers.$inferSelect)[]) {
  const missing = rows.filter((r) => !r.userName).map((r) => r.userId);
  if (missing.length === 0) return rows;
  const users = await db
    .select({ id: authUser.id, name: authUser.name, email: authUser.email })
    .from(authUser)
    .where(inArray(authUser.id, missing));
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => {
    const u = byId.get(r.userId);
    return u ? { ...r, userName: r.userName ?? u.name, userEmail: r.userEmail ?? u.email } : r;
  });
}

async function memberGroupIds(userId: string): Promise<string[]> {
  const rows = await db.select().from(s.groupMembers).where(eq(s.groupMembers.userId, userId));
  return rows.map((r) => r.groupId);
}

async function assertMember(userId: string, groupId: string) {
  const [row] = await db
    .select()
    .from(s.groupMembers)
    .where(and(eq(s.groupMembers.groupId, groupId), eq(s.groupMembers.userId, userId)));
  if (!row) throw new ORPCError("FORBIDDEN", { message: "Not a member of this group" });
  return row;
}

/** Remove a group and everything hanging off it. */
async function deleteGroupCascade(groupId: string) {
  await db.update(s.notes).set({ groupId: null }).where(eq(s.notes.groupId, groupId));
  await db.delete(s.groupMessages).where(eq(s.groupMessages.groupId, groupId));
  await db.delete(s.groupMembers).where(eq(s.groupMembers.groupId, groupId));
  await db.delete(s.studyGroups).where(eq(s.studyGroups.id, groupId));
}

export const groups = {
  list: authed.handler(async ({ context }) => {
    const ids = await memberGroupIds(context.user.id);
    if (ids.length === 0) return [];
    const rows = await db.select().from(s.studyGroups).where(inArray(s.studyGroups.id, ids));
    return Promise.all(
      rows.map(async (g) => {
        const members = await db.select().from(s.groupMembers).where(eq(s.groupMembers.groupId, g.id));
        return { ...g, memberCount: members.length };
      }),
    );
  }),

  get: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    await assertMember(context.user.id, input.id);
    const [group] = await db.select().from(s.studyGroups).where(eq(s.studyGroups.id, input.id));
    const rawMembers = await db
      .select()
      .from(s.groupMembers)
      .where(eq(s.groupMembers.groupId, input.id))
      .orderBy(asc(s.groupMembers.joinedAt));
    const members = await withMemberIdentity(rawMembers);
    const sharedNotes = await db.select().from(s.notes).where(eq(s.notes.groupId, input.id)).orderBy(desc(s.notes.updatedAt));
    return {
      group,
      members,
      sharedNotes,
      isOwner: group?.ownerId === context.user.id,
    };
  }),

  create: authed
    .input(z.object({ name: z.string().min(1), description: z.string().optional(), color: z.string().default("#4F46E5") }))
    .handler(async ({ input, context }) => {
      const inviteCode = await uniqueInviteCode();
      const [group] = await db
        .insert(s.studyGroups)
        .values({ ...input, ownerId: context.user.id, inviteCode })
        .returning();
      await db.insert(s.groupMembers).values({
        groupId: group!.id,
        userId: context.user.id,
        userName: context.user.name ?? null,
        userEmail: context.user.email ?? null,
        role: "owner",
      });
      return group;
    }),

  /**
   * Public look-up behind an invite link: enough to show "you were invited to X"
   * before the visitor has an account. Deliberately exposes nothing but the
   * group's public face — no member list, no messages.
   */
  preview: withUser.input(z.object({ code: z.string().min(1) })).handler(async ({ input, context }) => {
    const [group] = await db
      .select()
      .from(s.studyGroups)
      .where(eq(s.studyGroups.inviteCode, input.code.toUpperCase()));
    if (!group) throw new ORPCError("NOT_FOUND", { message: "This invite link is not valid" });
    const members = await db.select().from(s.groupMembers).where(eq(s.groupMembers.groupId, group.id));
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      color: group.color,
      memberCount: members.length,
      isMember: context.user ? members.some((m) => m.userId === context.user!.id) : false,
    };
  }),

  join: authed.input(z.object({ code: z.string().min(1) })).handler(async ({ input, context }) => {
    const [group] = await db.select().from(s.studyGroups).where(eq(s.studyGroups.inviteCode, input.code.toUpperCase()));
    if (!group) throw new ORPCError("NOT_FOUND", { message: "Invalid invite code" });
    const [existing] = await db
      .select()
      .from(s.groupMembers)
      .where(and(eq(s.groupMembers.groupId, group.id), eq(s.groupMembers.userId, context.user.id)));
    if (!existing) {
      await db.insert(s.groupMembers).values({
        groupId: group.id,
        userId: context.user.id,
        userName: context.user.name ?? null,
        userEmail: context.user.email ?? null,
      });
      await db.insert(s.groupMessages).values({
        groupId: group.id,
        userId: context.user.id,
        userName: "OrbitL",
        body: `${context.user.name ?? "A new member"} joined the group.`,
      });
    }
    return group;
  }),

  /**
   * Leaving is always allowed. When the owner leaves, ownership transfers to the
   * longest-standing remaining member so a group can never be orphaned; if they
   * were the last member the group and its contents are removed entirely.
   */
  leave: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    await assertMember(context.user.id, input.id);
    const [group] = await db.select().from(s.studyGroups).where(eq(s.studyGroups.id, input.id));
    if (!group) throw new ORPCError("NOT_FOUND", { message: "Group not found" });

    await db
      .delete(s.groupMembers)
      .where(and(eq(s.groupMembers.groupId, input.id), eq(s.groupMembers.userId, context.user.id)));

    if (group.ownerId !== context.user.id) return { ok: true, deleted: false, newOwnerId: null };

    const [heir] = await db
      .select()
      .from(s.groupMembers)
      .where(eq(s.groupMembers.groupId, input.id))
      .orderBy(asc(s.groupMembers.joinedAt))
      .limit(1);

    if (!heir) {
      await deleteGroupCascade(input.id);
      return { ok: true, deleted: true, newOwnerId: null };
    }

    await db.update(s.studyGroups).set({ ownerId: heir.userId }).where(eq(s.studyGroups.id, input.id));
    await db.update(s.groupMembers).set({ role: "owner" }).where(eq(s.groupMembers.id, heir.id));
    await db.insert(s.groupMessages).values({
      groupId: input.id,
      userId: context.user.id,
      userName: "OrbitL",
      body: `${heir.userName ?? "A member"} is now the group owner.`,
    });
    return { ok: true, deleted: false, newOwnerId: heir.userId };
  }),

  /** Owner: rename / re-describe / recolour the group. */
  update: authed
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().max(2000).nullable().optional(),
        color: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      await assertOwner(context.user.id, input.id);
      const { id, ...patch } = input;
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) return { ok: true };
      const [row] = await db.update(s.studyGroups).set(clean).where(eq(s.studyGroups.id, id)).returning();
      return row;
    }),

  /** Owner: rotate the invite code, which instantly invalidates old links. */
  regenerateInvite: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    await assertOwner(context.user.id, input.id);
    const inviteCode = await uniqueInviteCode();
    const [row] = await db
      .update(s.studyGroups)
      .set({ inviteCode })
      .where(eq(s.studyGroups.id, input.id))
      .returning();
    return row;
  }),

  /** Owner: delete the group, its members, its messages, and unshare its notes. */
  remove: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    await assertOwner(context.user.id, input.id);
    await deleteGroupCascade(input.id);
    return { ok: true };
  }),

  /** Owner: remove someone else from the group. */
  removeMember: authed
    .input(z.object({ groupId: z.string(), userId: z.string() }))
    .handler(async ({ input, context }) => {
      const group = await assertOwner(context.user.id, input.groupId);
      if (input.userId === group.ownerId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "The owner can't be removed — transfer the group by leaving it instead.",
        });
      }
      const [member] = await db
        .select()
        .from(s.groupMembers)
        .where(and(eq(s.groupMembers.groupId, input.groupId), eq(s.groupMembers.userId, input.userId)));
      if (!member) throw new ORPCError("NOT_FOUND", { message: "That person is not in this group" });
      await db.delete(s.groupMembers).where(eq(s.groupMembers.id, member.id));
      // Their shared notes go back to being private.
      await db
        .update(s.notes)
        .set({ groupId: null })
        .where(and(eq(s.notes.groupId, input.groupId), eq(s.notes.userId, input.userId)));
      return { ok: true };
    }),

  messages: authed.input(z.object({ groupId: z.string() })).handler(async ({ input, context }) => {
    await assertMember(context.user.id, input.groupId);
    return db
      .select()
      .from(s.groupMessages)
      .where(and(eq(s.groupMessages.groupId, input.groupId), visibleGroupMessages))
      .orderBy(s.groupMessages.createdAt)
      .limit(200);
  }),

  postMessage: authed
    .input(z.object({ groupId: z.string(), body: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      await assertMember(context.user.id, input.groupId);
      const [row] = await db
        .insert(s.groupMessages)
        .values({
          groupId: input.groupId,
          userId: context.user.id,
          userName: context.user.name ?? "You",
          body: input.body,
        })
        .returning();
      if (row) await autoFlagContent("group_message", row.id, context.user.id, input.body);
      return row;
    }),

  shareNote: authed
    .input(z.object({ noteId: z.string(), groupId: z.string() }))
    .handler(async ({ input, context }) => {
      await assertMember(context.user.id, input.groupId);
      const [row] = await db
        .update(s.notes)
        .set({ groupId: input.groupId })
        .where(and(eq(s.notes.id, input.noteId), eq(s.notes.userId, context.user.id)))
        .returning();
      if (!row) throw new ORPCError("NOT_FOUND", { message: "That note doesn't exist, or isn't yours to share" });
      return row;
    }),

  /** Un-share a note: its author, or the group owner, can pull it back. */
  unshareNote: authed
    .input(z.object({ noteId: z.string(), groupId: z.string() }))
    .handler(async ({ input, context }) => {
      await assertMember(context.user.id, input.groupId);
      const [group] = await db.select().from(s.studyGroups).where(eq(s.studyGroups.id, input.groupId));
      const [note] = await db
        .select()
        .from(s.notes)
        .where(and(eq(s.notes.id, input.noteId), eq(s.notes.groupId, input.groupId)));
      if (!note) throw new ORPCError("NOT_FOUND", { message: "That note isn't shared with this group" });
      if (note.userId !== context.user.id && group?.ownerId !== context.user.id) {
        throw new ORPCError("FORBIDDEN", { message: "Only the note's author or the group owner can un-share it" });
      }
      await db.update(s.notes).set({ groupId: null }).where(eq(s.notes.id, input.noteId));
      return { ok: true };
    }),
};
