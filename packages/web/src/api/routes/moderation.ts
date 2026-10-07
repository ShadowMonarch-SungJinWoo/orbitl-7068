import { ORPCError } from "@orpc/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../database";
import * as s from "../database/schema";
import { adminOnly } from "../lib/admin";
import { autoFlag, excerpt } from "../lib/moderation";
import { authed } from "../middleware/auth";
import { hit } from "../lib/rate-limit";

/**
 * User reporting and the admin moderation queue.
 *
 * OrbitL has three places one user can show another user text — group messages,
 * note comments and public reviews — so all three need a way to be reported and
 * taken down. Anything user-visible without that is not safe to launch.
 *
 * Hiding sets `hiddenAt` instead of deleting. Deletion would make an appeal
 * impossible and destroy the evidence behind the decision; hidden rows are
 * simply filtered out of every read path.
 */

const TARGETS = ["group_message", "note_comment", "review"] as const;
type Target = (typeof TARGETS)[number];

const REASONS = ["spam", "abuse", "harassment", "sexual", "violence", "other"] as const;

/** Reporting is cheap for the user and costly for us, so it is rate limited. */
const REPORT_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

/** Loads the reported row so the report captures who wrote it and what it said. */
async function loadTarget(type: Target, id: string) {
  if (type === "group_message") {
    const [row] = await db.select().from(s.groupMessages).where(eq(s.groupMessages.id, id));
    return row ? { ownerId: row.userId, text: row.body } : null;
  }
  if (type === "note_comment") {
    const [row] = await db.select().from(s.noteComments).where(eq(s.noteComments.id, id));
    return row ? { ownerId: row.userId, text: row.body } : null;
  }
  const [row] = await db.select().from(s.reviews).where(eq(s.reviews.id, id));
  return row ? { ownerId: row.userId, text: `${row.title} — ${row.body}` } : null;
}

/** Applies or lifts a hide on the underlying row. */
async function setHidden(type: Target, id: string, hidden: boolean, reason: string | null) {
  const patch = { hiddenAt: hidden ? new Date() : null, hiddenReason: hidden ? reason : null };
  if (type === "group_message") {
    await db.update(s.groupMessages).set(patch).where(eq(s.groupMessages.id, id));
  } else if (type === "note_comment") {
    await db.update(s.noteComments).set(patch).where(eq(s.noteComments.id, id));
  } else {
    await db.update(s.reviews).set(patch).where(eq(s.reviews.id, id));
  }
}

/**
 * Called by the write paths (post message, add comment, create review) so
 * obvious abuse enters the queue without waiting for someone to report it.
 */
export async function autoFlagContent(type: Target, id: string, ownerId: string, text: string) {
  const flag = autoFlag(text);
  if (!flag.flagged) return false;
  await db.insert(s.contentReports).values({
    targetType: type,
    targetId: id,
    targetOwnerId: ownerId,
    targetExcerpt: excerpt(text),
    reporterId: "system",
    reason: flag.reason ?? "other",
    note: "Automatically flagged for review",
    autoFlagged: true,
  });
  return true;
}

export const moderation = {
  /** Report a piece of content. Idempotent per user and target. */
  report: authed
    .input(
      z.object({
        targetType: z.enum(TARGETS),
        targetId: z.string(),
        reason: z.enum(REASONS),
        note: z.string().max(500).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const gate = await hit(`report:${context.user.id}`, REPORT_LIMIT);
      if (!gate.ok) {
        throw new ORPCError("TOO_MANY_REQUESTS", {
          message: "You've sent a lot of reports recently. Please try again later.",
        });
      }

      const target = await loadTarget(input.targetType, input.targetId);
      if (!target) throw new ORPCError("NOT_FOUND", { message: "That content no longer exists." });

      // Reporting your own content is almost always a mistake or a test.
      if (target.ownerId === context.user.id) {
        throw new ORPCError("BAD_REQUEST", { message: "You can't report your own content." });
      }

      const [existing] = await db
        .select({ id: s.contentReports.id })
        .from(s.contentReports)
        .where(
          and(
            eq(s.contentReports.targetType, input.targetType),
            eq(s.contentReports.targetId, input.targetId),
            eq(s.contentReports.reporterId, context.user.id),
          ),
        )
        .limit(1);

      // Don't let one user pile up duplicates, but don't tell them off either.
      if (existing) return { ok: true as const, duplicate: true as const };

      await db.insert(s.contentReports).values({
        targetType: input.targetType,
        targetId: input.targetId,
        targetOwnerId: target.ownerId,
        targetExcerpt: excerpt(target.text),
        reporterId: context.user.id,
        reason: input.reason,
        note: input.note ?? null,
      });

      return { ok: true as const, duplicate: false as const };
    }),

  /** Admin: the review queue, open reports first. */
  queue: adminOnly
    .input(
      z
        .object({ status: z.enum(["open", "actioned", "dismissed", "all"]).default("open") })
        .default({ status: "open" }),
    )
    .handler(async ({ input }) => {
      const rows =
        input.status === "all"
          ? await db.select().from(s.contentReports).orderBy(desc(s.contentReports.createdAt)).limit(200)
          : await db
              .select()
              .from(s.contentReports)
              .where(eq(s.contentReports.status, input.status))
              .orderBy(desc(s.contentReports.createdAt))
              .limit(200);

      const [counts] = await db
        .select({
          open: sql<number>`sum(case when ${s.contentReports.status} = 'open' then 1 else 0 end)`,
          total: sql<number>`count(*)`,
        })
        .from(s.contentReports);

      return {
        items: rows,
        counts: { open: Number(counts?.open ?? 0), total: Number(counts?.total ?? 0) },
      };
    }),

  /**
   * Admin: resolve a report. "hide" takes the content down, "dismiss" clears the
   * report and leaves it up, "unhide" reverses a takedown after an appeal.
   */
  resolve: adminOnly
    .input(z.object({ id: z.string(), action: z.enum(["hide", "dismiss", "unhide"]) }))
    .handler(async ({ input, context }) => {
      const [report] = await db.select().from(s.contentReports).where(eq(s.contentReports.id, input.id));
      if (!report) throw new ORPCError("NOT_FOUND");

      const type = report.targetType as Target;
      if (input.action === "hide") {
        await setHidden(type, report.targetId, true, report.reason);
      } else if (input.action === "unhide") {
        await setHidden(type, report.targetId, false, null);
      }

      await db
        .update(s.contentReports)
        .set({
          status: input.action === "dismiss" ? "dismissed" : "actioned",
          resolvedBy: context.user.email ?? context.user.id,
          resolvedAt: new Date(),
        })
        .where(eq(s.contentReports.id, input.id));

      // Resolving one report resolves every open report on the same content.
      await db
        .update(s.contentReports)
        .set({
          status: input.action === "dismiss" ? "dismissed" : "actioned",
          resolvedBy: context.user.email ?? context.user.id,
          resolvedAt: new Date(),
        })
        .where(
          and(
            eq(s.contentReports.targetType, report.targetType),
            eq(s.contentReports.targetId, report.targetId),
            eq(s.contentReports.status, "open"),
          ),
        );

      return { ok: true as const };
    }),

  /** Admin: everything currently hidden, so takedowns can be reviewed or undone. */
  hidden: adminOnly.handler(async () => {
    const messages = await db
      .select({ id: s.groupMessages.id, body: s.groupMessages.body, hiddenAt: s.groupMessages.hiddenAt })
      .from(s.groupMessages)
      .where(sql`${s.groupMessages.hiddenAt} is not null`)
      .limit(100);
    const comments = await db
      .select({ id: s.noteComments.id, body: s.noteComments.body, hiddenAt: s.noteComments.hiddenAt })
      .from(s.noteComments)
      .where(sql`${s.noteComments.hiddenAt} is not null`)
      .limit(100);
    const revs = await db
      .select({ id: s.reviews.id, body: s.reviews.title, hiddenAt: s.reviews.hiddenAt })
      .from(s.reviews)
      .where(sql`${s.reviews.hiddenAt} is not null`)
      .limit(100);
    return {
      group_message: messages,
      note_comment: comments,
      review: revs,
    };
  }),
};

/** Reusable predicate so every read path filters hidden rows the same way. */
export const visibleGroupMessages = isNull(s.groupMessages.hiddenAt);
export const visibleNoteComments = isNull(s.noteComments.hiddenAt);
export const visibleReviews = isNull(s.reviews.hiddenAt);
