import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq, and } from "drizzle-orm";
import { authed } from "../middleware/auth";
import { s3 } from "../lib/s3";
import { db } from "../database";
import * as s from "../database/schema";
import { generateFlashcards, generateQuiz } from "../lib/ai";
import { generateUploadNotes } from "../lib/upload-notes";
import { plainText } from "../lib/rich-text";
import { consumeAiQuota } from "../lib/rate-limit";
import { awardXp } from "../lib/game";
import { extractFileText } from "../services/extract";
import { assertUploadAllowed, safeName, uploadQuota } from "../lib/upload-policy";

export const upload = {
  /**
   * Hands out a short-lived write URL for the bucket. Every abuse control lives
   * here rather than in `ingest`: once a presigned URL exists the bytes can be
   * stored, so an oversized or disallowed file must never get one.
   */
  presign: authed
    .input(
      z.object({
        filename: z.string().min(1),
        contentType: z.string(),
        size: z.number().int().positive(),
      }),
    )
    .handler(async ({ input, context }) => {
      const uid = context.user.id;
      await assertUploadAllowed(uid, input);

      const name = safeName(input.filename);
      const key = `uploads/${uid}/${Date.now()}-${name}`;
      const url = await getSignedUrl(
        s3,
        new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: input.contentType }),
        { expiresIn: 600 },
      );

      // Reserve the quota now. A reserved row that never reaches "stored" still
      // counts against the daily allowance, which is the intent: repeatedly
      // asking for URLs and abandoning them is exactly the abuse being bounded.
      await db.insert(s.uploads).values({
        userId: uid,
        fileKey: key,
        fileName: name,
        contentType: input.contentType || "",
        bytes: input.size,
        status: "reserved",
      });

      return { url, key };
    }),

  /** Current 24-hour upload usage, so the picker can show a quota hint. */
  quota: authed.handler(async ({ context }) => uploadQuota(context.user.id)),

  /**
   * Ingest an uploaded file: create a note, and run the AI pipeline —
   * generate structured notes, flashcards, and a quiz, all linked to the topic.
   */
  ingest: authed
    .input(
      z.object({
        fileKey: z.string(),
        fileName: z.string(),
        title: z.string(),
        subjectId: z.string().optional(),
        topicId: z.string().optional(),
        generateMaterials: z.boolean().default(true),
      }),
    )
    .handler(async ({ input, context }) => {
      const uid = context.user.id;

      // The bytes are in the bucket now, so the reservation becomes a real
      // stored object. Scoped by user so one account can't settle another's row.
      await db
        .update(s.uploads)
        .set({ status: "stored" })
        .where(and(eq(s.uploads.fileKey, input.fileKey), eq(s.uploads.userId, uid)));

      let subjectName = "General";
      let topicName = input.title;
      if (input.topicId) {
        const [t] = await db.select().from(s.topics).where(and(eq(s.topics.id, input.topicId), eq(s.topics.userId, uid)));
        if (t) {
          topicName = t.name;
          const [sub] = await db.select().from(s.subjects).where(eq(s.subjects.id, t.subjectId));
          subjectName = sub?.name ?? subjectName;
        }
      }

      // Read the real file out of storage. Unsupported or unreadable files fall
      // back to topic-only generation instead of failing the whole ingest.
      const extracted = await extractFileText(input.fileKey, input.fileName);
      const source = extracted.ok ? extracted.text : "";

      let content = extracted.ok
        ? extracted.text
        : `Uploaded file: ${input.fileName}${extracted.reason ? ` — ${extracted.reason}` : ""}`;

      if (input.generateMaterials) {
        await consumeAiQuota(uid, "upload");
        content = await generateUploadNotes(
          input.title,
          source,
          `${topicName} in ${subjectName}`,
          extracted.truncated,
        );
      }

      const format = input.generateMaterials ? "html" : "markdown";
      const [note] = await db
        .insert(s.notes)
        .values({
          userId: uid,
          title: input.title,
          content,
          // Upload AI emits native editor tables/math, never raw markup as text.
          format,
          contentText: plainText(content, format),
          subjectId: input.subjectId,
          topicId: input.topicId,
          fileKey: input.fileKey,
          fileName: input.fileName,
        })
        .returning();

      let flashCount = 0;
      let quizId: string | null = null;
      if (input.generateMaterials && input.topicId) {
        const cards = await generateFlashcards(topicName, subjectName, 6, source || undefined);
        if (cards.length) {
          await db.insert(s.flashcards).values(
            cards.map((c) => ({ userId: uid, topicId: input.topicId, subjectId: input.subjectId, front: c.front, back: c.back })),
          );
          flashCount = cards.length;
        }
        const questions = await generateQuiz(topicName, subjectName, 5, source || undefined);
        const [quiz] = await db
          .insert(s.quizzes)
          .values({
            userId: uid,
            topicId: input.topicId,
            subjectId: input.subjectId,
            title: `${topicName} Quiz`,
            questions: JSON.stringify(questions),
          })
          .returning();
        quizId = quiz?.id ?? null;
      }

      await awardXp(uid, 25, "Uploaded and processed study material");
      return {
        note,
        flashCount,
        quizId,
        extraction: {
          ok: extracted.ok,
          chars: extracted.chars,
          kind: extracted.kind,
          reason: extracted.reason ?? null,
          truncated: extracted.truncated ?? false,
        },
      };
    }),
};
