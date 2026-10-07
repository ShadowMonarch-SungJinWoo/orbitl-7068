import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Re-export Better Auth tables so drizzle generates complete migrations.
export * from "./auth-schema";

const now = () => new Date();

/** Subjects — top-level academic areas (Physics, Calculus, ...). */
export const subjects = sqliteTable("subjects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#2563EB"),
  icon: text("icon").notNull().default("book"),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** Topics / concepts — nodes of the knowledge graph. Hierarchical via parentId. */
export const topics = sqliteTable("topics", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  subjectId: text("subject_id").notNull(),
  parentId: text("parent_id"), // null for root topic under a subject
  name: text("name").notNull(),
  summary: text("summary"),
  // mastery 0-100 drives colour coding & readiness
  mastery: integer("mastery").notNull().default(0),
  revisionStatus: text("revision_status").notNull().default("not_started"), // not_started | in_progress | revised
  // cached AI content (JSON string) so we don't regenerate/charge repeatedly
  aiContent: text("ai_content"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** Directed links between topics: prerequisite | related. */
export const topicLinks = sqliteTable("topic_links", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  sourceId: text("source_id").notNull(),
  targetId: text("target_id").notNull(),
  type: text("type").notNull().default("related"), // related | prerequisite
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** Notes — markdown documents, optionally linked to a topic, optionally shared. */
export const notes = sqliteTable("notes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  subjectId: text("subject_id"),
  topicId: text("topic_id"),
  title: text("title").notNull().default("Untitled"),
  content: text("content").notNull().default(""),
  /**
   * "markdown" for notes written before the rich-text editor landed, "html" for
   * anything the TipTap editor has saved. Legacy rows are converted on first open
   * rather than in a big migration, so an unopened note is never silently rewritten.
   */
  format: text("format").notNull().default("markdown"),
  /**
   * Plain-text mirror of `content`. The AI prompts and search read this instead of
   * the markup, so a note full of tables and LaTeX doesn't feed tags to the model.
   */
  contentText: text("content_text").notNull().default(""),
  fileKey: text("file_key"), // tigris key if uploaded from a file
  fileName: text("file_name"),
  groupId: text("group_id"), // if shared to a study group
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(now),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** Flashcards. */
export const flashcards = sqliteTable("flashcards", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  topicId: text("topic_id"),
  subjectId: text("subject_id"),
  front: text("front").notNull(),
  back: text("back").notNull(),
  // spaced repetition (SM-2). `ease` is the legacy "times correct" counter,
  // kept because it still drives the browse-tab sort and old rows have it.
  ease: integer("ease").notNull().default(0),
  /** Days until the next review. 0 = learning/relearning. */
  interval: integer("interval").notNull().default(0),
  /** SM-2 ease factor, stored x100 to stay an integer (250 = 2.5). */
  easeFactor: integer("ease_factor").notNull().default(250),
  /** Consecutive successes; reset to 0 on a lapse. */
  reps: integer("reps").notNull().default(0),
  /** Lifetime failure count. */
  lapses: integer("lapses").notNull().default(0),
  /** When this card is next owed. Null = never reviewed, due immediately. */
  dueAt: integer("due_at", { mode: "timestamp" }),
  lastReviewed: integer("last_reviewed", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** Quizzes and their questions/attempts. */
export const quizzes = sqliteTable("quizzes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  topicId: text("topic_id"),
  subjectId: text("subject_id"),
  title: text("title").notNull(),
  // JSON array of { question, options[4], answerIndex, explanation }
  questions: text("questions").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const quizAttempts = sqliteTable("quiz_attempts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  quizId: text("quiz_id").notNull(),
  topicId: text("topic_id"),
  subjectId: text("subject_id"),
  score: integer("score").notNull(), // percentage 0-100
  total: integer("total").notNull(),
  correct: integer("correct").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** Assignments. */
export const assignments = sqliteTable("assignments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  subjectId: text("subject_id"),
  topicId: text("topic_id"),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: integer("due_date", { mode: "timestamp" }),
  status: text("status").notNull().default("todo"), // todo | in_progress | done
  priority: text("priority").notNull().default("medium"), // low | medium | high
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** Focus / study sessions (Pomodoro). */
export const studySessions = sqliteTable("study_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  subjectId: text("subject_id"),
  topicId: text("topic_id"),
  durationSec: integer("duration_sec").notNull(),
  focusScore: integer("focus_score").notNull().default(100),
  tasksCompleted: integer("tasks_completed").notNull().default(0),
  xpEarned: integer("xp_earned").notNull().default(0),
  /**
   * What the user was actually studying. `topicId` links to a real topic when they
   * picked one; `concept` is the free-typed label, kept even when it matches a topic
   * so the history stays readable after a topic is renamed or deleted.
   */
  concept: text("concept"),
  /** Timer preset in effect: "pomodoro" | "deep" | "sprint" | "custom". */
  mode: text("mode").notNull().default("pomodoro"),
  focusMinutes: integer("focus_minutes").notNull().default(25),
  breakMinutes: integer("break_minutes").notNull().default(5),
  longBreakMinutes: integer("long_break_minutes").notNull().default(15),
  /** Completed focus intervals in this sitting. */
  cyclesCompleted: integer("cycles_completed").notNull().default(0),
  /** Focus-score inputs: deliberate pauses vs. tab-away distractions. */
  pauseCount: integer("pause_count").notNull().default(0),
  pausedSec: integer("paused_sec").notNull().default(0),
  distractionCount: integer("distraction_count").notNull().default(0),
  /** Optional post-session reflection. */
  reflection: text("reflection"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** Gamification: per-user profile with XP, level, streak. */
export const gameProfiles = sqliteTable("game_profiles", {
  userId: text("user_id").primaryKey(),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  streak: integer("streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActiveDate: text("last_active_date"), // YYYY-MM-DD
  theme: text("theme").notNull().default("dark"),
  avatar: text("avatar").notNull().default("🎓"),
  /** Set once the user finishes (or skips) the welcome tutorial. */
  onboardedAt: integer("onboarded_at", { mode: "timestamp" }),
  /** Opt-out for the daily "your streak is about to reset" email. */
  streakReminders: integer("streak_reminders", { mode: "boolean" }).notNull().default(true),
  /** Last time a streak reminder went out — prevents double-sending. */
  lastReminderAt: integer("last_reminder_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** XP event log (for insights / learning velocity). */
export const xpEvents = sqliteTable("xp_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** Unlocked achievements. */
export const achievements = sqliteTable("achievements", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  key: text("key").notNull(), // matches a definition key
  unlockedAt: integer("unlocked_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/**
 * AI Coach insights — the single engine behind the dashboard cards and the Smart
 * Insights page. An insight is not just prose: it carries the subject/topic it is
 * about and a one-click action the student can take straight from the card, and it
 * keeps a status so past advice can be marked done or dismissed and reviewed later.
 *
 * The action is stored as flat columns rather than a JSON blob: the shape is small
 * and fixed, and every other table here is flat, so this stays queryable and typed.
 */
export const coachMessages = sqliteTable("coach_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull().default("suggestion"), // suggestion | warning | celebration | plan
  title: text("title").notNull(),
  body: text("body").notNull(),
  reason: text("reason"),
  /** What the insight is about, when the coach could tie it to something concrete. */
  subjectId: text("subject_id"),
  topicId: text("topic_id"),
  /** One-click follow-through: quiz | focus | revision | none. */
  actionKind: text("action_kind").notNull().default("none"),
  /** Button copy for the action, e.g. "Quiz me on Integration by parts". */
  actionLabel: text("action_label"),
  /** Free-text target the action needs (a topic or subject name). */
  actionTarget: text("action_target"),
  /** new | done | dismissed — drives insight history and "did the advice work". */
  status: text("status").notNull().default("new"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
  /** Set when the student marks the advice done or dismisses it. */
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
});

/**
 * Follow-up Q&A scoped to a single insight. Free-form AI chat was removed on
 * purpose — questions only exist in the context of an insight, so the model always
 * answers against the student's real numbers instead of drifting into a chatbot.
 */
export const coachReplies = sqliteTable("coach_replies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  messageId: text("message_id").notNull(),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** Collaboration: study groups. */
export const studyGroups = sqliteTable("study_groups", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#4F46E5"),
  inviteCode: text("invite_code").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const groupMembers = sqliteTable("group_members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text("group_id").notNull(),
  userId: text("user_id").notNull(),
  // Denormalized so the member list can show who people are without joining the
  // auth tables on every read (same precedent as group_messages.user_name).
  userName: text("user_name"),
  userEmail: text("user_email"),
  role: text("role").notNull().default("member"), // owner | member
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const groupMessages = sqliteTable("group_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text("group_id").notNull(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  body: text("body").notNull(),
  // Moderation: set when hidden by an admin or an auto-flag. Hidden rows are
  // filtered out of every read path rather than deleted, so appeals are possible.
  hiddenAt: integer("hidden_at", { mode: "timestamp" }),
  hiddenReason: text("hidden_reason"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const noteComments = sqliteTable("note_comments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  noteId: text("note_id").notNull(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  body: text("body").notNull(),
  hiddenAt: integer("hidden_at", { mode: "timestamp" }),
  hiddenReason: text("hidden_reason"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** Public product reviews / feedback. */
export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  rating: integer("rating").notNull(), // 1-5
  title: text("title").notNull(),
  body: text("body").notNull(),
  role: text("role"), // e.g. "CS sophomore", "Med student"
  category: text("category").notNull().default("general"), // general | graph | tutor | focus | gamification | bug | idea
  helpful: integer("helpful").notNull().default(0),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  hiddenAt: integer("hidden_at", { mode: "timestamp" }),
  hiddenReason: text("hidden_reason"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const reviewVotes = sqliteTable("review_votes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  reviewId: text("review_id").notNull(),
  userId: text("user_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

// ---------------------------------------------------------------------------
// Operations tables. These carry no study data — they exist so the deployed app
// can be rate limited, budgeted, monitored, moderated and backed up correctly
// across restarts and across more than one server instance.
// ---------------------------------------------------------------------------

/**
 * Shared fixed-window rate limiter state.
 *
 * Lives in the database rather than process memory so limits survive deploys
 * and stay correct when the app runs more than one instance.
 */
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: integer("reset_at", { mode: "timestamp" }).notNull(),
});

/**
 * Global AI usage ledger, one row per UTC day.
 *
 * Per-user hourly limits stop one abusive account; this stops the whole user
 * base (or a leaked key) from running up an unbounded gateway bill.
 */
export const aiSpend = sqliteTable("ai_spend", {
  day: text("day").primaryKey(), // YYYY-MM-DD (UTC)
  month: text("month").notNull(), // YYYY-MM (UTC), for the monthly ceiling
  requests: integer("requests").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** Captured server and client errors — the app's own monitoring backend. */
export const errorLogs = sqliteTable("error_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  level: text("level").notNull().default("error"), // error | warn
  source: text("source").notNull(), // api | rpc | web | job
  message: text("message").notNull(),
  stack: text("stack"),
  path: text("path"),
  userId: text("user_id"),
  userAgent: text("user_agent"),
  fingerprint: text("fingerprint").notNull(), // groups repeats of the same fault
  count: integer("count").notNull().default(1),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull().$defaultFn(now),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/**
 * Scheduler bookkeeping. Doubles as the lock: a job is claimed with a
 * conditional update, so two instances can never run the same job at once.
 */
export const jobRuns = sqliteTable("job_runs", {
  name: text("name").primaryKey(),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  lastFinishedAt: integer("last_finished_at", { mode: "timestamp" }),
  lastStatus: text("last_status"), // ok | error | running
  lastDetail: text("last_detail"),
  runningSince: integer("running_since", { mode: "timestamp" }),
});

/** User reports against user-generated content, and the moderation decision. */
export const contentReports = sqliteTable("content_reports", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  targetType: text("target_type").notNull(), // group_message | note_comment | review
  targetId: text("target_id").notNull(),
  targetOwnerId: text("target_owner_id"),
  targetExcerpt: text("target_excerpt").notNull().default(""),
  reporterId: text("reporter_id").notNull(),
  reason: text("reason").notNull(), // spam | abuse | sexual | violence | other
  note: text("note"),
  status: text("status").notNull().default("open"), // open | actioned | dismissed
  autoFlagged: integer("auto_flagged", { mode: "boolean" }).notNull().default(false),
  resolvedBy: text("resolved_by"),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** Upload ledger — the source of truth for per-user storage quotas. */
export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  fileKey: text("file_key").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull().default(""),
  bytes: integer("bytes").notNull().default(0),
  status: text("status").notNull().default("reserved"), // reserved | stored
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});
