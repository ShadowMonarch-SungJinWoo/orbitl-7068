import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { expo } from "@better-auth/expo";
import { runableManagedAuth } from "@runablehq/managed-auth/server";
import { db } from "./database";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from "./services/email";
import { purgeUserData } from "./services/purge";

/**
 * Absolute app URL, used for links inside emails.
 *
 * The trailing slash is stripped: callers append paths like `${appUrl}/focus`,
 * and a configured `WEBSITE_URL` ending in "/" would otherwise produce a
 * double-slashed link in outgoing mail.
 */
export const appUrl = (process.env.WEBSITE_URL ?? "http://localhost:4200").replace(/\/+$/, "");

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.WEBSITE_URL,
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Without this a user who forgets their password is locked out for good.
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, user.name ?? null, url);
    },
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
  },
  emailVerification: {
    // Sent on signup, but sign-in is deliberately NOT blocked on it: an
    // unverified user still gets the whole app, with a banner asking them to
    // confirm. Hard-gating the product on a mail delivery is a bad first run.
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // 24 hours
    sendVerificationEmail: async ({ user, url }) => {
      // Land on the app with a flag so it can confirm success in the UI —
      // the signup-triggered link would otherwise just drop them on "/".
      const link = new URL(url);
      link.searchParams.set("callbackURL", "/?verified=1");
      await sendVerificationEmail(user.email, user.name ?? null, link.toString());
    },
  },
  user: {
    // A privacy policy that promises "email us to delete your account" is not
    // a delete feature. Password-confirmed, in-app, immediate.
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        await purgeUserData(user.id);
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Never let a mail failure break signup.
          try {
            await sendWelcomeEmail(user.email, user.name ?? null, appUrl);
          } catch (err) {
            console.error("[email] welcome email failed", err);
          }
        },
      },
    },
  },
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: (request) => {
    const origin = request?.headers.get("origin");
    return origin ? [origin] : ["*"];
  },
  plugins: [
    ...runableManagedAuth({
      applicationId: process.env.APPLICATION_ID!,
      issuer: process.env.VITE_RUNABLE_AUTH_ISSUER!,
    }),
    expo(),
  ],
});
