import { and, eq, gt, inArray, isNotNull, or, isNull, lt } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { user as userTable } from "../database/auth-schema";
import { appUrl } from "../auth";
import { sendStreakReminderEmail } from "./email";

const DAY = 86400000;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Streak reminders.
 *
 * A streak is only worth building if something reminds you about it, so once a
 * day we email everyone who has a live streak but hasn't logged study today.
 * Eligibility is deliberately narrow — no streak, opted out, already studied,
 * or already reminded in the last 20 hours means no email.
 *
 * Called by `POST /api/cron/streak-reminders` (secret-guarded) so an external
 * scheduler owns the timing; nothing runs on a timer inside the app process.
 */
export async function runStreakReminders({ dryRun = false }: { dryRun?: boolean } = {}) {
  const today = todayStr();
  const cutoff = new Date(Date.now() - 20 * 3600000);

  const candidates = await db
    .select({
      userId: s.gameProfiles.userId,
      streak: s.gameProfiles.streak,
      lastActiveDate: s.gameProfiles.lastActiveDate,
      lastReminderAt: s.gameProfiles.lastReminderAt,
      email: userTable.email,
      name: userTable.name,
    })
    .from(s.gameProfiles)
    .innerJoin(userTable, eq(userTable.id, s.gameProfiles.userId))
    .where(
      and(
        eq(s.gameProfiles.streakReminders, true),
        gt(s.gameProfiles.streak, 0),
        isNotNull(s.gameProfiles.lastActiveDate),
        // Not studied today.
        or(isNull(s.gameProfiles.lastActiveDate), lt(s.gameProfiles.lastActiveDate, today)),
        // Not already reminded in the last 20h.
        or(isNull(s.gameProfiles.lastReminderAt), lt(s.gameProfiles.lastReminderAt, cutoff)),
      ),
    );

  // A streak that already died (last study before yesterday) has nothing left
  // to save, so it isn't worth an email.
  const yesterday = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  const eligible = candidates.filter((c) => c.lastActiveDate === yesterday);

  if (dryRun) {
    return { scanned: candidates.length, sent: 0, failed: 0, dryRun: true, eligible: eligible.length };
  }

  let sent = 0;
  let failed = 0;
  for (const c of eligible) {
    try {
      await sendStreakReminderEmail(c.email, c.name ?? null, c.streak, appUrl);
      sent++;
    } catch (err) {
      failed++;
      console.error(`[reminders] failed for ${c.userId}`, err);
    }
  }

  if (sent > 0) {
    await db
      .update(s.gameProfiles)
      .set({ lastReminderAt: new Date() })
      .where(inArray(s.gameProfiles.userId, eligible.map((c) => c.userId)));
  }

  return { scanned: candidates.length, eligible: eligible.length, sent, failed, dryRun: false };
}
