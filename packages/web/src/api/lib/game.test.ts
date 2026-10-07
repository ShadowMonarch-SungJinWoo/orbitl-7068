import { afterAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { awardXp, ensureProfile, levelForXp, xpForLevel } from "./game";

/**
 * XP, level and streak math is the one place where a silent regression would
 * quietly lie to every user, so it gets a real regression net.
 *
 * `game_profiles.user_id` is a bare text primary key (no FK), so these tests use
 * synthetic ids and clean up after themselves. No AI gateway involved.
 */

const ids: string[] = [];
const newUser = () => {
  const id = `test-${crypto.randomUUID()}`;
  ids.push(id);
  return id;
};

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

afterAll(async () => {
  if (!ids.length) return;
  await db.delete(s.xpEvents).where(inArray(s.xpEvents.userId, ids));
  await db.delete(s.achievements).where(inArray(s.achievements.userId, ids));
  await db.delete(s.gameProfiles).where(inArray(s.gameProfiles.userId, ids));
});

describe("levelForXp", () => {
  test("500 XP per level, starting at level 1", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(499)).toBe(1);
    expect(levelForXp(500)).toBe(2);
    expect(levelForXp(1499)).toBe(3);
    expect(levelForXp(5000)).toBe(11);
  });

  test("xpForLevel is the inverse boundary", () => {
    for (const lvl of [1, 2, 5, 10, 25]) {
      expect(levelForXp(xpForLevel(lvl))).toBe(lvl);
      if (lvl > 1) expect(levelForXp(xpForLevel(lvl) - 1)).toBe(lvl - 1);
    }
  });
});

describe("ensureProfile", () => {
  test("creates a zeroed profile on first call and is idempotent", async () => {
    const uid = newUser();
    const p = await ensureProfile(uid);
    expect(p.xp).toBe(0);
    expect(p.level).toBe(1);
    expect(p.streak).toBe(0);
    const again = await ensureProfile(uid);
    expect(again.userId).toBe(uid);
  });

  test("expires a streak when the last study day is older than yesterday", async () => {
    const uid = newUser();
    await ensureProfile(uid);
    await db
      .update(s.gameProfiles)
      .set({ streak: 9, longestStreak: 9, lastActiveDate: day(-3) })
      .where(eq(s.gameProfiles.userId, uid));

    const p = await ensureProfile(uid);
    expect(p.streak).toBe(0);
    const [row] = await db.select().from(s.gameProfiles).where(eq(s.gameProfiles.userId, uid));
    expect(row!.streak).toBe(0);
    // Longest streak is history — it must survive the expiry.
    expect(row!.longestStreak).toBe(9);
  });

  test("keeps a streak alive when the last study day was yesterday", async () => {
    const uid = newUser();
    await ensureProfile(uid);
    await db
      .update(s.gameProfiles)
      .set({ streak: 4, longestStreak: 4, lastActiveDate: day(-1) })
      .where(eq(s.gameProfiles.userId, uid));
    expect((await ensureProfile(uid)).streak).toBe(4);
  });
});

describe("awardXp", () => {
  test("adds XP, recomputes level and logs an event", async () => {
    const uid = newUser();
    const r = await awardXp(uid, 600, "test award");
    expect(r.xp).toBe(600);
    expect(r.level).toBe(2);
    expect(r.leveledUp).toBe(true);

    const events = await db.select().from(s.xpEvents).where(eq(s.xpEvents.userId, uid));
    expect(events.length).toBe(1);
    expect(events[0]!.amount).toBe(600);
  });

  test("XP accumulates across awards", async () => {
    const uid = newUser();
    await awardXp(uid, 100, "a");
    const r = await awardXp(uid, 50, "b");
    expect(r.xp).toBe(150);
    expect(r.level).toBe(1);
    expect(r.leveledUp).toBe(false);
  });

  test("non-study awards never move the streak", async () => {
    const uid = newUser();
    const r = await awardXp(uid, 10, "created a subject");
    expect(r.streak).toBe(0);
    const [row] = await db.select().from(s.gameProfiles).where(eq(s.gameProfiles.userId, uid));
    expect(row!.lastActiveDate).toBeNull();
  });

  test("study awards start the streak at 1", async () => {
    const uid = newUser();
    const r = await awardXp(uid, 10, "reviewed a card", { study: true });
    expect(r.streak).toBe(1);
    const [row] = await db.select().from(s.gameProfiles).where(eq(s.gameProfiles.userId, uid));
    expect(row!.lastActiveDate).toBe(day(0));
  });

  test("a second study award on the same day does not double-count", async () => {
    const uid = newUser();
    await awardXp(uid, 10, "one", { study: true });
    const r = await awardXp(uid, 10, "two", { study: true });
    expect(r.streak).toBe(1);
    expect(r.xp).toBe(20);
  });

  test("studying the day after a streak day increments it", async () => {
    const uid = newUser();
    await ensureProfile(uid);
    await db
      .update(s.gameProfiles)
      .set({ streak: 3, longestStreak: 3, lastActiveDate: day(-1) })
      .where(eq(s.gameProfiles.userId, uid));
    const r = await awardXp(uid, 10, "studied", { study: true });
    expect(r.streak).toBe(4);
    const [row] = await db.select().from(s.gameProfiles).where(eq(s.gameProfiles.userId, uid));
    expect(row!.longestStreak).toBe(4);
  });

  test("studying after a gap restarts the streak at 1 but keeps the record", async () => {
    const uid = newUser();
    await ensureProfile(uid);
    await db
      .update(s.gameProfiles)
      .set({ streak: 12, longestStreak: 12, lastActiveDate: day(-5) })
      .where(eq(s.gameProfiles.userId, uid));
    const r = await awardXp(uid, 10, "studied", { study: true });
    expect(r.streak).toBe(1);
    const [row] = await db.select().from(s.gameProfiles).where(eq(s.gameProfiles.userId, uid));
    expect(row!.longestStreak).toBe(12);
  });

  test("a zero-XP award writes no event row", async () => {
    const uid = newUser();
    await awardXp(uid, 0, "noop", { study: true });
    const events = await db.select().from(s.xpEvents).where(eq(s.xpEvents.userId, uid));
    expect(events.length).toBe(0);
  });
});
