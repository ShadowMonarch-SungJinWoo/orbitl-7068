import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { authed } from "../middleware/auth";
import { db } from "../database";
import * as s from "../database/schema";
import { awardXp } from "../lib/game";

async function owned(userId: string, id: string) {
  const [row] = await db.select().from(s.subjects).where(and(eq(s.subjects.id, id), eq(s.subjects.userId, userId)));
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Subject not found" });
  return row;
}

export const subjects = {
  list: authed.handler(async ({ context }) => {
    const rows = await db.select().from(s.subjects).where(eq(s.subjects.userId, context.user.id));
    // attach topic count + avg mastery
    const withStats = await Promise.all(
      rows.map(async (sub) => {
        const [stat] = await db
          .select({
            topics: sql<number>`count(*)`,
            mastery: sql<number>`coalesce(avg(${s.topics.mastery}),0)`,
          })
          .from(s.topics)
          .where(eq(s.topics.subjectId, sub.id));
        return { ...sub, topicCount: Number(stat?.topics ?? 0), mastery: Math.round(Number(stat?.mastery ?? 0)) };
      }),
    );
    return withStats;
  }),

  get: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const subject = await owned(context.user.id, input.id);
    const topics = await db.select().from(s.topics).where(eq(s.topics.subjectId, subject.id));
    return { ...subject, topics };
  }),

  create: authed
    .input(
      z.object({
        name: z.string().min(1),
        color: z.string().default("#2563EB"),
        icon: z.string().default("book"),
        description: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [row] = await db
        .insert(s.subjects)
        .values({ ...input, userId: context.user.id })
        .returning();
      // XP only — creating a subject is setup, not studying, so it never touches the streak.
      await awardXp(context.user.id, 10, "Created a subject");
      return row;
    }),

  update: authed
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      await owned(context.user.id, input.id);
      const { id, ...rest } = input;
      const [row] = await db.update(s.subjects).set(rest).where(eq(s.subjects.id, id)).returning();
      return row;
    }),

  remove: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    await owned(context.user.id, input.id);
    await db.delete(s.topics).where(eq(s.topics.subjectId, input.id));
    await db.delete(s.subjects).where(eq(s.subjects.id, input.id));
    return { ok: true };
  }),
};
