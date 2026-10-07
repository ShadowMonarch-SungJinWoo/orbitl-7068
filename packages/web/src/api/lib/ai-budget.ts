import { ORPCError } from "@orpc/server";
import { sql } from "drizzle-orm";
import { db } from "../database";

/**
 * Global AI spend ceiling.
 *
 * The per-user hourly buckets in `rate-limit.ts` stop one account from abusing
 * the gateway, but nothing stopped a thousand accounts — or one leaked key —
 * from running up an unbounded bill. This module caps *total* usage across the
 * whole deployment, per UTC day and per UTC month.
 *
 * Requests are counted for monitoring, not rationed. Only token ceilings (the
 * thing actually billed) pause the service as an operator safety circuit.
 * Normal users have no daily request allocation; burst/hourly abuse protection
 * is enforced separately.
 *
 * A breach is an operator problem, not a user error: it is written to
 * `error_logs` so it shows up in the admin dashboard, and surfaced to the user
 * as a friendly "AI is paused" message rather than a 500.
 */

/** Reads a cap from the environment. Blank, zero or unparseable means "no cap". */
function cap(name: string): number {
  const raw = process.env[name];
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface BudgetCaps {
  dailyRequests: number;
  monthlyRequests: number;
  dailyTokens: number;
  monthlyTokens: number;
}

export function budgetCaps(): BudgetCaps {
  return {
    // Retain the response shape for admin clients; legacy count-cap env values
    // must not silently reinstate a daily/monthly request quota on deployment.
    dailyRequests: 0,
    monthlyRequests: 0,
    dailyTokens: cap("AI_DAILY_TOKEN_CAP"),
    monthlyTokens: cap("AI_MONTHLY_TOKEN_CAP"),
  };
}

/** UTC day/month keys. UTC, not local time, so the window is the same everywhere. */
export function periodKeys(at = new Date()) {
  const day = at.toISOString().slice(0, 10); // YYYY-MM-DD
  return { day, month: day.slice(0, 7) };
}

export interface SpendRow {
  day: string;
  month: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

const ZERO = { requests: 0, inputTokens: 0, outputTokens: 0 };

/** Totals for the current day and month. Never throws — returns zeros on failure. */
export async function currentSpend(at = new Date()) {
  const { day, month } = periodKeys(at);
  try {
    const dayRows = (await db.all(sql`
      SELECT requests, input_tokens, output_tokens FROM ai_spend WHERE day = ${day}
    `)) as unknown as Array<{ requests: number; input_tokens: number; output_tokens: number }>;
    const monthRows = (await db.all(sql`
      SELECT COALESCE(SUM(requests), 0) AS requests,
             COALESCE(SUM(input_tokens), 0) AS input_tokens,
             COALESCE(SUM(output_tokens), 0) AS output_tokens
      FROM ai_spend WHERE month = ${month}
    `)) as unknown as Array<{ requests: number; input_tokens: number; output_tokens: number }>;

    const d = dayRows?.[0];
    const m = monthRows?.[0];
    return {
      day,
      month,
      today: d
        ? { requests: Number(d.requests), inputTokens: Number(d.input_tokens), outputTokens: Number(d.output_tokens) }
        : { ...ZERO },
      thisMonth: m
        ? { requests: Number(m.requests), inputTokens: Number(m.input_tokens), outputTokens: Number(m.output_tokens) }
        : { ...ZERO },
    };
  } catch (err) {
    console.error("[ai-budget] could not read spend:", err);
    return { day, month, today: { ...ZERO }, thisMonth: { ...ZERO }, degraded: true as const };
  }
}

/** Friendly, non-technical copy. The user cannot fix this, so don't alarm them. */
const PAUSED_MESSAGE =
  "AI features are paused right now because OrbitL hit its usage ceiling for this period. Everything else keeps working — please try again later.";

/**
 * Throws a friendly `TOO_MANY_REQUESTS` if a global ceiling is already reached.
 *
 * Deliberately fails *open*: if the spend table cannot be read we allow the call
 * rather than breaking every AI feature on a transient database hiccup. The
 * per-user limiter is still in force underneath, so the blast radius is bounded.
 */
export async function assertGlobalBudget(at = new Date()): Promise<void> {
  const caps = budgetCaps();
  const anyCap = caps.dailyTokens || caps.monthlyTokens;
  if (!anyCap) return;

  const spend = await currentSpend(at);
  if ("degraded" in spend && spend.degraded) return;

  const dayTokens = spend.today.inputTokens + spend.today.outputTokens;
  const monthTokens = spend.thisMonth.inputTokens + spend.thisMonth.outputTokens;

  const breach =
    (caps.dailyTokens && dayTokens >= caps.dailyTokens ? `daily token cap (${dayTokens}/${caps.dailyTokens})` : "") ||
    (caps.monthlyTokens && monthTokens >= caps.monthlyTokens
      ? `monthly token cap (${monthTokens}/${caps.monthlyTokens})`
      : "");

  if (!breach) return;

  // Operators need to know; the user just needs a graceful "not now".
  await reportBreach(breach);
  throw new ORPCError("TOO_MANY_REQUESTS", { message: PAUSED_MESSAGE, data: { globalBudget: true } });
}

/** Same check for plain HTTP routes, which need a status code rather than a throw. */
export async function checkGlobalBudget(at = new Date()): Promise<{ ok: boolean; message: string }> {
  try {
    await assertGlobalBudget(at);
    return { ok: true, message: "" };
  } catch {
    return { ok: false, message: PAUSED_MESSAGE };
  }
}

/** Logs a ceiling breach into `error_logs` without letting logging break the request. */
async function reportBreach(detail: string) {
  try {
    const { logError } = await import("../services/monitoring");
    await logError({
      level: "error",
      source: "job",
      message: `AI global budget reached: ${detail}`,
      fingerprintSeed: `ai-budget:${detail.split(" (")[0]}`,
    });
  } catch (err) {
    console.error("[ai-budget] ceiling reached but could not be logged:", detail, err);
  }
}

/**
 * Records usage after a model call. Counts one request always, plus whatever
 * token usage the SDK reported (it is sometimes absent, which is fine — the
 * request counter still moves).
 *
 * Never throws: failing to record spend must not fail a user's study session.
 */
export async function recordSpend(usage?: {
  inputTokens?: number | null;
  outputTokens?: number | null;
}): Promise<void> {
  const input = Math.max(0, Math.round(Number(usage?.inputTokens ?? 0) || 0));
  const output = Math.max(0, Math.round(Number(usage?.outputTokens ?? 0) || 0));
  const { day, month } = periodKeys();
  const nowSec = Math.floor(Date.now() / 1000);

  try {
    // Single atomic upsert; concurrent AI calls cannot lose counts.
    // Drizzle timestamp columns are unix *seconds*, hence nowSec.
    await db.run(sql`
      INSERT INTO ai_spend (day, month, requests, input_tokens, output_tokens, updated_at)
      VALUES (${day}, ${month}, 1, ${input}, ${output}, ${nowSec})
      ON CONFLICT(day) DO UPDATE SET
        requests = ai_spend.requests + 1,
        input_tokens = ai_spend.input_tokens + ${input},
        output_tokens = ai_spend.output_tokens + ${output},
        updated_at = ${nowSec}
    `);
  } catch (err) {
    console.error("[ai-budget] could not record spend:", err);
  }
}

/** Recent daily spend, newest first — powers the admin dashboard chart. */
export async function recentSpend(days = 14) {
  try {
    const rows = (await db.all(sql`
      SELECT day, month, requests, input_tokens, output_tokens
      FROM ai_spend ORDER BY day DESC LIMIT ${days}
    `)) as unknown as Array<{
      day: string;
      month: string;
      requests: number;
      input_tokens: number;
      output_tokens: number;
    }>;
    return (rows ?? []).map((r) => ({
      day: r.day,
      month: r.month,
      requests: Number(r.requests),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
    }));
  } catch (err) {
    console.error("[ai-budget] could not read recent spend:", err);
    return [];
  }
}
