import { createGateway } from "ai";

export const gateway = createGateway({
  baseURL: process.env.AI_GATEWAY_BASE_URL,
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

export const MODEL = "google/gemini-3-flash";
export const SMART_MODEL = "anthropic/claude-sonnet-4.6";
