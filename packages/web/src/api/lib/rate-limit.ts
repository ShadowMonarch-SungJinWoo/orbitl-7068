import { ORPCError } from "@orpc/server";
import { sql } from "drizzle-orm";
import { db } from "../database";

/**
 * Fixed-window rate limiting for expensive endpoints (every AI call).
 *
 * Backed by the `rate_limits` table rather than process memory. That matters for
 * two reasons in production: limits survive a deploy (an in-memory Map handed
 * every user a fresh budget on every restart, so shipping was a way to bypass
 * the limiter), and they stay correct behind more than one server instance,
 * where N instances previously meant N times the intended budget.
 *
 * The increment is a single atomic upsert, so concurrent requests cannot race
 * past the ceiling. If the database is unreachable we fall back to an in-process
 * Map: degraded (per-instance, reset on restart) but never an open door.
 */
interface Window {
  count: number;
  resetAt: number;
}

const fallback = new Map<string, Window>();

/** Drop expired windows so the fallback Map cannot grow without bound. */
function sweepFallback(now: number) {
  if (fallback.size < 500) return;
  for (const [key, w] of fallback) if (w.resetAt <= now) fallback.delete(key);
}

export interface Limit {
  /** Max requests allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Per-feature budgets. Tuned to be invisible to real studying but to stop abuse. */
export const AI_LIMITS = {
  /** Structured generation (quiz, flashcards, notes, concept explain). */
  generate: { limit: 400, windowMs: 60 * 60 * 1000 },
  /** Coach insight — cheap to trigger from the dashboard. */
  coach: { limit: 120, windowMs: 60 * 60 * 1000 },
  /** Uploads chained with generation are the most expensive single action. */
  upload: { limit: 120, windowMs: 60 * 60 * 1000 },
} satisfies Record<string, Limit>;

export type AiBucket = keyof typeof AI_LIMITS;

/** Shared across features: switching endpoints must not bypass burst protection. */
export const AI_BURST_LIMIT: Limit = { limit: 12, windowMs: 60_000 };

export interface RateResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
  /** True when the shared store was unavailable and the local fallback was used. */
  degraded?: boolean;
}

function fromCount(count: number, limit: number, resetAtSec: number, nowMs: number): RateResult {
  const resetAt = resetAtSec * 1000;
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterSec: Math.max(1, Math.ceil((resetAt - nowMs) / 1000)),
  };
}

function hitFallback(key: string, { limit, windowMs }: Limit): RateResult {
  const now = Date.now();
  sweepFallback(now);
  const existing = fallback.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    fallback.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt, retryAfterSec: Math.ceil(windowMs / 1000), degraded: true };
  }

  const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt, retryAfterSec, degraded: true };
  }
  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, resetAt: existing.resetAt, retryAfterSec, degraded: true };
}

/**
 * Records one hit against `key` and reports whether it was allowed.
 *
 * Drizzle stores `{ mode: "timestamp" }` columns as unix *seconds*, so the raw
 * SQL below deliberately works in seconds too.
 */
export async function hit(key: string, limit: Limit): Promise<RateResult> {
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const resetSec = Math.floor((nowMs + limit.windowMs) / 1000);

  try {
    // One statement: start a new window if the old one expired, otherwise
    // increment. Atomic, so parallel requests can't both slip through.
    const rows = (await db.all(sql`
      INSERT INTO rate_limits ("key", count, reset_at)
      VALUES (${key}, 1, ${resetSec})
      ON CONFLICT("key") DO UPDATE SET
        count = CASE WHEN rate_limits.reset_at <= ${nowSec} THEN 1 ELSE rate_limits.count + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at <= ${nowSec} THEN ${resetSec} ELSE rate_limits.reset_at END
      RETURNING count, reset_at
    `)) as unknown as Array<{ count: number; reset_at: number }>;

    const row = rows?.[0];
    if (!row) return hitFallback(key, limit);
    return fromCount(Number(row.count), limit.limit, Number(row.reset_at), nowMs);
  } catch (err) {
    console.error("[rate-limit] shared store unavailable, using local fallback:", err);
    return hitFallback(key, limit);
  }
}

/** Removes expired rows. Called by the scheduled cleanup job. */
export async function sweepRateLimits(): Promise<number> {
  const nowSec = Math.floor(Date.now() / 1000);
  const res = (await db.run(sql`DELETE FROM rate_limits WHERE reset_at <= ${nowSec}`)) as { rowsAffected?: number };
  return res?.rowsAffected ?? 0;
}

function minutes(sec: number) {
  const m = Math.ceil(sec / 60);
  return m <= 1 ? "a minute" : m < 60 ? `${m} minutes` : "an hour";
}

/**
 * Consumes one unit of a user's AI budget, or throws a `TOO_MANY_REQUESTS`
 * oRPC error whose message is safe to show directly in a toast.
 */
export async function consumeAiQuota(userId: string, bucket: AiBucket) {
  const burst = await hit(`ai:burst:${userId}`, AI_BURST_LIMIT);
  if (!burst.ok) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: `Too many AI requests in a short time. Wait ${burst.retryAfterSec} seconds and try again. Normal study usage is free with no daily request limit.`,
      data: { retryAfterSec: burst.retryAfterSec, rateLimit: "burst" },
    });
  }
  const result = await hit(`ai:${bucket}:${userId}`, AI_LIMITS[bucket]);
  if (!result.ok) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: `You've hit the AI usage limit for this hour's unusually high activity. Try again in ${minutes(result.retryAfterSec)}. There is no daily request limit.`,
      data: { retryAfterSec: result.retryAfterSec, rateLimit: "hourly" },
    });
  }
  return result;
}
