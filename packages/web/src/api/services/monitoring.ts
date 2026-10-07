import { desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

/**
 * Self-hosted error monitoring.
 *
 * Deliberately no third-party service: OrbitL handles student data, so shipping
 * stack traces (which routinely contain user ids and query values) to an
 * external vendor would widen the privacy surface and add another account to
 * keep alive. Errors land in the `error_logs` table and are read back from the
 * admin dashboard.
 *
 * Rows are deduped by fingerprint. Without that, one broken page in a loop
 * fills the table and buries every other fault; with it, a repeat bumps a
 * counter and a timestamp instead.
 */

export type ErrorSource = "api" | "rpc" | "web" | "job";

export interface LogErrorInput {
  level?: "error" | "warn";
  source: ErrorSource;
  message: string;
  stack?: string | null;
  path?: string | null;
  userId?: string | null;
  userAgent?: string | null;
  /** Overrides the default fingerprint when the message alone is too noisy. */
  fingerprintSeed?: string;
}

/** Truncation ceilings — a hostile client could otherwise post megabytes. */
const MAX_MESSAGE = 1000;
const MAX_STACK = 4000;
const MAX_PATH = 300;
const MAX_UA = 300;

function clamp(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Groups repeats of the same fault. Digits and UUIDs are stripped so that
 * "user abc123 not found" and "user def456 not found" collapse into one row
 * rather than thousands.
 */
function fingerprintOf(input: LogErrorInput): string {
  const seed =
    input.fingerprintSeed ??
    `${input.source}|${input.path ?? ""}|${input.message}`
      .toLowerCase()
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>")
      .replace(/\d{2,}/g, "<n>");
  return seed.slice(0, 200);
}

/**
 * Records an error. Never throws — monitoring that can break the request it is
 * monitoring is worse than no monitoring at all.
 */
export async function logError(input: LogErrorInput): Promise<void> {
  try {
    const message = clamp(input.message, MAX_MESSAGE) ?? "Unknown error";
    const fingerprint = fingerprintOf({ ...input, message });
    const now = new Date();

    const [existing] = await db
      .select({ id: schema.errorLogs.id })
      .from(schema.errorLogs)
      .where(eq(schema.errorLogs.fingerprint, fingerprint))
      .limit(1);

    if (existing) {
      await db
        .update(schema.errorLogs)
        .set({
          count: sql`${schema.errorLogs.count} + 1`,
          lastSeenAt: now,
          // Keep the newest context; the latest occurrence is the useful one.
          message,
          stack: clamp(input.stack, MAX_STACK),
          path: clamp(input.path, MAX_PATH),
          userId: input.userId ?? null,
          userAgent: clamp(input.userAgent, MAX_UA),
        })
        .where(eq(schema.errorLogs.id, existing.id));
      return;
    }

    await db.insert(schema.errorLogs).values({
      level: input.level ?? "error",
      source: input.source,
      message,
      stack: clamp(input.stack, MAX_STACK),
      path: clamp(input.path, MAX_PATH),
      userId: input.userId ?? null,
      userAgent: clamp(input.userAgent, MAX_UA),
      fingerprint,
      count: 1,
      lastSeenAt: now,
      createdAt: now,
    });
  } catch (err) {
    // Last resort: the process log. Swallow so the caller is unaffected.
    console.error("[monitoring] failed to record error:", input.message, err);
  }
}

/** Normalises an unknown thrown value into loggable fields. */
export function describeThrown(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message || err.name, stack: err.stack };
  if (typeof err === "string") return { message: err };
  try {
    return { message: JSON.stringify(err).slice(0, MAX_MESSAGE) };
  } catch {
    return { message: "Non-serialisable error" };
  }
}

/** Most recent distinct faults, newest first. Powers the admin dashboard. */
export async function recentErrors(limit = 50) {
  return db.select().from(schema.errorLogs).orderBy(desc(schema.errorLogs.lastSeenAt)).limit(Math.min(limit, 200));
}

/** Counts for the admin summary cards. */
export async function errorSummary() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [all] = await db
    .select({ groups: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${schema.errorLogs.count}), 0)` })
    .from(schema.errorLogs);
  const [recent] = await db
    .select({ groups: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${schema.errorLogs.count}), 0)` })
    .from(schema.errorLogs)
    .where(gte(schema.errorLogs.lastSeenAt, dayAgo));
  return {
    groups: Number(all?.groups ?? 0),
    total: Number(all?.total ?? 0),
    last24hGroups: Number(recent?.groups ?? 0),
    last24hTotal: Number(recent?.total ?? 0),
  };
}

/** Clears one fault group, or all of them. Used by the admin dashboard. */
export async function clearErrors(id?: string) {
  if (id) {
    await db.delete(schema.errorLogs).where(eq(schema.errorLogs.id, id));
    return { cleared: 1 };
  }
  await db.delete(schema.errorLogs);
  return { cleared: -1 };
}

/**
 * Drops resolved noise older than `days`. Called by the scheduled cleanup job so
 * the table cannot grow forever on a long-running deployment.
 */
export async function pruneErrors(days = 30): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const res = (await db.delete(schema.errorLogs).where(lt(schema.errorLogs.lastSeenAt, cutoff))) as {
    rowsAffected?: number;
  };
  return res?.rowsAffected ?? 0;
}

/**
 * Health snapshot for uptime pings. Reports a real database round-trip rather
 * than just "the process is alive", because a running process with a dead
 * database is exactly the outage worth paging about.
 */
const bootedAt = Date.now();

export async function healthSnapshot() {
  const startedAt = Date.now();
  let database: "ok" | "down" = "ok";
  let error: string | null = null;
  try {
    await db.all(sql`SELECT 1`);
  } catch (err) {
    database = "down";
    error = describeThrown(err).message;
  }
  return {
    status: database === "ok" ? ("ok" as const) : ("degraded" as const),
    database,
    error,
    latencyMs: Date.now() - startedAt,
    uptimeSec: Math.floor((Date.now() - bootedAt) / 1000),
    time: new Date().toISOString(),
  };
}

/** Job history for the admin dashboard. */
export async function jobStatus() {
  return db.select().from(schema.jobRuns).orderBy(desc(schema.jobRuns.lastRunAt));
}
