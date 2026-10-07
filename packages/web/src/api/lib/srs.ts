/**
 * Spaced repetition scheduling (SM-2, lightly simplified).
 *
 * Before this, a "spaced repetition" deck had no notion of *when* a card was
 * next owed — `ease` was just a counter used to sort the pile, so every session
 * showed every card. This decides the actual next due date.
 *
 * Grades follow the Anki convention:
 *   again → you failed, reset the interval and see it again today
 *   hard  → recalled with effort, small growth
 *   good  → recalled normally, standard growth
 *   easy  → trivial, bigger growth
 */
export type Grade = "again" | "hard" | "good" | "easy";

export const GRADES: Grade[] = ["again", "hard", "good", "easy"];

/** SM-2 quality score per grade (0-5 scale). */
const QUALITY: Record<Grade, number> = { again: 1, hard: 3, good: 4, easy: 5 };

export const DEFAULT_EASE_FACTOR = 2.5;
const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 3.2;
/** Cap growth so a long-lived card doesn't disappear for years. */
const MAX_INTERVAL_DAYS = 365;
/** Lapsed cards come back inside the same session rather than tomorrow. */
const RELEARN_MINUTES = 10;

export interface SrsState {
  /** Days until the next review. 0 means "still learning, due today". */
  interval: number;
  /** SM-2 ease factor, multiplier applied to the interval on success. */
  easeFactor: number;
  /** Consecutive successful reviews. Reset to 0 on a lapse. */
  reps: number;
  /** Total number of times this card has been failed. */
  lapses: number;
}

export interface SrsResult extends SrsState {
  dueAt: Date;
  /** True when the card was failed and needs relearning. */
  lapsed: boolean;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Compute the next state for a card given how well it was recalled.
 * `now` is injectable so tests don't depend on the wall clock.
 */
export function schedule(state: SrsState, grade: Grade, now: Date = new Date()): SrsResult {
  const q = QUALITY[grade];
  // SM-2 ease adjustment.
  const easeFactor = clamp(
    state.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
    MIN_EASE_FACTOR,
    MAX_EASE_FACTOR,
  );

  if (grade === "again") {
    return {
      interval: 0,
      easeFactor,
      reps: 0,
      lapses: state.lapses + 1,
      dueAt: new Date(now.getTime() + RELEARN_MINUTES * 60_000),
      lapsed: true,
    };
  }

  const reps = state.reps + 1;
  let interval: number;
  if (reps === 1) {
    // First success: tomorrow, or later today if it was easy… no — a same-day
    // repeat teaches nothing, so the shortest graduating interval is 1 day.
    interval = grade === "easy" ? 3 : 1;
  } else if (reps === 2) {
    interval = grade === "hard" ? 3 : grade === "easy" ? 8 : 6;
  } else {
    const multiplier = grade === "hard" ? 1.2 : grade === "easy" ? easeFactor * 1.3 : easeFactor;
    interval = Math.max(state.interval, 1) * multiplier;
  }

  interval = clamp(Math.round(interval), 1, MAX_INTERVAL_DAYS);

  return {
    interval,
    easeFactor,
    reps,
    lapses: state.lapses,
    dueAt: new Date(now.getTime() + interval * 86_400_000),
    lapsed: false,
  };
}

/** A card with no due date has never been reviewed — it's due immediately. */
export function isDue(dueAt: Date | null | undefined, now: Date = new Date()) {
  if (!dueAt) return true;
  return dueAt.getTime() <= now.getTime();
}

/** Human-readable "next review" copy for the UI. */
export function formatInterval(days: number) {
  if (days <= 0) return "later today";
  if (days === 1) return "tomorrow";
  if (days < 30) return `in ${days} days`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return `in ${months} month${months === 1 ? "" : "s"}`;
  }
  const years = Math.round((days / 365) * 10) / 10;
  return `in ${years} year${years === 1 ? "" : "s"}`;
}
