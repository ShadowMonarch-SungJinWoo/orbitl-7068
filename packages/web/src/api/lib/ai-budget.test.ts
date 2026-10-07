import { describe, expect, test } from "bun:test";
import { budgetCaps } from "./ai-budget";

describe("AI study access policy", () => {
  test("legacy daily/monthly request settings cannot reinstate request quotas", () => {
    const keys = ["AI_DAILY_REQUEST_CAP", "AI_MONTHLY_REQUEST_CAP", "AI_DAILY_TOKEN_CAP", "AI_MONTHLY_TOKEN_CAP"];
    const saved = keys.map((k) => process.env[k]);
    try {
      process.env.AI_DAILY_REQUEST_CAP = "1";
      process.env.AI_MONTHLY_REQUEST_CAP = "1";
      process.env.AI_DAILY_TOKEN_CAP = "8000000";
      process.env.AI_MONTHLY_TOKEN_CAP = "120000000";
      expect(budgetCaps()).toEqual({
        dailyRequests: 0,
        monthlyRequests: 0,
        dailyTokens: 8000000,
        monthlyTokens: 120000000,
      });
    } finally {
      keys.forEach((k, i) => {
        if (saved[i] === undefined) delete process.env[k];
        else process.env[k] = saved[i];
      });
    }
  });
});