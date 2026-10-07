/** Insights-only metadata: never serialize an error, message, body, or request. */
type Operation = "generate" | "followUp";
type SafeCode = string | number;

// Syntax validation alone would allow a key, email fragment, or prompt into logs.
// Unknown provider codes are deliberately marked as redacted, not copied.
const SAFE_CODES = new Set([
  "authentication_error", "invalid_request_error", "rate_limit_exceeded",
  "rate_limit_error", "model_not_found", "internal_server_error",
  "failed_dependency", "forbidden", "insufficient_credits", "insufficient_quota",
  "quota_exceeded", "billing_error", "billing_hard_limit_reached",
  "invalid_api_key", "permission_denied", "resource_exhausted",
  "overloaded_error", "server_error", "timeout", "request_timeout",
  "UNAUTHENTICATED", "PERMISSION_DENIED", "RESOURCE_EXHAUSTED",
  "INVALID_ARGUMENT", "NOT_FOUND", "INTERNAL", "UNAVAILABLE",
  "DEADLINE_EXCEEDED", "UNKNOWN", "CANCELLED", "ABORTED",
  "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_CONNECT_TIMEOUT",
  "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED",
]);

function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  // Do not invoke accessors; hostile/throwing proxies are also ignored.
  try { return Object.getOwnPropertyDescriptor(value, key)?.value; }
  catch { return undefined; }
}

function status(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value : undefined;
}

function code(value: unknown): SafeCode | undefined {
  if (typeof value === "string" && SAFE_CODES.has(value)) return value;
  // Standard Google RPC enum and HTTP codes only, not arbitrary identifiers.
  if (typeof value === "number" && Number.isInteger(value) &&
      ((value >= 0 && value <= 16) || (value >= 100 && value <= 599))) return value;
  return undefined;
}

type Layer = {
  source: "error" | "lastError" | "cause" | "data" | "response" | "responseBody" | "providerError";
  httpStatus?: number;
  errorCode?: SafeCode;
  errorType?: SafeCode;
  providerStatus?: SafeCode;
  codeRedacted?: true;
  typeRedacted?: true;
  statusRedacted?: true;
};

export function insightsFailureMetadata(error: unknown): { layers: Layer[] } {
  const layers: Layer[] = [];
  const seen = new Set<object>();
  let visited = 0;
  function visit(value: unknown, source: Layer["source"], depth: number): void {
    if (!value || typeof value !== "object" || depth > 6 || visited >= 24 || seen.has(value)) return;
    seen.add(value);
    visited++;
    const rawCode = field(value, "code");
    const rawType = field(value, "type");
    const rawStatus = field(value, "status");
    const errorCode = code(rawCode);
    const errorType = code(rawType);
    const httpStatus = status(field(value, "statusCode")) ?? status(field(value, "status"));
    const layer: Layer = { source };
    if (httpStatus !== undefined) layer.httpStatus = httpStatus;
    if (errorCode !== undefined) layer.errorCode = errorCode;
    else if (rawCode != null) layer.codeRedacted = true;
    if (errorType !== undefined) layer.errorType = errorType;
    else if (rawType != null) layer.typeRedacted = true;
    if (typeof rawStatus === "string") {
      const providerStatus = code(rawStatus);
      if (providerStatus !== undefined) layer.providerStatus = providerStatus;
      else layer.statusRedacted = true;
    }
    if (Object.keys(layer).length > 1) layers.push(layer);
    // SDK retry errors retain the final attempt; gateway errors retain APICallError
    // as cause, with structured data or a JSON responseBody. Never scan messages.
    visit(field(value, "lastError"), "lastError", depth + 1);
    visit(field(value, "cause"), "cause", depth + 1);
    visit(field(value, "data"), "data", depth + 1);
    visit(field(value, "response"), "response", depth + 1);
    visit(field(value, "error"), "providerError", depth + 1);
    const body = field(value, "responseBody");
    if (typeof body === "string" && body.length <= 16_384) {
      try { visit(JSON.parse(body), "responseBody", depth + 1); }
      catch { /* Non-JSON responses are never logged. */ }
    }
  }
  visit(error, "error", 0);
  return { layers };
}

/** Wrap inside metered(), so diagnostics see the original before translation. */
export async function withInsightsDiagnostics<T>(
  operation: Operation,
  run: () => Promise<T>,
  log: (event: string, metadata: unknown) => void = (event, metadata) => console.error(event, metadata),
): Promise<T> {
  try { return await run(); }
  catch (error) {
    try {
      log("[insights.ai.upstream_failure]", { operation, ...insightsFailureMetadata(error) });
    } catch { /* Diagnostics must never change the model failure or retry behavior. */ }
    throw error;
  }
}