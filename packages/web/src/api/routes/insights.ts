import { z } from "zod";
import { and, desc, eq, gte } from "drizzle-orm";
import { authed } from "../middleware/auth";
import { db } from "../database";
import * as s from "../database/schema";
import { ensureProfile } from "../lib/game";
import { computeStudyStats, drilldown } from "../lib/study-context";

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export const insights = {
  /** Everything the dashboard needs in one call. */
  dashboard: authed.handler(async ({ context }) => {
    const uid = context.user.id;
    const profile = await ensureProfile(uid);
    const subjects = await db.select().from(s.subjects).where(eq(s.subjects.userId, uid));
    const topics = await db.select().from(s.topics).where(eq(s.topics.userId, uid));
    const assignments = await db.select().from(s.assignments).where(eq(s.assignments.userId, uid));
    const attempts = await db.select().from(s.quizAttempts).where(eq(s.quizAttempts.userId, uid)).orderBy(desc(s.quizAttempts.createdAt));
    const sessions = await db.select().from(s.studySessions).where(eq(s.studySessions.userId, uid));

    const subjectMastery = subjects.map((sub) => {
      const st = topics.filter((t) => t.subjectId === sub.id);
      const mastery = st.length ? Math.round(st.reduce((a, b) => a + b.mastery, 0) / st.length) : 0;
      return { id: sub.id, name: sub.name, color: sub.color, mastery, topics: st.length };
    });
    const ranked = [...subjectMastery].filter((x) => x.topics > 0).sort((a, b) => b.mastery - a.mastery);
    const readiness = topics.length ? Math.round(topics.reduce((a, b) => a + b.mastery, 0) / topics.length) : 0;

    // last 7 days XP series
    const week = new Date(Date.now() - 6 * 86400000);
    week.setHours(0, 0, 0, 0);
    const xpEvents = await db.select().from(s.xpEvents).where(and(eq(s.xpEvents.userId, uid), gte(s.xpEvents.createdAt, week)));
    const series: { day: string; xp: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = dayKey(d);
      const xp = xpEvents.filter((e) => dayKey(e.createdAt) === key).reduce((a, b) => a + b.amount, 0);
      series.push({ day: d.toLocaleDateString("en", { weekday: "short" }), xp });
    }

    const upcoming = assignments
      .filter((a) => a.status !== "done")
      .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity))
      .slice(0, 5);

    return {
      profile,
      readiness,
      counts: {
        subjects: subjects.length,
        topics: topics.length,
        assignmentsDue: assignments.filter((a) => a.status !== "done").length,
        quizzesTaken: attempts.length,
        sessions: sessions.length,
        studyMinutes: Math.round(sessions.reduce((a, b) => a + b.durationSec, 0) / 60),
      },
      strongest: ranked[0] ?? null,
      weakest: ranked.length ? ranked[ranked.length - 1] : null,
      subjectMastery,
      xpSeries: series,
      upcoming,
      recentAttempts: attempts.slice(0, 5),
    };
  }),

  /**
   * Deeper analytics for the Insights page — filtered by window and subject, and
   * always paired with the preceding window so the UI can show real movement.
   * Delegates to the shared engine so these numbers are literally the same ones
   * the AI coach is given.
   */
  analytics: authed
    .input(
      z
        .object({
          range: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
          subjectId: z.string().nullable().default(null),
        })
        .optional(),
    )
    .handler(async ({ input, context }) => {
      return computeStudyStats(context.user.id, {
        range: input?.range ?? 30,
        subjectId: input?.subjectId ?? null,
      });
    }),

  /**
   * The rows behind a single point on a chart. `key` and `bucketDays` come
   * straight from the series the chart rendered, so a click can never resolve to
   * a different window than the bar the student actually pressed.
   */
  drilldown: authed
    .input(
      z.object({
        key: z.string(),
        bucketDays: z.number().min(1).max(31).default(1),
        subjectId: z.string().nullable().default(null),
      }),
    )
    .handler(async ({ input, context }) => {
      return drilldown(context.user.id, {
        key: input.key,
        bucketDays: input.bucketDays,
        subjectId: input.subjectId,
      });
    }),

  /** Flat index for the Ctrl+K command palette. */
  searchIndex: authed.handler(async ({ context }) => {
    const uid = context.user.id;
    const [subjects, topics, notes, flashcards, quizzes, assignments] = await Promise.all([
      db.select().from(s.subjects).where(eq(s.subjects.userId, uid)),
      db.select().from(s.topics).where(eq(s.topics.userId, uid)),
      db.select().from(s.notes).where(eq(s.notes.userId, uid)),
      db.select().from(s.flashcards).where(eq(s.flashcards.userId, uid)),
      db.select().from(s.quizzes).where(eq(s.quizzes.userId, uid)),
      db.select().from(s.assignments).where(eq(s.assignments.userId, uid)),
    ]);
    return [
      ...subjects.map((x) => ({ id: x.id, type: "subject", title: x.name, to: `/subjects/${x.id}` })),
      ...topics.map((x) => ({ id: x.id, type: "concept", title: x.name, to: `/graph?topic=${x.id}` })),
      ...notes.map((x) => ({ id: x.id, type: "note", title: x.title, to: `/notes/${x.id}` })),
      ...flashcards.map((x) => ({ id: x.id, type: "flashcard", title: x.front, to: `/flashcards` })),
      ...quizzes.map((x) => ({ id: x.id, type: "quiz", title: x.title, to: `/quizzes/${x.id}` })),
      ...assignments.map((x) => ({ id: x.id, type: "assignment", title: x.title, to: `/assignments` })),
    ];
  }),
};
