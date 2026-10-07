import { ORPCError } from "@orpc/server";
import { authed } from "../middleware/auth";

/**
 * Admin access is an env-var allowlist of email addresses, not a database role.
 *
 * Deliberate: there is no way to grant yourself admin through the app, so a
 * compromised account can never escalate. Changing who is an admin is a deploy,
 * which is the correct amount of friction for a tool that can read error logs
 * and hide other people's content.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(email?: string | null): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/**
 * Admin-only procedures. Returns NOT_FOUND rather than FORBIDDEN so the
 * existence of the admin surface isn't confirmed to a probing user.
 */
export const adminOnly = authed.use(async ({ context, next }) => {
  if (!isAdmin(context.user.email)) throw new ORPCError("NOT_FOUND");
  return next();
});
