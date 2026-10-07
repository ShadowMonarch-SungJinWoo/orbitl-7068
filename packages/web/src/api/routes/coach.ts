import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { authed } from "../middleware/auth";
import { db } from "../database";
import * as s from "../database/schema";
import { answerInsightFollowUp, generateCoachInsights } from "../lib/ai";
import { consumeAiQuota } from "../lib/rate-limit";
import { computeStudyStats, statsToPrompt, RANGES, type Range } from "../lib/study-context";

const rangeInput = z.union([z.literal(7), z.literal(30), z.literal(90)]).optional();

/**
 * Builds the model's view of the student from the same engine the charts use, and
 * returns the subject label alongside it so the prompt can name the scope.
 */
async function contextFor(userId: string, range: Range, subjectId: string | null) {
  const stats = await computeStudyStats(userId, { range, subjectId });
  const label = subjectId ? (stats.subjectMastery.find((x) => x.id === subjectId)?.name ?? null) : null;
  return { stats, text: statsToPrompt(stats, label) };
}

export const coach = {
  /**
   * Insight history. `active` is the working list (new advice), `history` is what
   * was acted on or dismissed — the student can look back and judge whether the
   * advice actually worked.
   */
  list: authed
    .input(z.object({ view: z.enum(["active", "history", "all"]).default("active"), limit: z.number().min(1).max(50).default(20) }).optional())
    .handler(async ({ input, context }) => {
      const view = input?.view ?? "active";
      const rows = await db
        .select()
        .from(s.coachMessages)
        .where(eq(s.coachMessages.userId, context.user.id))
        .orderBy(desc(s.coachMessages.createdAt))
        .limit(input?.limit ?? 20);

      const filtered =
        view === "all" ? rows : view === "active" ? rows.filter((r) => r.status === "new") : rows.filter((r) => r.status !== "new");

      // Reply counts in one query so cards can show "3 follow-ups" without N+1.
      const ids = filtered.map((r) => r.id);
      const replies = ids.length
        ? await db.select().from(s.coachReplies).where(inArray(s.coachReplies.messageId, ids))
        : [];
      const counts = new Map<string, number>();
      for (const r of replies) counts.set(r.messageId, (counts.get(r.messageId) ?? 0) + 1);

      return filtered.map((r) => ({ ...r, replyCount: counts.get(r.id) ?? 0 }));
    }),

  /**
   * Generates a fresh set of insights for the current filters. Several at once:
   * one call, one quota hit, and the model can pick genuinely different angles
   * instead of repeating itself across separate generations.
   */
  generate: authed
    .input(
      z
        .object({
          range: rangeInput,
          subjectId: z.string().nullable().optional(),
          count: z.number().min(1).max(4).default(3),
        })
        .optional(),
    )
    .handler(async ({ input, context }) => {
      const uid = context.user.id;
      await consumeAiQuota(uid, "coach");

      const range = (input?.range ?? 30) as Range;
      const subjectId = input?.subjectId ?? null;
      const { stats, text } = await contextFor(uid, range, subjectId);
      // oRPC collapses any throw here into a bare 500 with no server-side trace,
      // which turned a model-side failure into an unexplained silent error once.
      // Log the real cause before it is swallowed.
      let insights;
      try {
        insights = await generateCoachInsights(text, input?.count ?? 3);
      } catch (err) {
        console.error("[coach.generate] insight generation failed:", err);
        throw err;
      }

      // The model answers in names; the app stores ids. Matching is case-insensitive
      // and simply yields null when it cannot resolve — an unlinked insight is fine,
      // a wrong link is not.
      const subjectByName = new Map(stats.subjectMastery.map((x) => [x.name.toLowerCase(), x.id]));
      // Resolved against every topic the student owns, not just the weak ones: the
      // prompt also names most-studied topics, and an unresolved name silently drops
      // the one-click action the insight was offering.
      const allTopics = await db
        .select({ id: s.topics.id, name: s.topics.name })
        .from(s.topics)
        .where(eq(s.topics.userId, uid));
      const topicByName = new Map(allTopics.map((x) => [x.name.toLowerCase(), x.id]));

      const rows = await db
        .insert(s.coachMessages)
        .values(
          insights.map((i) => ({
            userId: uid,
            kind: i.kind,
            title: i.title,
            body: i.body,
            reason: i.reason,
            subjectId: (i.subject && subjectByName.get(i.subject.toLowerCase())) || subjectId,
            topicId: (i.topic && topicByName.get(i.topic.toLowerCase())) || null,
            actionKind: i.actionKind,
            actionLabel: i.actionLabel,
            actionTarget: i.actionTarget ?? i.topic ?? i.subject ?? null,
          })),
        )
        .returning();

      return rows.map((r) => ({ ...r, replyCount: 0 }));
    }),

  /** Marks advice as acted on or irrelevant. Drives the history view. */
  setStatus: authed
    .input(z.object({ id: z.string(), status: z.enum(["new", "done", "dismissed"]) }))
    .handler(async ({ input, context }) => {
      await db
        .update(s.coachMessages)
        .set({ status: input.status, resolvedAt: input.status === "new" ? null : new Date(), read: true })
        .where(and(eq(s.coachMessages.id, input.id), eq(s.coachMessages.userId, context.user.id)));
      return { ok: true };
    }),

  markRead: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    await db
      .update(s.coachMessages)
      .set({ read: true })
      .where(and(eq(s.coachMessages.id, input.id), eq(s.coachMessages.userId, context.user.id)));
    return { ok: true };
  }),

  /** The follow-up conversation attached to one insight, oldest first. */
  replies: authed.input(z.object({ messageId: z.string() })).handler(async ({ input, context }) => {
    return db
      .select()
      .from(s.coachReplies)
      .where(and(eq(s.coachReplies.userId, context.user.id), eq(s.coachReplies.messageId, input.messageId)))
      .orderBy(asc(s.coachReplies.createdAt));
  }),

  /**
   * Asks a question about one insight. Scoped on purpose: there is no free-form
   * chat in the app, so the model always answers against this insight and the
   * student's real numbers.
   */
  followUp: authed
    .input(
      z.object({
        messageId: z.string(),
        question: z.string().min(2).max(500),
        range: rangeInput,
        subjectId: z.string().nullable().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const uid = context.user.id;
      const [insight] = await db
        .select()
        .from(s.coachMessages)
        .where(and(eq(s.coachMessages.id, input.messageId), eq(s.coachMessages.userId, uid)))
        .limit(1);
      if (!insight) throw new Error("That insight no longer exists.");

      await consumeAiQuota(uid, "coach");

      const history = await db
        .select()
        .from(s.coachReplies)
        .where(and(eq(s.coachReplies.userId, uid), eq(s.coachReplies.messageId, input.messageId)))
        .orderBy(asc(s.coachReplies.createdAt));

      const { text } = await contextFor(uid, (input.range ?? 30) as Range, input.subjectId ?? insight.subjectId ?? null);
      const answer = await answerInsightFollowUp({
        insight,
        context: text,
        // Only the tail is sent: a long thread must not grow the bill without bound.
        history: history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
        question: input.question,
      });

      const rows = await db
        .insert(s.coachReplies)
        .values([
          { userId: uid, messageId: input.messageId, role: "user", content: input.question },
          { userId: uid, messageId: input.messageId, role: "assistant", content: answer },
        ])
        .returning();
      return rows;
    }),

  /** Exposed so the UI can offer exactly the ranges the engine supports. */
  ranges: authed.handler(async () => RANGES),
};
