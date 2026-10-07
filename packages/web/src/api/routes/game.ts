import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { authed } from "../middleware/auth";
import { db } from "../database";
import * as s from "../database/schema";
import { ACHIEVEMENTS, ensureProfile, xpForLevel } from "../lib/game";

export const game = {
  profile: authed.handler(async ({ context }) => {
    const profile = await ensureProfile(context.user.id);
    const level = profile.level;
    return {
      ...profile,
      xpIntoLevel: profile.xp - xpForLevel(level),
      xpForNext: xpForLevel(level + 1) - xpForLevel(level),
    };
  }),

  achievements: authed.handler(async ({ context }) => {
    const unlocked = await db.select().from(s.achievements).where(eq(s.achievements.userId, context.user.id));
    const unlockedMap = new Map(unlocked.map((u) => [u.key, u.unlockedAt]));
    return ACHIEVEMENTS.map((def) => ({
      ...def,
      unlocked: unlockedMap.has(def.key),
      unlockedAt: unlockedMap.get(def.key) ?? null,
    }));
  }),

  xpEvents: authed.handler(async ({ context }) => {
    return db.select().from(s.xpEvents).where(eq(s.xpEvents.userId, context.user.id)).orderBy(desc(s.xpEvents.createdAt)).limit(50);
  }),

  setCosmetic: authed
    .input(z.object({ theme: z.string().optional(), avatar: z.string().optional() }))
    .handler(async ({ input, context }) => {
      await ensureProfile(context.user.id);
      const [row] = await db
        .update(s.gameProfiles)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(s.gameProfiles.userId, context.user.id))
        .returning();
      return row;
    }),
};
