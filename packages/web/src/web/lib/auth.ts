import { createAuthClient } from "better-auth/react";
import { managedAuthClient } from "@runablehq/managed-auth/client";

// Both are injected at build time by the platform. They are required — without
// them the broker can't identify this app, so fail loudly at startup rather
// than shipping a build where every sign-in silently breaks.
const applicationId = import.meta.env.VITE_APPLICATION_ID;
const issuer = import.meta.env.VITE_RUNABLE_AUTH_ISSUER;

if (!applicationId || !issuer) {
  throw new Error(
    "Auth is not configured: VITE_APPLICATION_ID and VITE_RUNABLE_AUTH_ISSUER must both be set.",
  );
}

const config = { applicationId, issuer };

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_WEBSITE_URL ?? window.location.origin,
  basePath: "/api/auth",
  plugins: [managedAuthClient(config)],
  // The session is not re-checked on a timer or every time the tab regains
  // focus. Those background checks are what made the app appear to refresh by
  // itself: a single failed or expired check briefly leaves the client with no
  // session, which swaps the whole app out and destroys anything in progress.
  // Cross-tab sign-in/sign-out still propagates over the broadcast channel, and
  // a genuinely expired session is caught on the next API call.
  sessionOptions: {
    refetchInterval: 0,
    refetchOnWindowFocus: false,
  },
});
