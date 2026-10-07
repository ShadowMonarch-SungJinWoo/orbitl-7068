import { describe, expect, test } from "bun:test";
import { insightsFailureMetadata, withInsightsDiagnostics } from "./insights-diagnostics";
import { aiFailureMessage, throwFriendlyAiError } from "./ai-errors";

describe("Insights upstream diagnostics", () => {
  test("retains distinct gateway and provider status/codes through retry causes", () => {
    const error = { lastError: { statusCode: 502, type: "failed_dependency", cause: {
      statusCode: 429, data: { error: { code: "insufficient_quota", type: "rate_limit_error" } },
    } } };
    expect(insightsFailureMetadata(error).layers).toEqual([
      { source: "lastError", httpStatus: 502, errorType: "failed_dependency" },
      { source: "cause", httpStatus: 429 },
      { source: "providerError", errorCode: "insufficient_quota", errorType: "rate_limit_error" },
    ]);
  });

  test("extracts bounded JSON provider errors without serializing bodies", () => {
    const secret = "sk-private-key-user-content";
    const metadata = insightsFailureMetadata({ statusCode: 402, message: secret,
      url: secret, requestBodyValues: { prompt: secret }, responseHeaders: { authorization: secret },
      responseBody: JSON.stringify({ error: { code: "insufficient_credits", message: secret }, content: secret }),
    });
    expect(metadata.layers).toEqual([
      { source: "error", httpStatus: 402 },
      { source: "providerError", errorCode: "insufficient_credits" },
    ]);
    expect(JSON.stringify(metadata)).not.toContain(secret);
  });

  test("redacts unknown codes even when they look like valid identifiers", () => {
    for (const sensitive of ["sk_live_secret", "student_email", "PROMPT", "a@b.test", "billing\nsecret", { token: "secret" }]) {
      expect(insightsFailureMetadata({ code: sensitive, type: sensitive }).layers).toEqual([
        { source: "error", codeRedacted: true, typeRedacted: true },
      ]);
    }
  });

  test("supports numeric provider codes, HTTP status and Google structured status", () => {
    expect(insightsFailureMetadata({ response: { status: 503, error: {
      code: 8, status: "RESOURCE_EXHAUSTED", type: "RESOURCE_EXHAUSTED",
    } } }).layers).toEqual([
      { source: "response", httpStatus: 503 },
      { source: "providerError", errorCode: 8, errorType: "RESOURCE_EXHAUSTED", providerStatus: "RESOURCE_EXHAUSTED" },
    ]);
    expect(insightsFailureMetadata({ statusCode: NaN, code: 123456789 }).layers).toEqual([
      { source: "error", codeRedacted: true },
    ]);
  });

  test("ignores text errors, malformed/oversized bodies, getters and proxies", () => {
    expect(insightsFailureMetadata("insufficient credits secret").layers).toEqual([]);
    expect(insightsFailureMetadata({ responseBody: "not JSON secret" }).layers).toEqual([]);
    expect(insightsFailureMetadata({ responseBody: JSON.stringify({ error: { code: "insufficient_quota" }, padding: "x".repeat(17_000) }) }).layers).toEqual([]);
    let reads = 0;
    const getter = { get code() { reads++; throw new Error("secret"); } };
    expect(insightsFailureMetadata(getter).layers).toEqual([]);
    expect(reads).toBe(0);
    expect(insightsFailureMetadata(new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("secret"); } })).layers).toEqual([]);
  });

  test("bounds cyclic/deep traversal and does not mutate errors", () => {
    const cycle: any = { statusCode: 429 }; cycle.cause = cycle;
    expect(insightsFailureMetadata(cycle).layers).toEqual([{ source: "error", httpStatus: 429 }]);
    let deep: any = { code: "insufficient_quota" };
    for (let i = 0; i < 100; i++) deep = { cause: deep };
    expect(insightsFailureMetadata(deep).layers).toEqual([]);
    expect(insightsFailureMetadata(Object.freeze({ statusCode: 402 })).layers[0]?.httpStatus).toBe(402);
  });

  test("successful calls return the same result and never log", async () => {
    const result = { usage: { inputTokens: 1 }, object: { insights: [] } };
    let calls = 0;
    expect(await withInsightsDiagnostics("generate", async () => result, () => { calls++; })).toBe(result);
    expect(calls).toBe(0);
  });

  test("logs before translation and rethrows the same original object", async () => {
    const original = Object.assign(new Error("insufficient credits PRIVATE"), { statusCode: 402 });
    const logs: unknown[] = [];
    try {
      await withInsightsDiagnostics("generate", async () => { throw original; }, (...args) => { logs.push(args); });
      throw new Error("expected failure");
    } catch (error) { expect(error).toBe(original); }
    expect(logs).toEqual([["[insights.ai.upstream_failure]", { operation: "generate", layers: [{ source: "error", httpStatus: 402 }] }]]);
    expect(JSON.stringify(logs)).not.toContain("PRIVATE");
    try { throwFriendlyAiError(original); }
    catch (error: any) {
      expect(error.message).toBe(aiFailureMessage("credits"));
      expect(error.data.kind).toBe("credits");
    }
  });

  test("logging failures do not replace the original or change existing classification", async () => {
    const original = { statusCode: 429, message: "billing quota exceeded" };
    try {
      await withInsightsDiagnostics("followUp", async () => { throw original; }, () => { throw new Error("logger failed"); });
    } catch (error) { expect(error).toBe(original); }
    // Preserve the current text-first classification, including the ambiguity.
    try { throwFriendlyAiError(original); }
    catch (error: any) { expect(error.data.kind).toBe("credits"); }
  });
});