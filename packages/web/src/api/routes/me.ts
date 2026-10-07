import { eq, sql } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { authed } from "../middleware/auth";
import { db } from "../database";
import * as s from "../database/schema";
import { ensureProfile } from "../lib/game";

/**
 * Any table that belongs to a user. Every per-user table in the schema carries
 * a `user_id`, so one helper can count or export rows from all of them without
 * a cast per table.
 */
type UserOwnedTable = SQLiteTable & { userId: SQLiteColumn };

// Optional demo dataset. NEVER seeded automatically — a new account starts
// completely empty so the dashboard reflects the user's own work from day one.
// Users can load this on demand from the empty state or Settings.
const SEED = [
  {
    name: "Physics",
    color: "#2563EB",
    icon: "atom",
    topics: [
      { name: "Mechanics", mastery: 78, children: [
        { name: "Newton's Laws", mastery: 88 },
        { name: "Momentum", mastery: 72 },
        { name: "Work & Energy", mastery: 65 },
        { name: "Circular Motion", mastery: 54 },
      ] },
      { name: "Electricity", mastery: 61, children: [
        { name: "Ohm's Law", mastery: 70 },
        { name: "Circuits", mastery: 52 },
      ] },
      { name: "Waves", mastery: 44, children: [] },
      { name: "Optics", mastery: 38, children: [] },
    ],
  },
  {
    name: "Calculus",
    color: "#4F46E5",
    icon: "sigma",
    topics: [
      { name: "Limits", mastery: 82, children: [] },
      { name: "Derivatives", mastery: 74, children: [
        { name: "Chain Rule", mastery: 68 },
        { name: "Product Rule", mastery: 71 },
      ] },
      { name: "Integration", mastery: 41, children: [
        { name: "Definite Integrals", mastery: 45 },
        { name: "u-Substitution", mastery: 33 },
      ] },
    ],
  },
  {
    name: "Chemistry",
    color: "#06B6D4",
    icon: "flask-conical",
    topics: [
      { name: "Atomic Structure", mastery: 69, children: [] },
      { name: "Chemical Bonding", mastery: 58, children: [] },
      { name: "Stoichiometry", mastery: 47, children: [] },
    ],
  },
];

export const me = {
  status: authed.handler(async ({ context }) => {
    const uid = context.user.id;
    const profile = await ensureProfile(uid);
    const count = async (table: UserOwnedTable) => {
      const [row] = await db
        .select({ c: sql<number>`count(*)` })
        .from(table)
        .where(eq(table.userId, uid));
      return Number(row?.c ?? 0);
    };

    const [subjects, notes, sessions, attempts] = await Promise.all([
      count(s.subjects),
      count(s.notes),
      count(s.studySessions),
      count(s.quizAttempts),
    ]);

    return {
      user: context.user,
      seeded: subjects > 0,
      onboarded: profile.onboardedAt != null,
      // Drives the getting-started checklist on an empty dashboard.
      progress: {
        subjects,
        notes,
        sessions,
        attempts,
        hasStudied: sessions > 0 || attempts > 0 || notes > 0,
      },
    };
  }),

  /** Email preferences. Verification state lives on the auth user record. */
  emailPrefs: authed.handler(async ({ context }) => {
    const profile = await ensureProfile(context.user.id);
    return {
      streakReminders: profile.streakReminders,
      emailVerified: context.user.emailVerified,
      email: context.user.email,
    };
  }),

  setEmailPrefs: authed
    .input(z.object({ streakReminders: z.boolean() }))
    .handler(async ({ context, input }) => {
      await ensureProfile(context.user.id);
      await db
        .update(s.gameProfiles)
        .set({ streakReminders: input.streakReminders })
        .where(eq(s.gameProfiles.userId, context.user.id));
      return { ok: true };
    }),

  /** Marks the welcome tutorial as seen (whether completed or skipped). */
  completeOnboarding: authed.handler(async ({ context }) => {
    await ensureProfile(context.user.id);
    await db
      .update(s.gameProfiles)
      .set({ onboardedAt: new Date() })
      .where(eq(s.gameProfiles.userId, context.user.id));
    return { ok: true };
  }),

  /**
   * Full machine-readable export of everything the account owns.
   *
   * The counterpart to account deletion: a user can take their work with them
   * before they leave, which is also what data-protection rules expect.
   */
  exportData: authed.handler(async ({ context }) => {
    const uid = context.user.id;
    const mine = async (table: UserOwnedTable) =>
      await db.select().from(table).where(eq(table.userId, uid));

    const [profile] = await db.select().from(s.gameProfiles).where(eq(s.gameProfiles.userId, uid));
    const memberships = await db.select().from(s.groupMembers).where(eq(s.groupMembers.userId, uid));

    return {
      exportedAt: new Date().toISOString(),
      format: "orbitl.export.v1",
      account: {
        id: uid,
        name: context.user.name,
        email: context.user.email,
        emailVerified: context.user.emailVerified,
        createdAt: context.user.createdAt,
      },
      profile: profile ?? null,
      subjects: await mine(s.subjects),
      topics: await mine(s.topics),
      topicLinks: await mine(s.topicLinks),
      notes: await mine(s.notes),
      noteComments: await mine(s.noteComments),
      flashcards: await mine(s.flashcards),
      quizzes: await mine(s.quizzes),
      quizAttempts: await mine(s.quizAttempts),
      assignments: await mine(s.assignments),
      studySessions: await mine(s.studySessions),
      xpEvents: await mine(s.xpEvents),
      achievements: await mine(s.achievements),
      coachMessages: await mine(s.coachMessages),
      reviews: await mine(s.reviews),
      groupsOwned: await db.select().from(s.studyGroups).where(eq(s.studyGroups.ownerId, uid)),
      groupMemberships: memberships,
      groupMessages: await mine(s.groupMessages),
    };
  }),

  /** Wipes all of the user's study data back to a clean slate. */
  resetData: authed.handler(async ({ context }) => {
    const uid = context.user.id;
    for (const table of [
      s.quizAttempts, s.quizzes, s.flashcards, s.noteComments, s.notes,
      s.assignments, s.studySessions, s.xpEvents, s.coachMessages,
      s.topicLinks, s.topics, s.subjects, s.achievements,
    ]) {
      await db.delete(table as never).where(eq((table as never as typeof s.subjects).userId, uid));
    }
    await db
      .update(s.gameProfiles)
      .set({ xp: 0, level: 1, streak: 0, longestStreak: 0, lastActiveDate: null })
      .where(eq(s.gameProfiles.userId, uid));
    return { ok: true };
  }),

  seed: authed.handler(async ({ context }) => {
    const uid = context.user.id;
    const [row] = await db.select({ c: sql<number>`count(*)` }).from(s.subjects).where(eq(s.subjects.userId, uid));
    if (Number(row?.c ?? 0) > 0) return { ok: true, already: true };

    const topicIdByName = new Map<string, string>();

    for (const sub of SEED) {
      const [subject] = await db
        .insert(s.subjects)
        .values({ userId: uid, name: sub.name, color: sub.color, icon: sub.icon })
        .returning();
      for (const t of sub.topics) {
        const [parent] = await db
          .insert(s.topics)
          .values({ userId: uid, subjectId: subject!.id, name: t.name, mastery: t.mastery, revisionStatus: t.mastery > 60 ? "revised" : "in_progress" })
          .returning();
        topicIdByName.set(t.name, parent!.id);
        for (const child of t.children ?? []) {
          const [c] = await db
            .insert(s.topics)
            .values({ userId: uid, subjectId: subject!.id, parentId: parent!.id, name: child.name, mastery: child.mastery, revisionStatus: child.mastery > 60 ? "revised" : "in_progress" })
            .returning();
          topicIdByName.set(child.name, c!.id);
        }
      }
    }

    // cross-links (related + prerequisite)
    const link = async (a: string, b: string, type: "related" | "prerequisite") => {
      const s1 = topicIdByName.get(a);
      const s2 = topicIdByName.get(b);
      if (s1 && s2) await db.insert(s.topicLinks).values({ userId: uid, sourceId: s1, targetId: s2, type });
    };
    await link("Newton's Laws", "Momentum", "prerequisite");
    await link("Work & Energy", "Circular Motion", "related");
    await link("Derivatives", "Integration", "prerequisite");
    await link("Limits", "Derivatives", "prerequisite");
    await link("Chain Rule", "u-Substitution", "related");

    // a few assignments
    const now = Date.now();
    await db.insert(s.assignments).values([
      { userId: uid, title: "Calculus Problem Set 4", description: "Integration techniques", subjectId: undefined, dueDate: new Date(now + 2 * 86400000), priority: "high", status: "todo" },
      { userId: uid, title: "Physics Lab Report", description: "Circular motion experiment", dueDate: new Date(now + 5 * 86400000), priority: "medium", status: "in_progress" },
      { userId: uid, title: "Chemistry Reading", description: "Chapter 7 — Bonding", dueDate: new Date(now - 1 * 86400000), priority: "low", status: "done" },
    ]);

    // sample notes
    const integrationTopic = topicIdByName.get("Integration");
    await db.insert(s.notes).values([
      { userId: uid, title: "Integration Cheatsheet", content: "# Integration\n\n- **Power rule**: ∫xⁿ dx = xⁿ⁺¹/(n+1) + C\n- **u-substitution** for composite functions\n- Remember the **+C** constant of integration\n\n> Practice definite integrals daily.", topicId: integrationTopic },
      { userId: uid, title: "Newton's Laws Summary", content: "# Newton's Three Laws\n\n1. **Inertia** — objects resist changes in motion.\n2. **F = ma**\n3. Every action has an equal and opposite reaction.", topicId: topicIdByName.get("Newton's Laws") },
    ]);

    // starter flashcards
    const nl = topicIdByName.get("Newton's Laws");
    const chain = topicIdByName.get("Chain Rule");
    const bonding = topicIdByName.get("Chemical Bonding");
    await db.insert(s.flashcards).values([
      { userId: uid, topicId: nl, front: "State Newton's Second Law.", back: "The net force on an object equals its mass times acceleration: **F = ma**." },
      { userId: uid, topicId: nl, front: "What does Newton's First Law describe?", back: "Inertia — an object stays at rest or in uniform motion unless acted on by a net external force." },
      { userId: uid, topicId: topicIdByName.get("Momentum"), front: "Formula for linear momentum?", back: "p = m·v — mass times velocity, a vector quantity." },
      { userId: uid, topicId: chain, front: "State the chain rule.", back: "d/dx f(g(x)) = f'(g(x)) · g'(x)" },
      { userId: uid, topicId: topicIdByName.get("Integration"), front: "∫xⁿ dx = ?", back: "xⁿ⁺¹/(n+1) + C, for n ≠ -1." },
      { userId: uid, topicId: bonding, front: "Ionic vs covalent bonding?", back: "Ionic bonds transfer electrons between atoms; covalent bonds share electron pairs." },
    ]);

    // a starter quiz
    await db.insert(s.quizzes).values({
      userId: uid,
      topicId: nl,
      title: "Newton's Laws — Warm-up",
      questions: JSON.stringify([
        { question: "An object moves at constant velocity. What is the net force on it?", options: ["Zero", "Equal to its weight", "Equal to m·v", "Increasing"], answerIndex: 0, explanation: "Constant velocity means zero acceleration, so by F = ma the net force is zero." },
        { question: "Which law explains recoil of a fired rifle?", options: ["First law", "Second law", "Third law", "Law of gravitation"], answerIndex: 2, explanation: "Action and reaction: the rifle pushes the bullet forward, the bullet pushes the rifle back." },
        { question: "Doubling the net force on a fixed mass does what to acceleration?", options: ["Halves it", "Doubles it", "No change", "Quadruples it"], answerIndex: 1, explanation: "a = F/m, so acceleration is proportional to net force." },
      ]),
    });

    // seed a few quiz attempts + sessions + xp so charts aren't empty
    const days = [6, 5, 4, 3, 2, 1, 0];
    for (const d of days) {
      const created = new Date(now - d * 86400000 + 3600000 * (18 - d));
      await db.insert(s.studySessions).values({ userId: uid, durationSec: (20 + d * 3) * 60, focusScore: 70 + ((d * 7) % 25), tasksCompleted: 1 + (d % 3), xpEarned: 40 });
      await db.insert(s.xpEvents).values({ userId: uid, amount: 40 + d * 10, reason: "Study activity", createdAt: created });
    }

    await db
      .update(s.gameProfiles)
      .set({ xp: 1240, level: 3, streak: 1, longestStreak: 1, lastActiveDate: new Date().toISOString().slice(0, 10) })
      .where(eq(s.gameProfiles.userId, uid));

    await db.insert(s.coachMessages).values({
      userId: uid,
      kind: "warning",
      title: "Integration needs attention",
      body: "Your mastery in Integration is at 41% — the lowest in Calculus. Spend 45 minutes on u-substitution today to close the gap.",
      reason: "Detected as your weakest concept relative to its prerequisites.",
    });

    return { ok: true, already: false };
  }),
};
