import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { authed, withUser } from "../middleware/auth";
import { db } from "../database";
import * as s from "../database/schema";
import { awardXp } from "../lib/game";
import { autoFlagContent, visibleReviews } from "./moderation";

const CATEGORIES = ["general", "graph", "tutor", "focus", "gamification", "bug", "idea"] as const;

type Row = typeof s.reviews.$inferSelect;

async function decorate(rows: Row[], userId: string | null) {
  let voted = new Set<string>();
  if (userId && rows.length) {
    const votes = await db
      .select()
      .from(s.reviewVotes)
      .where(and(eq(s.reviewVotes.userId, userId), inArray(s.reviewVotes.reviewId, rows.map((r) => r.id))));
    voted = new Set(votes.map((v) => v.reviewId));
  }
  return rows.map((r) => ({ ...r, votedByMe: voted.has(r.id), mine: !!userId && r.userId === userId }));
}

function summarize(rows: Row[]) {
  const total = rows.length;
  const average = total ? rows.reduce((a, r) => a + r.rating, 0) / total : 0;
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: rows.filter((r) => r.rating === stars).length,
  }));
  return { total, average: Math.round(average * 10) / 10, distribution };
}

export const reviews = {
  /** Public — powers both the landing page testimonials and the in-app wall. */
  list: withUser
    .input(
      z
        .object({
          sort: z.enum(["top", "recent", "rating"]).default("top"),
          category: z.enum(CATEGORIES).nullish(),
          limit: z.number().min(1).max(100).default(50),
        })
        .default({ sort: "top", limit: 50 }),
    )
    .handler(async ({ input, context }) => {
      const all = await db.select().from(s.reviews).where(visibleReviews);
      const filtered = input.category ? all.filter((r) => r.category === input.category) : all;
      const sorted = [...filtered].sort((a, b) => {
        if (input.sort === "recent") return b.createdAt.getTime() - a.createdAt.getTime();
        if (input.sort === "rating") return b.rating - a.rating || b.helpful - a.helpful;
        // "top": rating first, then helpfulness, then recency
        return b.rating * 1000 + b.helpful - (a.rating * 1000 + a.helpful) || b.createdAt.getTime() - a.createdAt.getTime();
      });
      return {
        items: await decorate(sorted.slice(0, input.limit), context.user?.id ?? null),
        summary: summarize(all),
      };
    }),

  /** Public — a handful of the best reviews for marketing surfaces. */
  top: withUser.input(z.object({ limit: z.number().min(1).max(12).default(3) }).default({ limit: 3 })).handler(
    async ({ input }) => {
      const all = await db.select().from(s.reviews).where(visibleReviews);
      const sorted = [...all].sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          b.rating - a.rating ||
          b.helpful - a.helpful ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );
      return { items: sorted.slice(0, input.limit), summary: summarize(all) };
    },
  ),

  mine: authed.handler(async ({ context }) => {
    const rows = await db
      .select()
      .from(s.reviews)
      .where(eq(s.reviews.userId, context.user.id))
      .orderBy(desc(s.reviews.createdAt));
    return rows;
  }),

  create: authed
    .input(
      z.object({
        rating: z.number().min(1).max(5),
        title: z.string().min(3).max(120),
        body: z.string().min(10).max(2000),
        role: z.string().max(80).nullish(),
        category: z.enum(CATEGORIES).default("general"),
      }),
    )
    .handler(async ({ input, context }) => {
      const [row] = await db
        .insert(s.reviews)
        .values({
          userId: context.user.id,
          userName: context.user.name || "Student",
          rating: input.rating,
          title: input.title.trim(),
          body: input.body.trim(),
          role: input.role?.trim() || null,
          category: input.category,
        })
        .returning();
      if (row) await autoFlagContent("review", row.id, context.user.id, `${input.title}\n${input.body}`);
      const award = await awardXp(context.user.id, 30, "Shared feedback");
      return { review: row!, award };
    }),

  update: authed
    .input(
      z.object({
        id: z.string(),
        rating: z.number().min(1).max(5).optional(),
        title: z.string().min(3).max(120).optional(),
        body: z.string().min(10).max(2000).optional(),
        role: z.string().max(80).nullish(),
        category: z.enum(CATEGORIES).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [existing] = await db.select().from(s.reviews).where(eq(s.reviews.id, input.id));
      if (!existing) throw new ORPCError("NOT_FOUND");
      if (existing.userId !== context.user.id) throw new ORPCError("FORBIDDEN");
      const { id, ...patch } = input;
      const [row] = await db
        .update(s.reviews)
        .set({
          ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
          ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
          ...(patch.body !== undefined ? { body: patch.body.trim() } : {}),
          ...(patch.role !== undefined ? { role: patch.role?.trim() || null } : {}),
          ...(patch.category !== undefined ? { category: patch.category } : {}),
          updatedAt: new Date(),
        })
        .where(eq(s.reviews.id, id))
        .returning();
      return row!;
    }),

  remove: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const [existing] = await db.select().from(s.reviews).where(eq(s.reviews.id, input.id));
    if (!existing) throw new ORPCError("NOT_FOUND");
    if (existing.userId !== context.user.id) throw new ORPCError("FORBIDDEN");
    await db.delete(s.reviewVotes).where(eq(s.reviewVotes.reviewId, input.id));
    await db.delete(s.reviews).where(eq(s.reviews.id, input.id));
    return { ok: true };
  }),

  /** Toggle "this was helpful" — one vote per user per review. */
  vote: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const [review] = await db.select().from(s.reviews).where(eq(s.reviews.id, input.id));
    if (!review) throw new ORPCError("NOT_FOUND");
    const [existing] = await db
      .select()
      .from(s.reviewVotes)
      .where(and(eq(s.reviewVotes.reviewId, input.id), eq(s.reviewVotes.userId, context.user.id)));
    if (existing) {
      await db.delete(s.reviewVotes).where(eq(s.reviewVotes.id, existing.id));
      const helpful = Math.max(0, review.helpful - 1);
      await db.update(s.reviews).set({ helpful }).where(eq(s.reviews.id, input.id));
      return { voted: false, helpful };
    }
    await db.insert(s.reviewVotes).values({ reviewId: input.id, userId: context.user.id });
    const helpful = review.helpful + 1;
    await db.update(s.reviews).set({ helpful }).where(eq(s.reviews.id, input.id));
    return { voted: true, helpful };
  }),
};
