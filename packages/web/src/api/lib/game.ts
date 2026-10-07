import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";

export function levelForXp(xp: number): number {
  return Math.floor(xp / 500) + 1;
}
export function xpForLevel(level: number): number {
  return (level - 1) * 500;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function ensureProfile(userId: string) {
  const [existing] = await db
    .select()
    .from(s.gameProfiles)
    .where(eq(s.gameProfiles.userId, userId));
  if (existing) {
    // Expire a streak the moment a study day is missed, so the number on the
    // dashboard is always truthful rather than frozen at its last value.
    const today = todayStr();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const alive = existing.lastActiveDate === today || existing.lastActiveDate === yesterday;
    if (existing.streak > 0 && !alive) {
      await db.update(s.gameProfiles).set({ streak: 0 }).where(eq(s.gameProfiles.userId, userId));
      return { ...existing, streak: 0 };
    }
    return existing;
  }
  const [created] = await db
    .insert(s.gameProfiles)
    .values({ userId })
    .returning();
  return created!;
}

export interface AchievementDef {
  key: string;
  title: string;
  emoji: string;
  description: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "first_note", title: "First Note", emoji: "📝", description: "Create your first note" },
  { key: "first_assignment", title: "First Assignment", emoji: "🏆", description: "Add your first assignment" },
  { key: "first_quiz", title: "Quiz Rookie", emoji: "🎯", description: "Complete your first quiz" },
  { key: "quiz_master", title: "Quiz Master", emoji: "🧠", description: "Score 100% on a quiz" },
  { key: "flash_100", title: "Card Shark", emoji: "📚", description: "Review 100 flashcards" },
  { key: "streak_7", title: "On Fire", emoji: "🔥", description: "Maintain a 7-day streak" },
  { key: "streak_30", title: "Unstoppable", emoji: "🔥", description: "Maintain a 30-day streak" },
  { key: "focus_10", title: "Deep Worker", emoji: "🎧", description: "Complete 10 focus sessions" },
  { key: "level_5", title: "Rising Scholar", emoji: "⭐", description: "Reach level 5" },
  { key: "level_10", title: "Semester Champion", emoji: "🎓", description: "Reach level 10" },
  { key: "graph_builder", title: "Graph Builder", emoji: "🕸️", description: "Create 10 connected concepts" },
  { key: "note_10", title: "Note Taker", emoji: "🗒️", description: "Write 10 notes" },
  { key: "note_50", title: "Archivist", emoji: "🗂️", description: "Write 50 notes" },
  { key: "streak_3", title: "Warming Up", emoji: "✨", description: "Maintain a 3-day streak" },
  { key: "streak_14", title: "Fortnight Focus", emoji: "🔥", description: "Maintain a 14-day streak" },
  { key: "streak_100", title: "Centurion", emoji: "💯", description: "Maintain a 100-day streak" },
  { key: "level_20", title: "Dean’s List", emoji: "🥇", description: "Reach level 20" },
  { key: "level_30", title: "Polymath", emoji: "👑", description: "Reach level 30" },
  { key: "quiz_10", title: "Quiz Regular", emoji: "📋", description: "Complete 10 quizzes" },
  { key: "quiz_50", title: "Exam Ready", emoji: "🎖️", description: "Complete 50 quizzes" },
  { key: "perfect_5", title: "Flawless Five", emoji: "🌟", description: "Score 100% on 5 quizzes" },
  { key: "flash_500", title: "Memory Machine", emoji: "🧩", description: "Review 500 flashcards" },
  { key: "focus_50", title: "Focus Veteran", emoji: "🛡️", description: "Complete 50 focus sessions" },
  { key: "focus_hours_10", title: "Ten Hours Deep", emoji: "⏳", description: "Log 10 hours of focused study" },
  { key: "focus_hours_50", title: "Fifty Hours Deep", emoji: "🏔️", description: "Log 50 hours of focused study" },
  { key: "deep_focus", title: "Laser Locked", emoji: "🎯", description: "Finish a session with a focus score of 90+" },
  { key: "reflector", title: "Reflective Learner", emoji: "🪞", description: "Write reflections on 5 sessions" },
  { key: "assignment_done", title: "Task Slayer", emoji: "✅", description: "Complete your first assignment" },
  { key: "assignment_10", title: "Deadline Crusher", emoji: "🚀", description: "Complete 10 assignments" },
  { key: "subject_5", title: "Well Rounded", emoji: "🎨", description: "Track 5 subjects" },
  { key: "mastered_1", title: "Concept Cracked", emoji: "🔓", description: "Reach 90% mastery on a concept" },
  { key: "mastered_10", title: "Domain Expert", emoji: "🧭", description: "Reach 90% mastery on 10 concepts" },
  { key: "linked_10", title: "Web Weaver", emoji: "🔗", description: "Create 10 links between concepts" },
  { key: "group_joined", title: "Study Buddy", emoji: "🤝", description: "Join a study group" },
  { key: "reviewer", title: "Voice Heard", emoji: "💬", description: "Write a review of OrbitL" },
];

async function unlock(userId: string, key: string): Promise<string | null> {
  const [existing] = await db
    .select()
    .from(s.achievements)
    .where(and(eq(s.achievements.userId, userId), eq(s.achievements.key, key)));
  if (existing) return null;
  await db.insert(s.achievements).values({ userId, key });
  return key;
}

export async function checkAchievements(userId: string): Promise<string[]> {
  const unlocked: string[] = [];
  const push = async (cond: boolean, key: string) => {
    if (cond) {
      const r = await unlock(userId, key);
      if (r) unlocked.push(r);
    }
  };

  const [profile] = await db.select().from(s.gameProfiles).where(eq(s.gameProfiles.userId, userId));
  const count = async (table: any, extra?: any) => {
    const [row] = await db
      .select({ c: sql<number>`count(*)` })
      .from(table)
      .where(extra ? and(eq(table.userId, userId), extra) : eq(table.userId, userId));
    return Number(row?.c ?? 0);
  };

  const notes = await count(s.notes);
  const assignments = await count(s.assignments);
  const assignmentsDone = await count(s.assignments, eq(s.assignments.status, "done"));
  const attempts = await count(s.quizAttempts);
  const perfect = await count(s.quizAttempts, eq(s.quizAttempts.score, 100));
  const sessions = await count(s.studySessions);
  const topics = await count(s.topics);
  const subjects = await count(s.subjects);
  const links = await count(s.topicLinks);
  const groups = await count(s.groupMembers);
  const reviewsWritten = await count(s.reviews);
  const mastered = await count(s.topics, gte(s.topics.mastery, 90));
  const deepSessions = await count(s.studySessions, gte(s.studySessions.focusScore, 90));
  const reflections = await count(s.studySessions, sql`${s.studySessions.reflection} is not null and trim(${s.studySessions.reflection}) != ''`);
  const [focusRow] = await db
    .select({ c: sql<number>`coalesce(sum(${s.studySessions.durationSec}),0)` })
    .from(s.studySessions)
    .where(eq(s.studySessions.userId, userId));
  const focusHours = Number(focusRow?.c ?? 0) / 3600;
  const [flashRow] = await db
    .select({ c: sql<number>`coalesce(sum(${s.flashcards.ease}),0)` })
    .from(s.flashcards)
    .where(eq(s.flashcards.userId, userId));
  const reviews = Number(flashRow?.c ?? 0);

  await push(notes >= 1, "first_note");
  await push(assignments >= 1, "first_assignment");
  await push(attempts >= 1, "first_quiz");
  await push(perfect >= 1, "quiz_master");
  await push(reviews >= 100, "flash_100");
  await push((profile?.streak ?? 0) >= 7, "streak_7");
  await push((profile?.streak ?? 0) >= 30, "streak_30");
  await push(sessions >= 10, "focus_10");
  await push((profile?.level ?? 1) >= 5, "level_5");
  await push((profile?.level ?? 1) >= 10, "level_10");
  await push(topics >= 10, "graph_builder");
  await push(notes >= 10, "note_10");
  await push(notes >= 50, "note_50");
  await push((profile?.streak ?? 0) >= 3, "streak_3");
  await push((profile?.streak ?? 0) >= 14, "streak_14");
  await push((profile?.streak ?? 0) >= 100, "streak_100");
  await push((profile?.level ?? 1) >= 20, "level_20");
  await push((profile?.level ?? 1) >= 30, "level_30");
  await push(attempts >= 10, "quiz_10");
  await push(attempts >= 50, "quiz_50");
  await push(perfect >= 5, "perfect_5");
  await push(reviews >= 500, "flash_500");
  await push(sessions >= 50, "focus_50");
  await push(focusHours >= 10, "focus_hours_10");
  await push(focusHours >= 50, "focus_hours_50");
  await push(deepSessions >= 1, "deep_focus");
  await push(reflections >= 5, "reflector");
  await push(assignmentsDone >= 1, "assignment_done");
  await push(assignmentsDone >= 10, "assignment_10");
  await push(subjects >= 5, "subject_5");
  await push(mastered >= 1, "mastered_1");
  await push(mastered >= 10, "mastered_10");
  await push(links >= 10, "linked_10");
  await push(groups >= 1, "group_joined");
  await push(reviewsWritten >= 1, "reviewer");

  return unlocked;
}

export interface AwardResult {
  xp: number;
  level: number;
  leveledUp: boolean;
  streak: number;
  newAchievements: string[];
}

export interface AwardOptions {
  /**
   * Whether this action counts as logged study for the streak.
   *
   * Only real study effort moves the streak — focus sessions, quiz attempts,
   * flashcard reviews and notes. Housekeeping (creating a subject, adding an
   * assignment, posting a review) still earns XP but must never fake a
   * "study day", otherwise the streak stops meaning anything.
   */
  study?: boolean;
}

export async function awardXp(
  userId: string,
  amount: number,
  reason: string,
  options: AwardOptions = {},
): Promise<AwardResult> {
  const profile = await ensureProfile(userId);
  const today = todayStr();

  // Streak only advances on logged study, and at most once per calendar day.
  let streak = profile.streak;
  let longest = profile.longestStreak;
  let lastActiveDate = profile.lastActiveDate;
  if (options.study && profile.lastActiveDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    streak = profile.lastActiveDate === yesterday ? streak + 1 : 1;
    longest = Math.max(longest, streak);
    lastActiveDate = today;
  }

  const newXp = profile.xp + amount;
  const newLevel = levelForXp(newXp);
  const leveledUp = newLevel > profile.level;

  await db
    .update(s.gameProfiles)
    .set({
      xp: newXp,
      level: newLevel,
      streak,
      longestStreak: longest,
      lastActiveDate,
      updatedAt: new Date(),
    })
    .where(eq(s.gameProfiles.userId, userId));

  if (amount !== 0) {
    await db.insert(s.xpEvents).values({ userId, amount, reason });
  }

  const newAchievements = await checkAchievements(userId);
  return { xp: newXp, level: newLevel, leveledUp, streak, newAchievements };
}

/** Recompute a topic's mastery from recent quiz attempts + flashcard reviews. */
export async function recomputeMastery(userId: string, topicId: string) {
  const attempts = await db
    .select()
    .from(s.quizAttempts)
    .where(and(eq(s.quizAttempts.userId, userId), eq(s.quizAttempts.topicId, topicId)));
  if (attempts.length === 0) return;
  const recent = attempts.slice(-5);
  const avg = Math.round(recent.reduce((a, b) => a + b.score, 0) / recent.length);
  await db.update(s.topics).set({ mastery: avg }).where(eq(s.topics.id, topicId));
}

export async function recentXp(userId: string, days: number): Promise<number> {
  const since = new Date(Date.now() - days * 86400000);
  const [row] = await db
    .select({ c: sql<number>`coalesce(sum(${s.xpEvents.amount}),0)` })
    .from(s.xpEvents)
    .where(and(eq(s.xpEvents.userId, userId), gte(s.xpEvents.createdAt, since)));
  return Number(row?.c ?? 0);
}
