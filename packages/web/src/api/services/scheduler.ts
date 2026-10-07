import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { sweepRateLimits } from "../lib/rate-limit";
import { runBackup } from "./backup";
import { describeThrown, logError, pruneErrors } from "./monitoring";
import { runStreakReminders } from "./reminders";

/**
 * In-process job scheduler.
 *
 * The app previously relied entirely on an external scheduler hitting
 * `/api/cron/*`. Those routes still work — they are the escape hatch and the way
 * to force a run — but relying on them alone meant that if nobody configured the
 * external cron, nothing ran at all and the failure was silent.
 *
 * Two problems this has to solve:
 *
 * 1. **Restarts.** A plain `setInterval` loses its place on every deploy, so a
 *    daily job could be skipped forever if deploys happened around the same time.
 *    Due-ness is therefore computed from `job_runs.last_run_at` in the database,
 *    not from process uptime.
 * 2. **Multiple instances.** Two servers would otherwise both fire the nightly
 *    backup. A job is claimed with a conditional UPDATE that only succeeds for
 *    one caller, so exactly one instance runs it.
 */

type JobHandler = () => Promise<unknown>;

interface Job {
  name: string;
  /** Minimum gap between runs, in minutes. */
  everyMinutes: number;
  run: JobHandler;
}

/** A claim older than this is treated as a crashed run and may be re-claimed. */
const STALE_CLAIM_MINUTES = 30;
/** How often the loop wakes up to look for due work. */
const TICK_MS = 5 * 60 * 1000;
const DAILY = 24 * 60;

const JOBS: Job[] = [
  {
    name: "streak-reminders",
    everyMinutes: DAILY,
    run: async () => {
      const res = await runStreakReminders({});
      return res;
    },
  },
  {
    name: "db-backup",
    everyMinutes: DAILY,
    run: async () => runBackup(),
  },
  {
    name: "cleanup",
    everyMinutes: DAILY,
    run: async () => {
      const sweptLimits = await sweepRateLimits();
      const prunedErrors = await pruneErrors(30);
      return { sweptLimits, prunedErrors };
    },
  },
];

export const jobNames = JOBS.map((j) => j.name);

/**
 * Attempts to claim a job. Returns true only for the caller that won, so the
 * work runs once even with several instances ticking at the same moment.
 */
async function claim(job: Job, now: Date): Promise<boolean> {
  const dueBefore = new Date(now.getTime() - job.everyMinutes * 60 * 1000);
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MINUTES * 60 * 1000);

  // Ensure a row exists; ignore the conflict if another instance created it first.
  await db
    .insert(schema.jobRuns)
    .values({ name: job.name, lastStatus: null })
    .onConflictDoNothing({ target: schema.jobRuns.name });

  const res = (await db
    .update(schema.jobRuns)
    .set({ runningSince: now, lastRunAt: now, lastStatus: "running" })
    .where(
      and(
        eq(schema.jobRuns.name, job.name),
        // Not already claimed by a live run…
        or(isNull(schema.jobRuns.runningSince), lt(schema.jobRuns.runningSince, staleBefore)),
        // …and actually due.
        or(isNull(schema.jobRuns.lastFinishedAt), lt(schema.jobRuns.lastFinishedAt, dueBefore)),
      ),
    )) as { rowsAffected?: number };

  return (res?.rowsAffected ?? 0) > 0;
}

async function finish(name: string, status: "ok" | "error", detail: string) {
  await db
    .update(schema.jobRuns)
    .set({
      runningSince: null,
      lastFinishedAt: new Date(),
      lastStatus: status,
      lastDetail: detail.slice(0, 500),
    })
    .where(eq(schema.jobRuns.name, name));
}

/** Runs one job now, bypassing the due check. Used by the admin "run now" button. */
export async function runJobNow(name: string) {
  const job = JOBS.find((j) => j.name === name);
  if (!job) throw new Error(`Unknown job: ${name}`);

  const now = new Date();
  await db
    .insert(schema.jobRuns)
    .values({ name: job.name, lastRunAt: now, runningSince: now, lastStatus: "running" })
    .onConflictDoUpdate({
      target: schema.jobRuns.name,
      set: { lastRunAt: now, runningSince: now, lastStatus: "running" },
    });

  try {
    const result = await job.run();
    await finish(job.name, "ok", JSON.stringify(result ?? {}));
    return { ok: true as const, name: job.name, result };
  } catch (err) {
    const { message, stack } = describeThrown(err);
    await finish(job.name, "error", message);
    await logError({ source: "job", message: `Job ${job.name} failed: ${message}`, stack, path: `job:${job.name}` });
    return { ok: false as const, name: job.name, error: message };
  }
}

async function tick() {
  const now = new Date();
  for (const job of JOBS) {
    try {
      if (!(await claim(job, now))) continue;
      try {
        const result = await job.run();
        await finish(job.name, "ok", JSON.stringify(result ?? {}));
        console.log(`[scheduler] ${job.name} ok`);
      } catch (err) {
        const { message, stack } = describeThrown(err);
        await finish(job.name, "error", message);
        await logError({
          source: "job",
          message: `Job ${job.name} failed: ${message}`,
          stack,
          path: `job:${job.name}`,
        });
      }
    } catch (err) {
      // Claiming itself failed (database blip). Skip this job this tick.
      console.error(`[scheduler] could not claim ${job.name}:`, err);
    }
  }
}

let started = false;

/**
 * Starts the loop. Safe to call more than once — Vite reloads the API module in
 * dev, and a second timer would double every job.
 */
export function startScheduler() {
  if (started) return;
  // Nothing to schedule during tests or one-off scripts.
  if (process.env.ORBITL_DISABLE_SCHEDULER === "1") return;
  started = true;

  // A short delay keeps startup fast and avoids a thundering herd of instances
  // all ticking the instant they boot.
  setTimeout(() => {
    void tick();
    const timer = setInterval(() => void tick(), TICK_MS);
    // Don't hold the process open just for the scheduler.
    if (typeof timer.unref === "function") timer.unref();
  }, 30_000).unref?.();

  console.log("[scheduler] started");
}

/** Current job rows, for the admin dashboard. */
export async function schedulerStatus() {
  const rows = await db.select().from(schema.jobRuns);
  const byName = new Map(rows.map((r) => [r.name, r]));
  return JOBS.map((j) => {
    const row = byName.get(j.name);
    return {
      name: j.name,
      everyMinutes: j.everyMinutes,
      lastRunAt: row?.lastRunAt ?? null,
      lastFinishedAt: row?.lastFinishedAt ?? null,
      lastStatus: row?.lastStatus ?? null,
      lastDetail: row?.lastDetail ?? null,
      running: Boolean(row?.runningSince),
    };
  });
}

/** Convenience for the CLI backup script. */
export async function backupFromCli() {
  const res = await runJobNow("db-backup");
  return res;
}
