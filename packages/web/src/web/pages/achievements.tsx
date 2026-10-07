import { motion } from "motion/react";
import { Trophy, Flame, Zap, Lock } from "lucide-react";
import { useAchievements, useProfile, useXpEvents } from "../queries/game";
import { PageHeader } from "../components/ui/page-header";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { fmtDate } from "../lib/format";

export default function AchievementsPage() {
  const { data: achievements, isLoading } = useAchievements();
  const { data: profile } = useProfile();
  const { data: events } = useXpEvents();

  const unlocked = (achievements ?? []).filter((a) => a.unlocked).length;
  const total = achievements?.length ?? 0;
  const pct = total ? Math.round((unlocked / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Achievements" subtitle="Proof of the work you've put in." icon={Trophy} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Zap className="size-3.5 text-secondary" /> Level & XP
            </div>
            <p className="mt-1 text-2xl font-bold">Level {profile?.level ?? 1}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full gradient-brand"
                initial={{ width: 0 }}
                animate={{ width: `${profile?.xpForNext ? Math.min(100, ((profile.xpIntoLevel ?? 0) / profile.xpForNext) * 100) : 0}%` }}
                transition={{ duration: 0.8 }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {profile?.xpIntoLevel ?? 0} / {profile?.xpForNext ?? 500} XP to next level
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Flame className="size-3.5 text-warning" /> Streak
            </div>
            <p className="mt-1 text-2xl font-bold">{profile?.streak ?? 0} days</p>
            <p className="mt-1.5 text-xs text-muted-foreground">Longest: {profile?.longestStreak ?? 0} days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Trophy className="size-3.5 text-primary" /> Collected
            </div>
            <p className="mt-1 text-2xl font-bold">
              {unlocked} / {total}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">{pct}% of all badges</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(achievements ?? []).map((a, i) => (
            <motion.div key={a.key} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
              <Card className={a.unlocked ? "border-primary/40" : "opacity-70"}>
                <CardContent className="flex items-center gap-3.5 p-4">
                  <div className={`grid size-12 shrink-0 place-items-center rounded-2xl text-2xl ${a.unlocked ? "bg-primary/12" : "bg-muted"}`}>
                    {a.unlocked ? a.emoji : <Lock className="size-5 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{a.title}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{a.description}</p>
                    {a.unlocked && a.unlockedAt && (
                      <Badge variant="success" className="mt-1.5">
                        Unlocked {fmtDate(a.unlockedAt)}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {events && events.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">XP history</h2>
          <Card>
            <CardContent className="max-h-80 divide-y divide-border overflow-y-auto p-0">
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span>{e.reason}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{fmtDate(e.createdAt)}</span>
                    <Badge variant="secondary">+{e.amount} XP</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
