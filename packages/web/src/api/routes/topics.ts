import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { authed } from "../middleware/auth";
import { db } from "../database";
import * as s from "../database/schema";
import { generateConceptContent } from "../lib/ai";
import { consumeAiQuota } from "../lib/rate-limit";
import { awardXp } from "../lib/game";

async function ownedTopic(userId: string, id: string) {
  const [row] = await db.select().from(s.topics).where(and(eq(s.topics.id, id), eq(s.topics.userId, userId)));
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Topic not found" });
  return row;
}

export const topics = {
  /** Whole knowledge graph for the user: nodes + edges. */
  graph: authed.handler(async ({ context }) => {
    const uid = context.user.id;
    const subjects = await db.select().from(s.subjects).where(eq(s.subjects.userId, uid));
    const topicRows = await db.select().from(s.topics).where(eq(s.topics.userId, uid));
    const links = await db.select().from(s.topicLinks).where(eq(s.topicLinks.userId, uid));

    const nodes = [
      ...subjects.map((sub) => ({
        id: `subject:${sub.id}`,
        type: "subject" as const,
        label: sub.name,
        subjectId: sub.id,
        color: sub.color,
        mastery: 0,
      })),
      ...topicRows.map((t) => ({
        id: `topic:${t.id}`,
        type: "topic" as const,
        label: t.name,
        subjectId: t.subjectId,
        topicId: t.id,
        parentId: t.parentId,
        mastery: t.mastery,
        revisionStatus: t.revisionStatus,
      })),
    ];

    const edges = [
      // subject -> root topics (no parent)
      ...topicRows
        .filter((t) => !t.parentId)
        .map((t) => ({ id: `e-sub-${t.id}`, source: `subject:${t.subjectId}`, target: `topic:${t.id}`, type: "hierarchy" as const })),
      // parent topic -> child topic
      ...topicRows
        .filter((t) => t.parentId)
        .map((t) => ({ id: `e-par-${t.id}`, source: `topic:${t.parentId}`, target: `topic:${t.id}`, type: "hierarchy" as const })),
      // explicit links
      ...links.map((l) => ({
        id: `e-link-${l.id}`,
        source: `topic:${l.sourceId}`,
        target: `topic:${l.targetId}`,
        type: l.type as "related" | "prerequisite",
      })),
    ];

    return { nodes, edges, subjects };
  }),

  detail: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const uid = context.user.id;
    const topic = await ownedTopic(uid, input.id);
    const [subject] = await db.select().from(s.subjects).where(eq(s.subjects.id, topic.subjectId));
    const notes = await db.select().from(s.notes).where(and(eq(s.notes.userId, uid), eq(s.notes.topicId, topic.id)));
    const flashcards = await db.select().from(s.flashcards).where(and(eq(s.flashcards.userId, uid), eq(s.flashcards.topicId, topic.id)));
    const quizzes = await db.select().from(s.quizzes).where(and(eq(s.quizzes.userId, uid), eq(s.quizzes.topicId, topic.id)));
    const attempts = await db.select().from(s.quizAttempts).where(and(eq(s.quizAttempts.userId, uid), eq(s.quizAttempts.topicId, topic.id)));
    const assignments = await db.select().from(s.assignments).where(and(eq(s.assignments.userId, uid), eq(s.assignments.topicId, topic.id)));
    const links = await db.select().from(s.topicLinks).where(eq(s.topicLinks.userId, uid));
    const related = links.filter((l) => l.sourceId === topic.id || l.targetId === topic.id);
    const relatedIds = related.map((l) => (l.sourceId === topic.id ? l.targetId : l.sourceId));
    const relatedTopics = relatedIds.length
      ? await db.select().from(s.topics).where(eq(s.topics.userId, uid))
      : [];
    return {
      topic,
      subject,
      notes,
      flashcards,
      quizzes,
      attempts,
      assignments,
      related: relatedTopics.filter((t) => relatedIds.includes(t.id)),
      prerequisites: relatedTopics.filter((t) => related.some((l) => l.type === "prerequisite" && l.targetId === topic.id && l.sourceId === t.id)),
    };
  }),

  create: authed
    .input(
      z.object({
        subjectId: z.string(),
        parentId: z.string().optional(),
        name: z.string().min(1),
        summary: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [row] = await db
        .insert(s.topics)
        .values({ ...input, userId: context.user.id })
        .returning();
      await awardXp(context.user.id, 10, "Added a concept to the graph");
      return row;
    }),

  update: authed
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        summary: z.string().optional(),
        mastery: z.number().min(0).max(100).optional(),
        revisionStatus: z.enum(["not_started", "in_progress", "revised"]).optional(),
        parentId: z.string().nullable().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      await ownedTopic(context.user.id, input.id);
      const { id, ...rest } = input;
      const [row] = await db.update(s.topics).set(rest).where(eq(s.topics.id, id)).returning();
      return row;
    }),

  remove: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    await ownedTopic(context.user.id, input.id);
    await db.delete(s.topicLinks).where(eq(s.topicLinks.sourceId, input.id));
    await db.delete(s.topicLinks).where(eq(s.topicLinks.targetId, input.id));
    await db.delete(s.topics).where(eq(s.topics.id, input.id));
    return { ok: true };
  }),

  link: authed
    .input(z.object({ sourceId: z.string(), targetId: z.string(), type: z.enum(["related", "prerequisite"]).default("related") }))
    .handler(async ({ input, context }) => {
      const [row] = await db.insert(s.topicLinks).values({ ...input, userId: context.user.id }).returning();
      return row;
    }),

  unlink: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    await db.delete(s.topicLinks).where(and(eq(s.topicLinks.id, input.id), eq(s.topicLinks.userId, context.user.id)));
    return { ok: true };
  }),

  /** Generate + cache AI concept content. Regenerate with force=true. */
  explain: authed
    .input(z.object({ id: z.string(), force: z.boolean().default(false) }))
    .handler(async ({ input, context }) => {
      const topic = await ownedTopic(context.user.id, input.id);
      if (topic.aiContent && !input.force) {
        return JSON.parse(topic.aiContent);
      }
      await consumeAiQuota(context.user.id, "generate");
      const [subject] = await db.select().from(s.subjects).where(eq(s.subjects.id, topic.subjectId));
      const content = await generateConceptContent(topic.name, subject?.name ?? "General");
      await db
        .update(s.topics)
        .set({ aiContent: JSON.stringify(content), summary: topic.summary ?? content.simple })
        .where(eq(s.topics.id, topic.id));
      await awardXp(context.user.id, 5, "Explored a concept with AI");
      return content;
    }),
};
