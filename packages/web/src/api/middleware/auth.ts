import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { auth } from "../auth";
import { describeThrown, logError } from "../services/monitoring";

/**
 * Codes that represent a user doing something disallowed rather than the server
 * being broken. These are the normal working of the API, so logging them would
 * bury real faults in noise.
 */
const EXPECTED = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "BAD_REQUEST",
  "CONFLICT",
  "TOO_MANY_REQUESTS",
  "INPUT_VALIDATION_FAILED",
]);

/**
 * Records unexpected procedure failures.
 *
 * oRPC turns a thrown error into an error *response* rather than letting it
 * escape to Hono's `onError`, so the RPC layer would otherwise be a blind spot:
 * users would see "something went wrong" and we would have no record of it.
 * Applied once here so every procedure inherits it.
 */
const monitored = base.use(async ({ next, path, context }) => {
  try {
    return await next();
  } catch (err) {
    const code = err instanceof ORPCError ? err.code : null;
    if (!code || !EXPECTED.has(code)) {
      const { message, stack } = describeThrown(err);
      await logError({
        source: "rpc",
        message,
        stack,
        path: path.join("."),
        userAgent: context.headers.get("user-agent"),
      });
    }
    throw err;
  }
});

/** Optional auth — `context.user` is the session user or null. */
export const withUser = monitored.use(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  return next({
    context: { user: session?.user ?? null, session: session?.session ?? null },
  });
});

/** Protected procedures — rejects unauthenticated calls; `context.user` is non-null. */
export const authed = monitored.use(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  if (!session) throw new ORPCError("UNAUTHORIZED");
  return next({ context: { user: session.user, session: session.session } });
});
