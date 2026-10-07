import type { RouterClient } from "@orpc/server";
import { createApp } from "./__core/app";
import { auth } from "./auth";
import { hit } from "./lib/rate-limit";
import { describeThrown, healthSnapshot, logError } from "./services/monitoring";
import { startScheduler } from "./services/scheduler";
import { runStreakReminders } from "./services/reminders";
import { ping } from "./routes/ping";
import { subjects } from "./routes/subjects";
import { topics } from "./routes/topics";
import { notes } from "./routes/notes";
import { flashcards } from "./routes/flashcards";
import { quizzes } from "./routes/quizzes";
import { assignments } from "./routes/assignments";
import { focus } from "./routes/focus";
import { game } from "./routes/game";
import { coach } from "./routes/coach";
import { groups } from "./routes/groups";
import { upload } from "./routes/upload";
import { insights } from "./routes/insights";
import { me } from "./routes/me";
import { reviews } from "./routes/reviews";
import { moderation } from "./routes/moderation";
import { admin } from "./routes/admin";

export const router = {
  ping,
  me,
  subjects,
  topics,
  notes,
  flashcards,
  quizzes,
  assignments,
  focus,
  game,
  coach,
  groups,
  upload,
  insights,
  reviews,
  moderation,
  admin,
};

export type AppRouter = typeof router;
/** Typed client for the router — used by the web and mobile api clients. */
export type AppRouterClient = RouterClient<AppRouter>;

const app = createApp(router);

// Better Auth handler
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

/**
 * Deep health check for uptime monitoring.
 *
 * `createApp` already serves a static `/api/health` and Hono matches the first
 * registration, so this richer check — which does a real database round-trip —
 * lives on its own path rather than trying to shadow it. Point the uptime
 * monitor here: a process that is up with a dead database is the outage worth
 * paging about, and the static route cannot tell you that.
 */
app.get("/api/health/deep", async (c) => {
  const snapshot = await healthSnapshot();
  return c.json(snapshot, snapshot.status === "ok" ? 200 : 503);
});

/**
 * Client-side error reporting. The browser error boundary posts here so that
 * faults users actually hit show up next to server faults instead of dying in a
 * console nobody reads. Rate limited per IP because it is unauthenticated.
 */
app.post("/api/errors", async (c) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("cf-connecting-ip") || "unknown";
  const gate = await hit(`errors:${ip}`, { limit: 30, windowMs: 60 * 60 * 1000 });
  if (!gate.ok) return c.json({ ok: false }, 429);

  try {
    const body = (await c.req.json()) as { message?: string; stack?: string; path?: string };
    if (!body?.message) return c.json({ ok: false }, 400);

    const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
    await logError({
      source: "web",
      message: String(body.message),
      stack: body.stack ? String(body.stack) : null,
      path: body.path ? String(body.path) : null,
      userId: session?.user?.id ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    });
    return c.json({ ok: true }, 202);
  } catch {
    return c.json({ ok: false }, 400);
  }
});

/**
 * Streak reminder job. The in-process scheduler runs this daily, but the route
 * stays as the escape hatch for an external scheduler and for forcing a run.
 * Guarded by CRON_SECRET; if the secret isn't configured the route stays closed
 * rather than open.
 */
app.post("/api/cron/streak-reminders", async (c) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return c.json({ error: "CRON_SECRET is not configured" }, 503);

  const provided = c.req.header("authorization")?.replace(/^Bearer /i, "") ?? c.req.query("secret");
  if (provided !== secret) return c.json({ error: "Unauthorized" }, 401);

  const result = await runStreakReminders({ dryRun: c.req.query("dryRun") === "1" });
  return c.json(result, 200);
});

/**
 * Last-resort handler for anything thrown outside oRPC (plain routes, the auth
 * handler, middleware). Records the fault and returns a generic message —
 * stack traces must never reach the client.
 */
app.onError((err, c) => {
  const { message, stack } = describeThrown(err);
  void logError({
    source: "api",
    message,
    stack,
    path: new URL(c.req.url).pathname,
    userAgent: c.req.header("user-agent") ?? null,
  });
  return c.json({ error: "Something went wrong on our end." }, 500);
});

// Background jobs (backups, reminders, cleanup). Claimed through the database so
// exactly one instance runs each job, and so a restart cannot skip a day.
startScheduler();

export default app;
