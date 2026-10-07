import { describe, expect, test } from "bun:test";
import { AI_BURST_LIMIT, AI_LIMITS, consumeAiQuota, hit } from "./rate-limit";

/**
 * `hit` now writes to the shared `rate_limits` table, so every test uses a
 * unique key. That keeps runs independent of each other and of whatever rows a
 * previous run left behind.
 */
const uniq = (p: string) => `${p}:${Math.random().toString(36).slice(2)}`;

describe("hit", () => {
  test("allows up to the limit then blocks", async () => {
    const key = uniq("t");
    const limit = { limit: 3, windowMs: 60_000 };
    expect(await hit(key, limit)).toMatchObject({ ok: true, remaining: 2 });
    expect(await hit(key, limit)).toMatchObject({ ok: true, remaining: 1 });
    expect(await hit(key, limit)).toMatchObject({ ok: true, remaining: 0 });
    const blocked = await hit(key, limit);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  test("keys are independent", async () => {
    const limit = { limit: 1, windowMs: 60_000 };
    const a = uniq("a");
    const b = uniq("b");
    expect((await hit(a, limit)).ok).toBe(true);
    expect((await hit(a, limit)).ok).toBe(false);
    expect((await hit(b, limit)).ok).toBe(true);
  });

  test("window expiry resets the counter", async () => {
    // The stored window is second-granular, so an already-expired window is
    // simulated with a zero-length one rather than by sleeping a full second.
    const key = uniq("exp");
    const limit = { limit: 1, windowMs: 0 };
    expect((await hit(key, limit)).ok).toBe(true);
    // Previous window already elapsed, so the counter restarts instead of blocking.
    expect((await hit(key, limit)).ok).toBe(true);
  });

  test("resetAt stays fixed within one window", async () => {
    const key = uniq("fix");
    const limit = { limit: 5, windowMs: 60_000 };
    const first = await hit(key, limit);
    const second = await hit(key, limit);
    expect(second.resetAt).toBe(first.resetAt);
  });
});

describe("consumeAiQuota", () => {
  test("throws TOO_MANY_REQUESTS once a bucket is exhausted", async () => {
    const uid = uniq("user");
    const budget = AI_LIMITS.coach.limit;
    // Seed only the hourly bucket so this test doesn't exhaust the burst gate.
    for (let i = 0; i < budget; i++) await hit(`ai:coach:${uid}`, AI_LIMITS.coach);

    let thrown: unknown;
    try {
      await consumeAiQuota(uid, "coach");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    const e = thrown as { code?: string; message?: string; data?: { retryAfterSec?: number } };
    expect(e.code).toBe("TOO_MANY_REQUESTS");
    expect(e.message).toContain("AI usage limit");
    expect(e.data?.retryAfterSec).toBeGreaterThan(0);
  }, 60_000);

  test("buckets are isolated per user and per feature", async () => {
    const uid = uniq("user");
    for (let i = 0; i < AI_LIMITS.coach.limit; i++) await hit(`ai:coach:${uid}`, AI_LIMITS.coach);
    await expect(consumeAiQuota(uid, "coach")).rejects.toThrow();
    // Same user, different feature — still allowed.
    expect((await consumeAiQuota(uid, "generate")).ok).toBe(true);
    // Different user, same feature — still allowed.
    expect((await consumeAiQuota(uniq("other"), "coach")).ok).toBe(true);
  }, 60_000);

  test("every bucket has a positive hourly budget", () => {
    for (const [name, cfg] of Object.entries(AI_LIMITS)) {
      expect(cfg.limit, name).toBeGreaterThan(0);
      expect(cfg.windowMs, name).toBeGreaterThan(0);
    }
  });

  test("multiple same-day actions are allowed; switching features cannot bypass burst protection", async () => {
    const uid = uniq("burst");
    const buckets = ["generate", "coach", "upload"] as const;
    for (let i = 0; i < AI_BURST_LIMIT.limit; i++) {
      expect((await consumeAiQuota(uid, buckets[i % buckets.length])).ok).toBe(true);
    }
    try {
      await consumeAiQuota(uid, "upload");
      throw new Error("Expected burst rejection");
    } catch (err) {
      const e = err as { code: string; message: string; data: { rateLimit: string; retryAfterSec: number } };
      expect(e.code).toBe("TOO_MANY_REQUESTS");
      expect(e.data.rateLimit).toBe("burst");
      expect(e.data.retryAfterSec).toBeGreaterThan(0);
      expect(e.message).toContain("no daily request limit");
    }
    expect((await consumeAiQuota(uniq("other"), "upload")).ok).toBe(true);
  });
});
