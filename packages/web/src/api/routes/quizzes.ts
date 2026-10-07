import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { authed } from "../middleware/auth";
import { db } from "../database";
import * as s from "../database/schema";
import { generateQuiz } from "../lib/ai";
import { consumeAiQuota } from "../lib/rate-limit";
import { awardXp, recomputeMastery } from "../lib/game";

export const quizzes = {
  list: authed.handler(async ({ context }) => {
    const rows = await db.select().from(s.quizzes).where(eq(s.quizzes.userId, context.user.id)).orderBy(desc(s.quizzes.createdAt));
    return rows.map((q) => ({ ...q, questionCount: JSON.parse(q.questions).length }));
  }),

  get: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const [row] = await db.select().from(s.quizzes).where(and(eq(s.quizzes.id, input.id), eq(s.quizzes.userId, context.user.id)));
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Quiz not found" });
    return { ...row, parsed: JSON.parse(row.questions) as any[] };
  }),

  generate: authed
    .input(z.object({ topicId: z.string(), count: z.number().min(1).max(50).default(5) }))
    .handler(async ({ input, context }) => {
      const [topic] = await db
        .select()
        .from(s.topics)
        .where(and(eq(s.topics.id, input.topicId), eq(s.topics.userId, context.user.id)));
      if (!topic) throw new ORPCError("NOT_FOUND", { message: "Topic not found" });
      await consumeAiQuota(context.user.id, "generate");
      const [subject] = await db.select().from(s.subjects).where(eq(s.subjects.id, topic.subjectId));
      const questions = await generateQuiz(topic.name, subject?.name ?? "General", input.count);
      const [row] = await db
        .insert(s.quizzes)
        .values({
          userId: context.user.id,
          topicId: topic.id,
          subjectId: topic.subjectId,
          title: `${topic.name} Quiz`,
          questions: JSON.stringify(questions),
        })
        .returning();
      return { ...row, parsed: questions };
    }),

  remove: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    await db.delete(s.quizzes).where(and(eq(s.quizzes.id, input.id), eq(s.quizzes.userId, context.user.id)));
    return { ok: true };
  }),

  submit: authed
    .input(z.object({ quizId: z.string(), answers: z.array(z.number()) }))
    .handler(async ({ input, context }) => {
      const [quiz] = await db
        .select()
        .from(s.quizzes)
        .where(and(eq(s.quizzes.id, input.quizId), eq(s.quizzes.userId, context.user.id)));
      if (!quiz) throw new ORPCError("NOT_FOUND", { message: "Quiz not found" });
      const questions = JSON.parse(quiz.questions) as { answerIndex: number }[];
      let correct = 0;
      questions.forEach((q, i) => {
        if (input.answers[i] === q.answerIndex) correct++;
      });
      const total = questions.length;
      const score = Math.round((correct / total) * 100);
      const [attempt] = await db
        .insert(s.quizAttempts)
        .values({
          userId: context.user.id,
          quizId: quiz.id,
          topicId: quiz.topicId,
          subjectId: quiz.subjectId,
          score,
          total,
          correct,
        })
        .returning();
      if (quiz.topicId) await recomputeMastery(context.user.id, quiz.topicId);
      const xp = 20 + correct * 5 + (score === 100 ? 25 : 0);
      const award = await awardXp(context.user.id, xp, "Completed a quiz", { study: true });
      return { attempt, score, correct, total, award };
    }),

  attempts: authed.handler(async ({ context }) => {
    return db.select().from(s.quizAttempts).where(eq(s.quizAttempts.userId, context.user.id)).orderBy(desc(s.quizAttempts.createdAt));
  }),
};
