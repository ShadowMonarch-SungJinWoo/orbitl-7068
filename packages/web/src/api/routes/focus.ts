import { z } from "zod";
import { and, desc, eq, gte } from "drizzle-orm";
import { authed } from "../middleware/auth";
import { db } from "../database";
import * as s from "../database/schema";
import { awardXp } from "../lib/game";

/**
 * Focus mode.
 *
 * A session records not just "25 minutes happened" but what was studied and how
 * cleanly it went, so the history is worth reading later and the focus score
 * means something instead of always being 100.
 */

/** Timer presets the client can send. "custom" lets the user pick their own. */
const MODES = ["pomodoro", "deep", "sprint", "custom"] as const;

/**
 * Focus score is derived server-side from real signals rather than trusted from
 * the client, so a session can't be reported as flawless when it wasn't.
 *
 * Full marks for finishing the planned interval with no interruptions; time spent
 * paused and tab-away distractions each pull it down, with distractions weighted
 * harder because they're involuntary attention loss rather than a chosen break.
 */
function scoreSession(input: {
  durationSec: number;
  plannedSec: number;
  pausedSec: number;
  distractionCount: number;
}): number {
  const { durationSec, plannedSec, pausedSec, distractionCount } = input;
  const completion = plannedSec > 0 ? Math.min(1, durationSec / plannedSec) : 1;
  const active = durationSec + pausedSec;
  const onTask = active > 0 ? durationSec / active : 1;
  const distractionPenalty = Math.min(0.4, distractionCount * 0.05);
  const raw = completion * 0.5 + onTask * 0.5 - distractionPenalty;
  return Math.max(0, Math.min(100, Math.round(raw * 100)));
}

/** YYYY-MM-DD in the server's local reckoning of the user's day. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const focus = {
  list: authed.handler(async ({ context }) => {
    const rows = await db
      .select()
      .from(s.studySessions)
      .where(eq(s.studySessions.userId, context.user.id))
      .orderBy(desc(s.studySessions.createdAt))
      .limit(100);

    // Resolve names once so the history reads "Integration by parts · Calculus"
    // instead of a pair of UUIDs.
    const subjects = await db.select().from(s.subjects).where(eq(s.subjects.userId, context.user.id));
    const topics = await db.select().from(s.topics).where(eq(s.topics.userId, context.user.id));
    const subjectName = new Map(subjects.map((x) => [x.id, x.name]));
    const topicName = new Map(topics.map((x) => [x.id, x.name]));

    return rows.map((r) => ({
      ...r,
      subjectName: r.subjectId ? (subjectName.get(r.subjectId) ?? null) : null,
      // Prefer the stored free-text label; fall back to the linked topic's name.
      conceptLabel: r.concept || (r.topicId ? (topicName.get(r.topicId) ?? null) : null),
    }));
  }),

  /**
   * Rolling focus statistics: today, this week, and a 14-day trend for the chart.
   * Computed here so the client isn't shipped a hundred rows to reduce itself.
   */
  stats: authed.handler(async ({ context }) => {
    const since = new Date();
    since.setDate(since.getDate() - 13);
    since.setHours(0, 0, 0, 0);

    const rows = await db
      .select()
      .from(s.studySessions)
      .where(and(eq(s.studySessions.userId, context.user.id), gte(s.studySessions.createdAt, since)));

    // Pre-seed every day so the trend chart has no gaps.
    const buckets = new Map<string, { day: string; minutes: number; sessions: number }>();
    for (let i = 0; i < 14; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      buckets.set(dayKey(d), { day: dayKey(d), minutes: 0, sessions: 0 });
    }

    for (const r of rows) {
      const k = dayKey(new Date(r.createdAt));
      const b = buckets.get(k);
      if (!b) continue;
      b.minutes += Math.round(r.durationSec / 60);
      b.sessions += 1;
    }

    const trend = [...buckets.values()];
    const today = dayKey(new Date());
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const weekRows = rows.filter((r) => new Date(r.createdAt) >= weekStart);
    const todayRows = rows.filter((r) => dayKey(new Date(r.createdAt)) === today);
    const totalScore = rows.reduce((a, b) => a + b.focusScore, 0);

    // Which concepts got the most time in the window — the "what am I actually
    // spending my hours on" answer that a raw session list doesn't give.
    const byConcept = new Map<string, number>();
    for (const r of rows) {
      const label = r.concept?.trim();
      if (!label) continue;
      byConcept.set(label, (byConcept.get(label) ?? 0) + Math.round(r.durationSec / 60));
    }
    const topConcepts = [...byConcept.entries()]
      .map(([concept, minutes]) => ({ concept, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5);

    return {
      todayMinutes: Math.round(todayRows.reduce((a, b) => a + b.durationSec, 0) / 60),
      todaySessions: todayRows.length,
      weekMinutes: Math.round(weekRows.reduce((a, b) => a + b.durationSec, 0) / 60),
      weekSessions: weekRows.length,
      avgFocusScore: rows.length ? Math.round(totalScore / rows.length) : 0,
      bestDayMinutes: trend.reduce((a, b) => Math.max(a, b.minutes), 0),
      trend,
      topConcepts,
    };
  }),

  complete: authed
    .input(
      z.object({
        durationSec: z.number().min(1),
        tasksCompleted: z.number().min(0).default(0),
        subjectId: z.string().optional(),
        topicId: z.string().optional(),
        concept: z.string().max(120).optional(),
        mode: z.enum(MODES).default("pomodoro"),
        focusMinutes: z.number().min(1).max(180).default(25),
        breakMinutes: z.number().min(1).max(60).default(5),
        longBreakMinutes: z.number().min(1).max(90).default(15),
        cyclesCompleted: z.number().min(0).max(50).default(0),
        pauseCount: z.number().min(0).default(0),
        pausedSec: z.number().min(0).default(0),
        distractionCount: z.number().min(0).default(0),
        reflection: z.string().max(1000).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const minutes = Math.round(input.durationSec / 60);
      const focusScore = scoreSession({
        durationSec: input.durationSec,
        plannedSec: input.focusMinutes * 60,
        pausedSec: input.pausedSec,
        distractionCount: input.distractionCount,
      });

      // XP tracks real effort: minutes and tasks, with a bonus for a clean session
      // so the focus score is worth protecting.
      const base = Math.max(5, minutes * 2 + input.tasksCompleted * 5);
      const xp = focusScore >= 90 ? Math.round(base * 1.2) : base;

      const [row] = await db
        .insert(s.studySessions)
        .values({
          userId: context.user.id,
          durationSec: input.durationSec,
          focusScore,
          tasksCompleted: input.tasksCompleted,
          subjectId: input.subjectId,
          topicId: input.topicId,
          concept: input.concept?.trim() || null,
          mode: input.mode,
          focusMinutes: input.focusMinutes,
          breakMinutes: input.breakMinutes,
          longBreakMinutes: input.longBreakMinutes,
          cyclesCompleted: input.cyclesCompleted,
          pauseCount: input.pauseCount,
          pausedSec: input.pausedSec,
          distractionCount: input.distractionCount,
          reflection: input.reflection?.trim() || null,
          xpEarned: xp,
        })
        .returning();

      const award = await awardXp(context.user.id, xp, "Completed a focus session", { study: true });
      return { session: row, xp, focusScore, award };
    }),

  /** Attach or edit the reflection after the fact, without re-logging the session. */
  reflect: authed
    .input(z.object({ id: z.string(), reflection: z.string().max(1000) }))
    .handler(async ({ input, context }) => {
      const [row] = await db
        .update(s.studySessions)
        .set({ reflection: input.reflection.trim() || null })
        .where(and(eq(s.studySessions.id, input.id), eq(s.studySessions.userId, context.user.id)))
        .returning();
      return row ?? null;
    }),
};
