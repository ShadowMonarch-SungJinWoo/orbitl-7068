import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { authed } from "../middleware/auth";
import { db } from "../database";
import * as s from "../database/schema";
import { awardXp } from "../lib/game";
import { plainText } from "../lib/rich-text";
import { autoFlagContent, visibleNoteComments } from "./moderation";

async function ownedNote(userId: string, id: string) {
  const [row] = await db.select().from(s.notes).where(and(eq(s.notes.id, id), eq(s.notes.userId, userId)));
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Note not found" });
  return row;
}

export const notes = {
  list: authed.handler(async ({ context }) => {
    return db.select().from(s.notes).where(eq(s.notes.userId, context.user.id)).orderBy(desc(s.notes.updatedAt));
  }),

  get: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const note = await ownedNote(context.user.id, input.id);
    const comments = await db
      .select()
      .from(s.noteComments)
      .where(and(eq(s.noteComments.noteId, note.id), visibleNoteComments))
      .orderBy(s.noteComments.createdAt);
    return { ...note, comments };
  }),

  create: authed
    .input(
      z.object({
        title: z.string().default("Untitled"),
        content: z.string().default(""),
        format: z.enum(["markdown", "html"]).default("html"),
        subjectId: z.string().optional(),
        topicId: z.string().optional(),
        groupId: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [row] = await db
        .insert(s.notes)
        .values({
          ...input,
          userId: context.user.id,
          // The plain-text mirror is always derived here, never accepted from the
          // client, so AI and search can rely on it matching the stored body.
          contentText: plainText(input.content, input.format),
        })
        .returning();
      const award = await awardXp(context.user.id, 15, "Created a note", { study: true });
      return { ...row, award };
    }),

  update: authed
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        content: z.string().optional(),
        format: z.enum(["markdown", "html"]).optional(),
        subjectId: z.string().nullable().optional(),
        topicId: z.string().nullable().optional(),
        groupId: z.string().nullable().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const existing = await ownedNote(context.user.id, input.id);
      const { id, ...rest } = input;
      const mirror =
        input.content === undefined
          ? {}
          : { contentText: plainText(input.content, input.format ?? existing.format) };
      const [row] = await db
        .update(s.notes)
        .set({ ...rest, ...mirror, updatedAt: new Date() })
        .where(eq(s.notes.id, id))
        .returning();
      return row;
    }),

  remove: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    await ownedNote(context.user.id, input.id);
    await db.delete(s.noteComments).where(eq(s.noteComments.noteId, input.id));
    await db.delete(s.notes).where(eq(s.notes.id, input.id));
    return { ok: true };
  }),

  addComment: authed
    .input(z.object({ noteId: z.string(), body: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      const [row] = await db
        .insert(s.noteComments)
        .values({
          noteId: input.noteId,
          userId: context.user.id,
          userName: context.user.name ?? "You",
          body: input.body,
        })
        .returning();
      if (row) await autoFlagContent("note_comment", row.id, context.user.id, input.body);
      return row;
    }),
};
