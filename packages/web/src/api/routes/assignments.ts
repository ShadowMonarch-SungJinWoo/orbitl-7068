import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { authed } from "../middleware/auth";
import { db } from "../database";
import * as s from "../database/schema";
import { awardXp } from "../lib/game";

export const assignments = {
  list: authed.handler(async ({ context }) => {
    return db.select().from(s.assignments).where(eq(s.assignments.userId, context.user.id));
  }),

  create: authed
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        subjectId: z.string().optional(),
        topicId: z.string().optional(),
        dueDate: z.number().optional(), // epoch ms
        priority: z.enum(["low", "medium", "high"]).default("medium"),
      }),
    )
    .handler(async ({ input, context }) => {
      const { dueDate, ...rest } = input;
      const [row] = await db
        .insert(s.assignments)
        .values({ ...rest, userId: context.user.id, dueDate: dueDate ? new Date(dueDate) : null })
        .returning();
      await awardXp(context.user.id, 5, "Added an assignment");
      return row;
    }),

  update: authed
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["todo", "in_progress", "done"]).optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        dueDate: z.number().nullable().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { id, dueDate, ...rest } = input;
      const patch: Record<string, unknown> = { ...rest };
      if (dueDate !== undefined) patch.dueDate = dueDate ? new Date(dueDate) : null;
      const [row] = await db
        .update(s.assignments)
        .set(patch)
        .where(and(eq(s.assignments.id, id), eq(s.assignments.userId, context.user.id)))
        .returning();
      let award;
      if (rest.status === "done") award = await awardXp(context.user.id, 30, "Completed an assignment");
      return { ...row, award };
    }),

  remove: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    await db.delete(s.assignments).where(and(eq(s.assignments.id, input.id), eq(s.assignments.userId, context.user.id)));
    return { ok: true };
  }),
};
