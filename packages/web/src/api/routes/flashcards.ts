import { z } from "zod";
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import { authed } from "../middleware/auth";
import { db } from "../database";
import * as s from "../database/schema";
import { generateFlashcards } from "../lib/ai";
import { consumeAiQuota } from "../lib/rate-limit";
import { awardXp } from "../lib/game";
import { DEFAULT_EASE_FACTOR, GRADES, formatInterval, schedule, type Grade } from "../lib/srs";

export const flashcards = {
  list: authed
    .input(z.object({ topicId: z.string().optional(), subjectId: z.string().optional() }).optional())
    .handler(async ({ input, context }) => {
      const rows = await db.select().from(s.flashcards).where(eq(s.flashcards.userId, context.user.id));
      return rows.filter(
        (r) => (!input?.topicId || r.topicId === input.topicId) && (!input?.subjectId || r.subjectId === input.subjectId),
      );
    }),

  create: authed
    .input(
      z.object({
        front: z.string().min(1),
        back: z.string().min(1),
        topicId: z.string().optional(),
        subjectId: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [row] = await db.insert(s.flashcards).values({ ...input, userId: context.user.id }).returning();
      return row;
    }),

  update: authed
    .input(z.object({ id: z.string(), front: z.string().optional(), back: z.string().optional() }))
    .handler(async ({ input, context }) => {
      const { id, ...rest } = input;
      const [row] = await db
        .update(s.flashcards)
        .set(rest)
        .where(and(eq(s.flashcards.id, id), eq(s.flashcards.userId, context.user.id)))
        .returning();
      return row;
    }),

  remove: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    await db.delete(s.flashcards).where(and(eq(s.flashcards.id, input.id), eq(s.flashcards.userId, context.user.id)));
    return { ok: true };
  }),

  /**
   * The cards actually owed right now: never-reviewed first, then the most
   * overdue. `limit` keeps a session finite when a big backlog has piled up.
   */
  due: authed
    .input(z.object({ limit: z.number().min(1).max(200).default(40) }).optional())
    .handler(async ({ input, context }) => {
      const now = new Date();
      const rows = await db
        .select()
        .from(s.flashcards)
        .where(
          and(
            eq(s.flashcards.userId, context.user.id),
            or(isNull(s.flashcards.dueAt), lte(s.flashcards.dueAt, now)),
          ),
        )
        .orderBy(asc(s.flashcards.dueAt))
        .limit(input?.limit ?? 40);

      const all = await db
        .select({ dueAt: s.flashcards.dueAt })
        .from(s.flashcards)
        .where(eq(s.flashcards.userId, context.user.id));
      const upcoming = all
        .map((r) => r.dueAt)
        .filter((d): d is Date => !!d && d.getTime() > now.getTime())
        .sort((a, b) => a.getTime() - b.getTime());

      return {
        cards: rows,
        total: all.length,
        dueCount: rows.length,
        nextDueAt: upcoming[0] ?? null,
      };
    }),

  /**
   * Grade a card and reschedule it (SM-2). Grades are again/hard/good/easy;
   * XP scales with honesty — admitting a lapse still earns something so the
   * incentive isn't to lie to the algorithm.
   */
  review: authed
    .input(z.object({ id: z.string(), grade: z.enum(GRADES as [Grade, ...Grade[]]) }))
    .handler(async ({ input, context }) => {
      const [card] = await db
        .select()
        .from(s.flashcards)
        .where(and(eq(s.flashcards.id, input.id), eq(s.flashcards.userId, context.user.id)));
      if (!card) return { ok: false as const };

      const next = schedule(
        {
          interval: card.interval,
          easeFactor: (card.easeFactor ?? DEFAULT_EASE_FACTOR * 100) / 100,
          reps: card.reps,
          lapses: card.lapses,
        },
        input.grade,
      );

      await db
        .update(s.flashcards)
        .set({
          interval: next.interval,
          easeFactor: Math.round(next.easeFactor * 100),
          reps: next.reps,
          lapses: next.lapses,
          dueAt: next.dueAt,
          lastReviewed: new Date(),
          ease: next.lapsed ? Math.max(0, card.ease - 1) : card.ease + 1,
        })
        .where(eq(s.flashcards.id, input.id));

      const xp = input.grade === "again" ? 1 : input.grade === "hard" ? 2 : 3;
      const award = await awardXp(context.user.id, xp, "Reviewed a flashcard", { study: true });
      return {
        ok: true as const,
        award,
        interval: next.interval,
        dueAt: next.dueAt,
        nextLabel: formatInterval(next.lapsed ? 0 : next.interval),
      };
    }),

  generate: authed
    .input(z.object({ topicId: z.string(), count: z.number().min(1).max(60).default(6) }))
    .handler(async ({ input, context }) => {
      const [topic] = await db
        .select()
        .from(s.topics)
        .where(and(eq(s.topics.id, input.topicId), eq(s.topics.userId, context.user.id)));
      if (!topic) return [];
      await consumeAiQuota(context.user.id, "generate");
      const [subject] = await db.select().from(s.subjects).where(eq(s.subjects.id, topic.subjectId));
      const cards = await generateFlashcards(topic.name, subject?.name ?? "General", input.count);
      const inserted = await db
        .insert(s.flashcards)
        .values(
          cards.map((c) => ({
            userId: context.user.id,
            topicId: topic.id,
            subjectId: topic.subjectId,
            front: c.front,
            back: c.back,
          })),
        )
        .returning();
      return inserted;
    }),
};
