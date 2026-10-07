import { describe, expect, test } from "bun:test";
import { DEFAULT_EASE_FACTOR, formatInterval, isDue, schedule, type SrsState } from "./srs";

const NOW = new Date("2026-03-01T10:00:00.000Z");
const fresh = (): SrsState => ({ interval: 0, easeFactor: DEFAULT_EASE_FACTOR, reps: 0, lapses: 0 });

const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

describe("schedule", () => {
  test("first 'good' graduates to tomorrow", () => {
    const r = schedule(fresh(), "good", NOW);
    expect(r.interval).toBe(1);
    expect(r.reps).toBe(1);
    expect(r.lapsed).toBe(false);
    expect(daysBetween(NOW, r.dueAt)).toBe(1);
  });

  test("first 'easy' graduates further out than 'good'", () => {
    expect(schedule(fresh(), "easy", NOW).interval).toBeGreaterThan(schedule(fresh(), "good", NOW).interval);
  });

  test("'again' relearns in 10 minutes and counts a lapse", () => {
    const r = schedule({ interval: 21, easeFactor: 2.5, reps: 4, lapses: 1 }, "again", NOW);
    expect(r.interval).toBe(0);
    expect(r.reps).toBe(0);
    expect(r.lapses).toBe(2);
    expect(r.lapsed).toBe(true);
    expect(r.dueAt.getTime() - NOW.getTime()).toBe(10 * 60_000);
  });

  test("'again' lowers the ease factor, 'easy' raises it", () => {
    const base = fresh();
    expect(schedule(base, "again", NOW).easeFactor).toBeLessThan(base.easeFactor);
    expect(schedule(base, "easy", NOW).easeFactor).toBeGreaterThan(base.easeFactor);
  });

  test("ease factor is clamped to the 1.3-3.2 band", () => {
    let state: SrsState = { interval: 1, easeFactor: 1.35, reps: 1, lapses: 0 };
    for (let i = 0; i < 10; i++) state = schedule(state, "again", NOW);
    expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);

    let up: SrsState = { interval: 1, easeFactor: 3.1, reps: 1, lapses: 0 };
    for (let i = 0; i < 10; i++) up = schedule(up, "easy", NOW);
    expect(up.easeFactor).toBeLessThanOrEqual(3.2);
  });

  test("intervals grow monotonically across repeated 'good' answers", () => {
    let state: SrsState = fresh();
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      state = schedule(state, "good", NOW);
      seen.push(state.interval);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThan(seen[i - 1]!);
  });

  test("interval never exceeds 365 days", () => {
    let state: SrsState = { interval: 300, easeFactor: 3.2, reps: 20, lapses: 0 };
    for (let i = 0; i < 5; i++) state = schedule(state, "easy", NOW);
    expect(state.interval).toBe(365);
  });

  test("'hard' grows slower than 'good' on a mature card", () => {
    const mature: SrsState = { interval: 20, easeFactor: 2.5, reps: 5, lapses: 0 };
    expect(schedule(mature, "hard", NOW).interval).toBeLessThan(schedule(mature, "good", NOW).interval);
  });

  test("dueAt always matches the returned interval", () => {
    const r = schedule({ interval: 10, easeFactor: 2.5, reps: 3, lapses: 0 }, "good", NOW);
    expect(daysBetween(NOW, r.dueAt)).toBe(r.interval);
  });
});

describe("isDue", () => {
  test("never-reviewed cards are due", () => {
    expect(isDue(null, NOW)).toBe(true);
    expect(isDue(undefined, NOW)).toBe(true);
  });

  test("past and exact-now due dates are due, future ones are not", () => {
    expect(isDue(new Date(NOW.getTime() - 1), NOW)).toBe(true);
    expect(isDue(new Date(NOW.getTime()), NOW)).toBe(true);
    expect(isDue(new Date(NOW.getTime() + 1), NOW)).toBe(false);
  });
});

describe("formatInterval", () => {
  test("renders human copy for each range", () => {
    expect(formatInterval(0)).toBe("later today");
    expect(formatInterval(1)).toBe("tomorrow");
    expect(formatInterval(8)).toBe("in 8 days");
    expect(formatInterval(30)).toBe("in 1 month");
    expect(formatInterval(90)).toBe("in 3 months");
    expect(formatInterval(365)).toBe("in 1 year");
  });
});
