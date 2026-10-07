import { generateObject, generateText } from "ai";
import { z } from "zod";
import { gateway, MODEL } from "../agent/gateway";
import { assertGlobalBudget, recordSpend } from "./ai-budget";
import { throwFriendlyAiError } from "./ai-errors";
import { withInsightsDiagnostics } from "./insights-diagnostics";

/**
 * Hard output ceilings. Every model call is capped so a pathological prompt or a
 * runaway generation can never turn into an unbounded gateway bill.
 *
 * These are *not* prose budgets. The model thinks before it answers and those
 * reasoning tokens are billed against the same ceiling — a measured follow-up
 * spent 463 reasoning tokens to emit 189 tokens of answer. Anything set to the
 * length of the wanted output gets silently cut off mid-sentence (or, for JSON,
 * fails to parse), so every cap here leaves roughly two-thirds of its room for
 * thinking.
 */
const CAPS = {
  concept: 1200,
  flashcards: 1500,
  quiz: 2000,
  coach: 3000,
  followUp: 2400,
  notes: 2500,
} as const;

/** Absolute ceiling for count-scaled generations, so a big batch can never run away. */
const MAX_BATCH_TOKENS = 24000;

/**
 * Output budget for batch generations. Students can now ask for large batches, so a
 * fixed ceiling would silently truncate the JSON and fail parsing — the budget has
 * to grow with the number of items requested.
 */
function batchCap(base: number, count: number, perItem: number) {
  return Math.min(
    MAX_BATCH_TOKENS,
    Math.max(base, Math.round(count * perItem) + 400),
  );
}

/**
 * A structured generation that runs out of room fails as a parse error, not as a
 * clean "length" signal — the JSON simply stops mid-string. Reasoning tokens are
 * billed against the same ceiling and vary a lot call to call, so the identical
 * prompt can parse once and truncate the next time. This spots that case.
 */
function isTruncatedObject(err: unknown): boolean {
  const e = err as { name?: string; message?: string; cause?: unknown };
  const text =
    `${e?.name ?? ""} ${e?.message ?? ""} ${String(e?.cause ?? "")}`.toLowerCase();
  return (
    text.includes("no object generated") ||
    text.includes("could not parse") ||
    text.includes("json parsing failed") ||
    text.includes("unterminated string")
  );
}

/** Runs a structured generation, retrying once with double the room if it truncated. */
async function withRoomToFinish<T>(
  cap: number,
  run: (cap: number) => Promise<T>,
): Promise<T> {
  try {
    return await run(cap);
  } catch (err) {
    const bigger = Math.min(MAX_BATCH_TOKENS, cap * 2);
    if (!isTruncatedObject(err) || bigger <= cap) throw err;
    return await run(bigger);
  }
}

/**
 * Every model call goes through here, so the global spend ceiling is enforced in
 * exactly one place and cannot be forgotten when a new AI feature is added.
 *
 * Checked before the call, recorded after — including when the call throws, since
 * a failed generation can still have burned input tokens.
 */
async function metered<
  T extends {
    usage?: { inputTokens?: number | null; outputTokens?: number | null };
  },
>(run: () => Promise<T>): Promise<T> {
  await assertGlobalBudget();
  try {
    const result = await run();
    await recordSpend(result.usage);
    return result;
  } catch (err) {
    await recordSpend(undefined);
    // A dead or dry gateway is an operator problem, not a student's. Translate it
    // into a readable, retryable message; genuine bugs are rethrown untouched.
    throwFriendlyAiError(err);
  }
}

const conceptSchema = z.object({
  simple: z
    .string()
    .describe("A clear beginner-friendly explanation, 2-3 sentences"),
  advanced: z
    .string()
    .describe("An in-depth explanation with nuance, 3-5 sentences"),
  examples: z
    .array(z.string())
    .describe("2-3 concrete worked examples or real-world uses"),
  commonMistakes: z
    .array(z.string())
    .describe("2-3 common mistakes students make"),
  formulas: z
    .array(z.string())
    .describe("Key formulas or definitions; empty if none apply"),
  relatedConcepts: z
    .array(z.string())
    .describe("3-5 closely related concept names"),
  prerequisites: z
    .array(z.string())
    .describe("2-3 prerequisite concept names to learn first"),
});
export type ConceptContent = z.infer<typeof conceptSchema>;

export async function generateConceptContent(
  topic: string,
  subject: string,
): Promise<ConceptContent> {
  const { object } = await metered(() =>
    generateObject({
      model: gateway(MODEL),
      schema: conceptSchema,
      maxOutputTokens: CAPS.concept,
      prompt: `You are an expert tutor. Explain the academic concept "${topic}" within the subject "${subject}" for a student. Be accurate and concise.`,
    }),
  );
  return object;
}

const flashSchema = z.object({
  cards: z.array(z.object({ front: z.string(), back: z.string() })),
});

export async function generateFlashcards(
  topic: string,
  subject: string,
  count = 6,
  source?: string,
) {
  return withRoomToFinish(
    batchCap(CAPS.flashcards, count, 130),
    async (cap) => {
      const { object } = await metered(() =>
        generateObject({
          model: gateway(MODEL),
          schema: flashSchema,
          maxOutputTokens: cap,
          prompt: source
            ? `Create ${count} high-quality study flashcards drawn ONLY from the source material below. Front = a question or term, back = a concise answer. Topic: "${topic}" in "${subject}".\n\nSOURCE MATERIAL:\n${source}`
            : `Create ${count} high-quality study flashcards for the concept "${topic}" in "${subject}". Front = a question or term, back = a concise answer.`,
        }),
      );
      return object.cards;
    },
  );
}

const quizSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()).length(4),
      answerIndex: z.number().min(0).max(3),
      explanation: z.string(),
    }),
  ),
});

export async function generateQuiz(
  topic: string,
  subject: string,
  count = 5,
  source?: string,
) {
  return withRoomToFinish(batchCap(CAPS.quiz, count, 320), async (cap) => {
    const { object } = await metered(() =>
      generateObject({
        model: gateway(MODEL),
        schema: quizSchema,
        maxOutputTokens: cap,
        prompt: source
          ? `Create a ${count}-question multiple-choice quiz testing the source material below. Each question has exactly 4 options, one correct answer (answerIndex), and a short explanation. Only use facts present in the source. Topic: "${topic}" in "${subject}".\n\nSOURCE MATERIAL:\n${source}`
          : `Create a ${count}-question multiple-choice quiz on "${topic}" in "${subject}". Each question has exactly 4 options, one correct answer (answerIndex), and a short explanation. Vary difficulty.`,
      }),
    );
    return object.questions;
  });
}

/**
 * MATHS FORMATTING — shared by every prose generation a student reads.
 *
 * The renderer shows plain text, so LaTeX arrives as unreadable code. The rule
 * lives in one constant because more than one generator now writes free prose.
 */
const PLAIN_MATHS = [
  "NEVER use LaTeX. No \\(, \\), \\[, \\], $, $, \\frac, \\sqrt, \\int, \\sum or any backslash command.",
  "Write formulas the way a teacher writes them on a whiteboard: fractions as a/b, powers as x², roots as √x,",
  "and use × ÷ ± ≤ ≥ ≠ ≈ ∞ π θ α β Δ ∑ ∫ ° directly.",
].join(" ");

const coachSchema = z.object({
  kind: z.enum(["suggestion", "warning", "celebration", "plan"]),
  title: z
    .string()
    .describe(
      "a specific headline naming the real thing that happened, not a generic label",
    ),
  body: z
    .string()
    .describe(
      "2-4 sentences of markdown, under 400 characters. Quote the actual numbers from the data, say what changed and why it matters, then give one concrete next step.",
    ),
  reason: z
    .string()
    .describe(
      "one short sentence naming the exact statistic this was drawn from",
    ),
  subject: z
    .string()
    .nullable()
    .describe("the subject name this is about, or null if it spans everything"),
  topic: z
    .string()
    .nullable()
    .describe("the specific concept name this is about, or null"),
  actionKind: z
    .enum(["quiz", "focus", "revision", "none"])
    .describe(
      "the single most useful thing the student could do right now about this insight",
    ),
  actionLabel: z
    .string()
    .describe(
      "button copy for that action, e.g. 'Quiz me on Integration by parts'",
    ),
  actionTarget: z
    .string()
    .nullable()
    .describe("the topic or subject name the action applies to, or null"),
});
export type CoachInsight = z.infer<typeof coachSchema>;

const coachBatchSchema = z.object({ insights: z.array(coachSchema) });

/**
 * The coach writes a set of insights in one call rather than one at a time: seeing
 * the whole picture at once is what stops the model repeating the same "study more"
 * platitude, and it costs one generation instead of several.
 */
export async function generateCoachInsights(
  context: string,
  count = 3,
): Promise<CoachInsight[]> {
  const insights = await withRoomToFinish(
    batchCap(CAPS.coach, count, 1600),
    async (cap) => {
      const { object } = await metered(() =>
        withInsightsDiagnostics("generate", () =>
        generateObject({
          model: gateway(MODEL),
          schema: coachBatchSchema,
          maxOutputTokens: cap,
          prompt: [
            "You are a sharp, encouraging AI study coach. Below is a student's real study data.",
            `Write exactly ${count} DIFFERENT insights. Keep every body under 400 characters — long bodies are truncated.`,
            "Each must be grounded in a specific number from the data —",
            "never generic advice. Cover different angles: one about a weakness or risk, one about momentum or a",
            "genuine win, one about what to do next. If the data is thin, say so honestly and suggest the smallest",
            "useful first step instead of inventing progress.",
            PLAIN_MATHS,
            "",
            "DATA:",
            context,
          ].join("\n"),
        }),
        ),
      );
      return object.insights;
    },
  );
  return insights;
}

/** Back-compat single insight — the dashboard still asks for exactly one. */
export async function generateCoachInsight(
  context: string,
): Promise<CoachInsight> {
  const [first] = await generateCoachInsights(context, 1);
  return first;
}

/**
 * Answers a follow-up question about ONE insight. Deliberately not a general chat:
 * the prompt pins the model to this insight and the student's own numbers, so
 * "why?" and "what do I do about it?" get a real answer instead of a chatbot reply.
 */
export async function answerInsightFollowUp(args: {
  insight: { title: string; body: string; reason: string | null };
  context: string;
  history: { role: string; content: string }[];
  question: string;
}): Promise<string> {
  const transcript = args.history
    .map((m) => `${m.role === "user" ? "Student" : "Coach"}: ${m.content}`)
    .join("\n");
  const ask = (cap: number) =>
    metered(() =>
      withInsightsDiagnostics("followUp", () =>
      generateText({
        model: gateway(MODEL),
        maxOutputTokens: cap,
        prompt: [
          "You are the student's study coach. Answer their follow-up about ONE specific insight you gave them.",
          "Stay on this insight and their real data. If they ask something unrelated to their studying or this",
          "insight, say briefly that follow-ups are scoped to the insight and point them back to it.",
          "Be concrete and short — a few sentences or a tight markdown list of at most four items.",
          "Cite their actual numbers. Stay under 900 characters: longer answers get truncated mid-sentence.",
          PLAIN_MATHS,
          "",
          `INSIGHT TITLE: ${args.insight.title}`,
          `INSIGHT: ${args.insight.body}`,
          `DRAWN FROM: ${args.insight.reason ?? "n/a"}`,
          "",
          "STUDENT'S DATA:",
          args.context,
          "",
          transcript ? `CONVERSATION SO FAR:\n${transcript}\n` : "",
          `STUDENT'S QUESTION: ${args.question}`,
        ].join("\n"),
      }),
      ),
    );

  let { text, finishReason } = await ask(CAPS.followUp);
  // The ceiling covers thinking too, so an unusually long deliberation can still
  // eat the answer. One retry with double the room, then fall back to trimming
  // the dangling sentence — a student should never read half a number.
  if (finishReason === "length")
    ({ text, finishReason } = await ask(CAPS.followUp * 2));
  if (finishReason === "length") {
    const cut = Math.max(
      text.lastIndexOf("."),
      text.lastIndexOf("!"),
      text.lastIndexOf("?"),
    );
    if (cut > 80) text = text.slice(0, cut + 1);
  }
  return text;
}

export async function generateNotes(
  title: string,
  context: string,
): Promise<string> {
  const { text } = await metered(() =>
    generateText({
      model: gateway(MODEL),
      maxOutputTokens: CAPS.notes,
      prompt: `Write clean, well-structured study notes in Markdown for "${title}". ${context}. Use headings, bullet points, bold key terms, and a short summary at the end.`,
    }),
  );
  return text;
}
