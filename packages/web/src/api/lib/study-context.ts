import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { ensureProfile } from "./game";

/**
 * The shared insight engine.
 *
 * The Smart Insights page, the dashboard coach cards and the AI coach all read
 * from here, so a number shown in a chart and a number quoted by the coach can
 * never disagree. Everything is computed for a window (7/30/90 days) and,
 * optionally, one subject — and every window is computed twice, current and
 * previous, so the UI can show real period-over-period movement instead of a
 * bare figure with no sense of direction.
 */

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

const DAY = 86400000;

export function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * 90 daily bars is noise, 7 weekly bars is nothing. The bucket follows the range
 * so every chart stays legible without the page having to know the rule.
 */
function bucketDays(range: Range) {
  return range === 90 ? 7 : 1;
}

interface Window {
  from: Date;
  to: Date;
}

/** UTC midnight that starts the calendar day `d` falls in. */
function startOfDay(ms: number) {
  return Math.floor(ms / DAY) * DAY;
}

/**
 * Windows are aligned to UTC calendar-day boundaries, not to the current clock
 * time. A rolling "now - 30 days" window would start mid-afternoon, which then
 * disagrees with the chart buckets (keyed by calendar date) and with the
 * drill-down (which resolves a calendar date) — the headline total would not
 * equal the sum of the bars underneath it. Aligning here is what keeps the
 * metrics, the series and the drill-down describing the same rows.
 *
 * `spanDays` is the series span rather than `range` itself: 90 days bucketed
 * weekly covers 13 whole weeks (91 days), and the totals must cover exactly
 * what the bars cover.
 */
function windows(spanDays: number): { current: Window; previous: Window } {
  const end = startOfDay(Date.now()) + DAY; // exclusive: end of today
  const span = spanDays * DAY;
  return {
    current: { from: new Date(end - span), to: new Date(end) },
    previous: { from: new Date(end - 2 * span), to: new Date(end - span) },
  };
}

type Session = typeof s.studySessions.$inferSelect;
type Attempt = typeof s.quizAttempts.$inferSelect;
type XpEvent = typeof s.xpEvents.$inferSelect;

/** Headline metrics for one window. Every field is safe on an empty account. */
export interface Metrics {
  sessions: number;
  minutes: number;
  avgFocus: number;
  avgDuration: number;
  quizzes: number;
  avgScore: number | null;
  xp: number;
  activeDays: number;
  /** XP per active day — how fast they move when they actually show up. */
  velocity: number;
  /** Hour of day (0-23) with the most logged study time, or null if none. */
  bestHour: number | null;
}

function metricsFor(sessions: Session[], attempts: Attempt[], xp: number): Metrics {
  const minutes = Math.round(sessions.reduce((a, b) => a + b.durationSec, 0) / 60);
  const hourBuckets = new Array(24).fill(0);
  sessions.forEach((se) => {
    hourBuckets[se.createdAt.getHours()] += se.durationSec;
  });
  const peak = Math.max(...hourBuckets);
  const activeDays = new Set([
    ...sessions.map((se) => dayKey(se.createdAt)),
    ...attempts.map((a) => dayKey(a.createdAt)),
  ]).size;

  return {
    sessions: sessions.length,
    minutes,
    avgFocus: sessions.length ? Math.round(sessions.reduce((a, b) => a + b.focusScore, 0) / sessions.length) : 0,
    avgDuration: sessions.length ? Math.round(minutes / sessions.length) : 0,
    quizzes: attempts.length,
    avgScore: attempts.length ? Math.round(attempts.reduce((a, b) => a + b.score, 0) / attempts.length) : null,
    xp,
    activeDays,
    velocity: activeDays ? Math.round(xp / activeDays) : 0,
    bestHour: peak > 0 ? hourBuckets.indexOf(peak) : null,
  };
}

export interface Bucket {
  /** ISO date of the bucket start — the drill-down key. */
  key: string;
  /** Short human label for the axis. */
  label: string;
  minutes: number;
  xp: number;
  quizzes: number;
  /** Average quiz score in this bucket, or null when no quiz was taken. */
  score: number | null;
}

export interface StudyStats {
  range: Range;
  subjectId: string | null;
  /** Bucket width in days — 1 for 7/30-day ranges, 7 for 90. */
  bucketDays: number;
  current: Metrics;
  previous: Metrics;
  series: Bucket[];
  /** Per-subject mastery, always across all subjects so the picker has options. */
  subjectMastery: { id: string; name: string; color: string; mastery: number; topics: number }[];
  /** Weakest concepts in scope — what the coach should actually talk about. */
  weakTopics: { id: string; name: string; subject: string; mastery: number }[];
  /** Concepts studied in the window, most-studied first. */
  studiedTopics: { name: string; minutes: number }[];
  upcoming: { id: string; title: string; dueDate: Date | null; subject: string | null }[];
  readiness: number;
  streak: number;
  level: number;
  totalXp: number;
}

/**
 * Loads and computes everything in one pass. Callers pass the filters straight
 * through from the UI; an unknown subject id simply yields an empty scope rather
 * than throwing, because a subject can be deleted while a page is still open.
 */
export async function computeStudyStats(
  userId: string,
  opts: { range?: Range; subjectId?: string | null } = {},
): Promise<StudyStats> {
  const range: Range = opts.range ?? 30;
  const subjectId = opts.subjectId ?? null;
  // Bucket width first: it decides the series span, and the windows must cover
  // exactly the span the bars cover so the totals reconcile with the chart.
  const width = bucketDays(range);
  const count = Math.ceil(range / width);
  const { current, previous } = windows(count * width);

  const [profile, subjects, topics, assignments] = await Promise.all([
    ensureProfile(userId),
    db.select().from(s.subjects).where(eq(s.subjects.userId, userId)),
    db.select().from(s.topics).where(eq(s.topics.userId, userId)),
    db.select().from(s.assignments).where(eq(s.assignments.userId, userId)),
  ]);

  const [allSessions, allAttempts, allXp] = await Promise.all([
    db
      .select()
      .from(s.studySessions)
      .where(and(eq(s.studySessions.userId, userId), gte(s.studySessions.createdAt, previous.from))),
    db
      .select()
      .from(s.quizAttempts)
      .where(and(eq(s.quizAttempts.userId, userId), gte(s.quizAttempts.createdAt, previous.from))),
    db.select().from(s.xpEvents).where(and(eq(s.xpEvents.userId, userId), gte(s.xpEvents.createdAt, previous.from))),
  ]);

  const inScope = <T extends { subjectId: string | null }>(rows: T[]) =>
    subjectId ? rows.filter((r) => r.subjectId === subjectId) : rows;
  const within = <T extends { createdAt: Date }>(rows: T[], w: Window) =>
    rows.filter((r) => r.createdAt >= w.from && r.createdAt < w.to);

  const sessions = inScope(allSessions);
  const attempts = inScope(allAttempts);

  /**
   * XP events carry no subject, so a subject-scoped view falls back to the XP
   * the sessions themselves earned. Slightly narrower than the global figure by
   * design — it is the only attribution that is actually true per subject.
   */
  const xpIn = (w: Window, scoped: Session[]) =>
    subjectId
      ? within(scoped, w).reduce((a, b) => a + b.xpEarned, 0)
      : within(allXp as XpEvent[], w).reduce((a, b) => a + b.amount, 0);

  const curSessions = within(sessions, current);
  const curAttempts = within(attempts, current);
  const prevSessions = within(sessions, previous);
  const prevAttempts = within(attempts, previous);

  // Series buckets, oldest first, on the same calendar-day grid as the windows.
  const series: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const from = new Date(current.to.getTime() - (i + 1) * width * DAY);
    const to = new Date(current.to.getTime() - i * width * DAY);
    const bs = curSessions.filter((x) => x.createdAt >= from && x.createdAt < to);
    const ba = curAttempts.filter((x) => x.createdAt >= from && x.createdAt < to);
    const bxp = subjectId
      ? bs.reduce((a, b) => a + b.xpEarned, 0)
      : allXp.filter((x) => x.createdAt >= from && x.createdAt < to).reduce((a, b) => a + b.amount, 0);
    series.push({
      key: dayKey(from),
      label:
        width === 1
          ? from.toLocaleDateString("en", range === 7 ? { weekday: "short" } : { day: "numeric", month: "short" })
          : `${from.toLocaleDateString("en", { day: "numeric", month: "short" })}`,
      minutes: Math.round(bs.reduce((a, b) => a + b.durationSec, 0) / 60),
      xp: bxp,
      quizzes: ba.length,
      score: ba.length ? Math.round(ba.reduce((a, b) => a + b.score, 0) / ba.length) : null,
    });
  }

  const subjectName = new Map(subjects.map((x) => [x.id, x.name]));
  const subjectMastery = subjects.map((sub) => {
    const st = topics.filter((t) => t.subjectId === sub.id);
    return {
      id: sub.id,
      name: sub.name,
      color: sub.color,
      mastery: st.length ? Math.round(st.reduce((a, b) => a + b.mastery, 0) / st.length) : 0,
      topics: st.length,
    };
  });

  const scopedTopics = subjectId ? topics.filter((t) => t.subjectId === subjectId) : topics;
  const weakTopics = [...scopedTopics]
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 5)
    .map((t) => ({ id: t.id, name: t.name, subject: subjectName.get(t.subjectId) ?? "—", mastery: t.mastery }));

  const studiedMap = new Map<string, number>();
  for (const se of curSessions) {
    const label = se.concept || (se.topicId ? topics.find((t) => t.id === se.topicId)?.name : null);
    if (!label) continue;
    studiedMap.set(label, (studiedMap.get(label) ?? 0) + Math.round(se.durationSec / 60));
  }
  const studiedTopics = [...studiedMap.entries()]
    .map(([name, minutes]) => ({ name, minutes }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  const upcoming = assignments
    .filter((a) => a.status !== "done" && (!subjectId || a.subjectId === subjectId))
    .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity))
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      title: a.title,
      dueDate: a.dueDate,
      subject: a.subjectId ? (subjectName.get(a.subjectId) ?? null) : null,
    }));

  return {
    range,
    subjectId,
    bucketDays: width,
    current: metricsFor(curSessions, curAttempts, xpIn(current, sessions)),
    previous: metricsFor(prevSessions, prevAttempts, xpIn(previous, sessions)),
    series,
    subjectMastery,
    weakTopics,
    studiedTopics,
    upcoming,
    readiness: scopedTopics.length
      ? Math.round(scopedTopics.reduce((a, b) => a + b.mastery, 0) / scopedTopics.length)
      : 0,
    streak: profile.streak,
    level: profile.level,
    totalXp: profile.xp,
  };
}

function delta(cur: number, prev: number) {
  const d = cur - prev;
  return d > 0 ? `up ${d}` : d < 0 ? `down ${Math.abs(d)}` : "flat";
}

/**
 * Renders the same numbers the charts show into the prose the model reads. Both
 * sides of the product therefore describe one identical reality — the whole point
 * of computing this once.
 */
export function statsToPrompt(stats: StudyStats, subjectLabel: string | null): string {
  const c = stats.current;
  const p = stats.previous;
  const scope = subjectLabel ? `Subject in focus: ${subjectLabel}.` : "Scope: all subjects.";
  const lines = [
    `Window: last ${stats.range} days, compared against the ${stats.range} days before it.`,
    scope,
    `Level ${stats.level}, ${stats.totalXp} XP total, ${stats.streak}-day streak, exam readiness ${stats.readiness}%.`,
    `Focus sessions: ${c.sessions} (previously ${p.sessions}, ${delta(c.sessions, p.sessions)}).`,
    `Study minutes: ${c.minutes} (previously ${p.minutes}, ${delta(c.minutes, p.minutes)}).`,
    `Average focus score: ${c.avgFocus}% (previously ${p.avgFocus}%, ${delta(c.avgFocus, p.avgFocus)}).`,
    `Average session length: ${c.avgDuration} min (previously ${p.avgDuration} min).`,
    `Quizzes taken: ${c.quizzes} (previously ${p.quizzes}).`,
    `Average quiz score: ${c.avgScore === null ? "no quizzes in this window" : `${c.avgScore}%`}` +
      (p.avgScore === null ? " (no comparison available)." : ` (previously ${p.avgScore}%).`),
    `Active days: ${c.activeDays} of ${stats.range} (previously ${p.activeDays}).`,
    `Learning velocity: ${c.velocity} XP per active day (previously ${p.velocity}).`,
    c.bestHour === null
      ? "Most productive hour: not enough data."
      : `Most productive hour: ${c.bestHour}:00.`,
    `Weakest concepts: ${
      stats.weakTopics.length
        ? stats.weakTopics.map((t) => `${t.name} (${t.subject}, ${t.mastery}% mastery)`).join("; ")
        : "no concepts added yet"
    }.`,
    `Subject mastery: ${
      stats.subjectMastery.length
        ? stats.subjectMastery.map((x) => `${x.name} ${x.mastery}% over ${x.topics} concepts`).join("; ")
        : "no subjects yet"
    }.`,
    `Actually studied in this window: ${
      stats.studiedTopics.length
        ? stats.studiedTopics.map((t) => `${t.name} (${t.minutes} min)`).join("; ")
        : "nothing logged"
    }.`,
    `Upcoming assignments: ${
      stats.upcoming.length
        ? stats.upcoming
            .map((a) => `${a.title}${a.dueDate ? ` due ${a.dueDate.toISOString().slice(0, 10)}` : ""}`)
            .join("; ")
        : "none"
    }.`,
  ];
  return lines.join("\n");
}

/**
 * The rows behind one point on a chart. Clicking a bar should answer "what did I
 * actually do that day", so this returns the real sessions, attempts and concepts
 * rather than the aggregate the chart already showed.
 */
export async function drilldown(
  userId: string,
  opts: { key: string; bucketDays: number; subjectId?: string | null },
) {
  const from = new Date(`${opts.key}T00:00:00.000Z`);
  const to = new Date(from.getTime() + Math.max(1, opts.bucketDays) * DAY);
  const subjectId = opts.subjectId ?? null;

  const [sessions, attempts, subjects, topics] = await Promise.all([
    db
      .select()
      .from(s.studySessions)
      .where(
        and(
          eq(s.studySessions.userId, userId),
          gte(s.studySessions.createdAt, from),
          lt(s.studySessions.createdAt, to),
        ),
      ),
    db
      .select()
      .from(s.quizAttempts)
      .where(
        and(eq(s.quizAttempts.userId, userId), gte(s.quizAttempts.createdAt, from), lt(s.quizAttempts.createdAt, to)),
      ),
    db.select().from(s.subjects).where(eq(s.subjects.userId, userId)),
    db.select().from(s.topics).where(eq(s.topics.userId, userId)),
  ]);

  const subjectName = new Map(subjects.map((x) => [x.id, x.name]));
  const topicName = new Map(topics.map((x) => [x.id, x.name]));
  const scoped = <T extends { subjectId: string | null }>(rows: T[]) =>
    subjectId ? rows.filter((r) => r.subjectId === subjectId) : rows;

  const ss = scoped(sessions);
  const aa = scoped(attempts);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    sessions: ss.map((x) => ({
      id: x.id,
      at: x.createdAt,
      minutes: Math.round(x.durationSec / 60),
      focusScore: x.focusScore,
      mode: x.mode,
      concept: x.concept || (x.topicId ? (topicName.get(x.topicId) ?? null) : null),
      subject: x.subjectId ? (subjectName.get(x.subjectId) ?? null) : null,
    })),
    attempts: aa.map((x) => ({
      id: x.id,
      quizId: x.quizId,
      at: x.createdAt,
      score: x.score,
      correct: x.correct,
      total: x.total,
      topic: x.topicId ? (topicName.get(x.topicId) ?? null) : null,
      subject: x.subjectId ? (subjectName.get(x.subjectId) ?? null) : null,
    })),
    totals: {
      minutes: Math.round(ss.reduce((a, b) => a + b.durationSec, 0) / 60),
      sessions: ss.length,
      quizzes: aa.length,
      avgScore: aa.length ? Math.round(aa.reduce((a, b) => a + b.score, 0) / aa.length) : null,
    },
  };
}
