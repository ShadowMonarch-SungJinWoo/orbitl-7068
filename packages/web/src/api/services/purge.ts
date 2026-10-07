import { eq, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";

/**
 * Delete every application row that belongs to a user.
 *
 * Used by the "delete my account" flow (Better Auth `user.deleteUser.beforeDelete`)
 * so nothing is orphaned once the auth row disappears. Groups the user owns are
 * removed entirely — a group with a dead owner is a dead group — while groups
 * they merely joined only lose their membership and messages.
 */
export async function purgeUserData(userId: string) {
  // Owned groups: drop the group plus every member and message inside it.
  const owned = await db
    .select({ id: s.studyGroups.id })
    .from(s.studyGroups)
    .where(eq(s.studyGroups.ownerId, userId));
  const ownedIds = owned.map((g) => g.id);
  if (ownedIds.length) {
    await db.delete(s.groupMessages).where(inArray(s.groupMessages.groupId, ownedIds));
    await db.delete(s.groupMembers).where(inArray(s.groupMembers.groupId, ownedIds));
    await db.delete(s.studyGroups).where(inArray(s.studyGroups.id, ownedIds));
  }

  // Everything else is a flat `user_id` scan. Order matters only for readability;
  // there are no FK constraints, but children go before parents anyway.
  const tables = [
    s.quizAttempts,
    s.quizzes,
    s.flashcards,
    s.noteComments,
    s.notes,
    s.assignments,
    s.studySessions,
    s.xpEvents,
    s.coachMessages,
    s.topicLinks,
    s.topics,
    s.subjects,
    s.achievements,
    s.reviewVotes,
    s.reviews,
    s.groupMessages,
    s.groupMembers,
    s.gameProfiles,
  ];
  for (const table of tables) {
    await db
      .delete(table as never)
      .where(eq((table as never as typeof s.subjects).userId, userId));
  }
}
