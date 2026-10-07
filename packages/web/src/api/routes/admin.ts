import { z } from "zod";
import { adminOnly } from "../lib/admin";
import { budgetCaps, currentSpend, recentSpend } from "../lib/ai-budget";
import { backupDownloadUrl, listBackups, RETENTION_DAYS } from "../services/backup";
import { clearErrors, errorSummary, healthSnapshot, recentErrors } from "../services/monitoring";
import { runJobNow, schedulerStatus } from "../services/scheduler";

/**
 * Operator dashboard.
 *
 * Everything here is read-mostly diagnostics plus a few deliberate buttons.
 * Access is the `ADMIN_EMAILS` allowlist via `adminOnly`, which answers
 * NOT_FOUND to everyone else so the surface isn't discoverable.
 */
export const admin = {
  /** True for admins, false for everyone else — used to show or hide the nav entry. */
  whoami: adminOnly.handler(({ context }) => ({ admin: true as const, email: context.user.email })),

  /** One call for the dashboard's top-of-page state. */
  overview: adminOnly.handler(async () => {
    const [health, errors, spend, jobs] = await Promise.all([
      healthSnapshot(),
      errorSummary(),
      currentSpend(),
      schedulerStatus(),
    ]);
    return {
      health,
      errors,
      spend: {
        day: spend.day,
        month: spend.month,
        today: spend.today,
        thisMonth: spend.thisMonth,
        caps: budgetCaps(),
      },
      jobs,
    };
  }),

  errors: adminOnly
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }).default({ limit: 50 }))
    .handler(async ({ input }) => recentErrors(input.limit)),

  clearErrors: adminOnly
    .input(z.object({ id: z.string().optional() }).default({}))
    .handler(async ({ input }) => clearErrors(input.id)),

  spendHistory: adminOnly
    .input(z.object({ days: z.number().min(1).max(90).default(14) }).default({ days: 14 }))
    .handler(async ({ input }) => recentSpend(input.days)),

  backups: adminOnly.handler(async () => ({
    items: await listBackups(),
    retentionDays: RETENTION_DAYS,
  })),

  /** Runs the nightly dump immediately. */
  backupNow: adminOnly.handler(async () => runJobNow("db-backup")),

  /** Short-lived signed link. Dumps contain everyone's data, so it expires fast. */
  backupLink: adminOnly
    .input(z.object({ key: z.string() }))
    .handler(async ({ input }) => ({ url: await backupDownloadUrl(input.key) })),

  /** Force any scheduled job to run now, for testing or recovery. */
  runJob: adminOnly
    .input(z.object({ name: z.enum(["streak-reminders", "db-backup", "cleanup"]) }))
    .handler(async ({ input }) => runJobNow(input.name)),
};
