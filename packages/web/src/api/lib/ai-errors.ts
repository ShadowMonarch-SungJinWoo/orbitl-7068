import { ORPCError } from "@orpc/server";

/**
 * Translates raw AI-gateway failures into something a student can read.
 *
 * Before this existed, a dry gateway account surfaced in the UI as a bare 500.
 * Quizzes, flashcards, upload-to-notes and coach insights all share one code path
 * (`metered()` in `ai.ts`), so they broke together and looked like an app bug when
 * the real cause was an operator problem — no credits on the gateway key.
 *
 * Every case here is *retryable from the user's point of view*, so each carries
 * `data.aiUnavailable`, which the client uses to render a retry button instead of
 * the generic error card. Nothing here leaks a stack trace or a provider name.
 */

/** What the user sees. Deliberately blames the service, never the student. */
const MESSAGES = {
  credits:
    "OrbitL's AI service has run out of credits. This is on our side, not yours — the team has been notified. Everything that doesn't need AI still works.",
  rateLimited:
    "The AI service is busy right now. Give it a few seconds and try again.",
  timeout:
    "The AI service took too long to respond. Try again — it usually works on the second attempt.",
  auth:
    "OrbitL can't reach its AI service right now because of a configuration problem. The team has been notified.",
  unavailable:
    "The AI service is temporarily unavailable. Please try again in a moment.",
} as const;

export type AiFailureKind = keyof typeof MESSAGES;

/** Pulls a lowercase message out of whatever the gateway threw. */
function textOf(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err.toLowerCase();
  if (err instanceof Error) return `${err.name} ${err.message}`.toLowerCase();
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    return `${o.name ?? ""} ${o.message ?? ""} ${o.type ?? ""}`.toLowerCase();
  }
  return "";
}

/** Best-effort HTTP status from an AI SDK / gateway error. */
function statusOf(err: unknown): number {
  if (!err || typeof err !== "object") return 0;
  const o = err as Record<string, unknown>;
  const raw = o.statusCode ?? o.status ?? (o.response as Record<string, unknown> | undefined)?.status;
  return typeof raw === "number" ? raw : 0;
}

/**
 * Classifies a thrown gateway error. Returns null when this isn't a gateway
 * problem at all, so genuine bugs in our own code still surface as real errors
 * rather than being buried under a friendly message.
 */
export function classifyAiError(err: unknown): AiFailureKind | null {
  const text = textOf(err);
  const status = statusOf(err);

  // The exact string the Runable gateway returns when the account balance is gone.
  if (text.includes("insufficient credits") || text.includes("quota exceeded") || text.includes("billing")) {
    return "credits";
  }
  if (status === 402) return "credits";
  if (status === 429 || text.includes("rate limit") || text.includes("too many requests")) {
    return "rateLimited";
  }
  if (status === 401 || status === 403 || text.includes("unauthorized") || text.includes("invalid api key")) {
    return "auth";
  }
  if (text.includes("timeout") || text.includes("timed out") || text.includes("aborted")) {
    return "timeout";
  }
  if (status === 502 || status === 503 || status === 504) return "unavailable";
  // Anything the AI SDK itself labels as a gateway/API failure.
  if (text.includes("gateway") || text.includes("apicallerror")) return "unavailable";
  return null;
}

/** True when the failure is the gateway's fault rather than ours. */
export function isAiUnavailable(err: unknown): boolean {
  return classifyAiError(err) !== null;
}

export function aiFailureMessage(kind: AiFailureKind): string {
  return MESSAGES[kind];
}

/**
 * Converts a gateway failure into a friendly ORPCError. Non-gateway errors are
 * rethrown untouched — a bug in our prompt-building code should still be loud.
 *
 * `SERVICE_UNAVAILABLE` is the honest code: the request was fine, the dependency
 * wasn't. `TOO_MANY_REQUESTS` is used for throttling so clients can back off.
 */
export function throwFriendlyAiError(err: unknown): never {
  const kind = classifyAiError(err);
  if (!kind) throw err;

  const code = kind === "rateLimited" ? "TOO_MANY_REQUESTS" : "SERVICE_UNAVAILABLE";
  throw new ORPCError(code, {
    message: aiFailureMessage(kind),
    data: { aiUnavailable: true, kind, retryable: true },
  });
}
