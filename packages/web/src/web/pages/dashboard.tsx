import { Link } from "wouter";
import { motion } from "motion/react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Flame,
  Zap,
  BookOpen,
  ListChecks,
  Timer,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Sparkles,
  Loader2,
  Network,
  NotebookPen,
  PlayCircle,
  Database,
} from "lucide-react";
import { useDashboard } from "../queries/insights";
import { useSeed } from "../queries/me";
import { useCoachMessages, useGenerateInsight } from "../queries/coach";
import { InsightCard } from "../components/insight-card";
import { AiErrorNotice } from "../components/ai-error";
import { Card, CardContent } from "../components/ui/card";
import { ProgressRing } from "../components/ui/progress-ring";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { authClient } from "../lib/auth";
import { relativeDue } from "../lib/format";

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();
  const coach = useCoachMessages();
  const genInsight = useGenerateInsight();
  const { data: session } = authClient.useSession();

  const firstName = (session?.user?.name ?? "there").split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (isLoading || !data) return <DashboardSkeleton />;

  // A brand-new account has nothing to chart. Show a guided first-run screen
  // instead of a wall of zeroes and empty graphs.
  if (data.counts.subjects === 0 && data.counts.topics === 0 && data.counts.sessions === 0) {
    return <FirstRun firstName={firstName} greeting={greeting} />;
  }

  const stats = [
    { label: "Subjects", value: data.counts.subjects, icon: BookOpen, to: "/subjects", color: "text-primary" },
    { label: "Concepts", value: data.counts.topics, icon: Sparkles, to: "/graph", color: "text-accent" },
    { label: "Quizzes taken", value: data.counts.quizzesTaken, icon: ListChecks, to: "/quizzes", color: "text-secondary" },
    { label: "Focus minutes", value: data.counts.studyMinutes, icon: Timer, to: "/focus", color: "text-success" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {greeting}, {firstName} 👋
          </h1>
          <p className="mt-1 text-muted-foreground">Here's where your learning stands today.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2">
            <Flame className="size-5 text-warning" />
            <div>
              <p className="text-lg font-bold leading-none tabular-nums">{data.profile.streak}</p>
              <p className="text-[10px] text-muted-foreground">day streak</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2">
            <Zap className="size-5 text-accent" />
            <div>
              <p className="text-lg font-bold leading-none tabular-nums">{data.profile.xp}</p>
              <p className="text-[10px] text-muted-foreground">total XP</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Link to={s.to}>
              <Card className="group transition-all hover:-translate-y-0.5 hover:border-ring/40">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`grid size-11 place-items-center rounded-xl bg-surface ${s.color}`}>
                    <s.icon className="size-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                  <ArrowUpRight className="ml-auto size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left col */}
        <div className="space-y-6 lg:col-span-2">
          {/* XP chart */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Weekly momentum</h3>
                  <p className="text-xs text-muted-foreground">XP earned over the last 7 days</p>
                </div>
                <Badge variant="accent">
                  <TrendingUp className="size-3" /> {data.xpSeries.reduce((a, b) => a + b.xp, 0)} XP
                </Badge>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.xpSeries} margin={{ left: 0, right: 8, top: 4 }}>
                    <defs>
                      <linearGradient id="xpg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={40} />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                      cursor={{ stroke: "var(--border)" }}
                    />
                    <Area type="monotone" dataKey="xp" stroke="#2563EB" strokeWidth={2.5} fill="url(#xpg)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Subject mastery */}
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-4 font-semibold">Subject mastery</h3>
              {data.subjectMastery.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No subjects yet.</p>
              ) : (
                <div className="space-y-4">
                  {data.subjectMastery.map((s) => (
                    <div key={s.id} className="flex items-center gap-3">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="w-28 shrink-0 truncate text-sm font-medium">{s.name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: s.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${s.mastery}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">{s.mastery}%</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right col */}
        <div className="space-y-6">
          {/* Readiness */}
          <Card className="overflow-hidden">
            <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
              <h3 className="self-start font-semibold">Exam readiness</h3>
              <ProgressRing value={data.readiness} size={128} stroke={10} />
              <p className="text-sm text-muted-foreground">
                {data.readiness >= 70 ? "You're in great shape." : data.readiness >= 40 ? "Solid progress — keep pushing." : "Time to hit the weak spots."}
              </p>
              {data.strongest && data.weakest && (
                <div className="mt-1 grid w-full grid-cols-2 gap-2 text-left">
                  <div className="rounded-xl bg-success/10 p-3">
                    <div className="flex items-center gap-1 text-xs text-success"><TrendingUp className="size-3" /> Strongest</div>
                    <p className="mt-1 truncate text-sm font-semibold">{data.strongest.name}</p>
                  </div>
                  <div className="rounded-xl bg-destructive/10 p-3">
                    <div className="flex items-center gap-1 text-xs text-destructive"><TrendingDown className="size-3" /> Weakest</div>
                    <p className="mt-1 truncate text-sm font-semibold">{data.weakest.name}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Coach */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-accent" />
                  <h3 className="font-semibold">AI Coach</h3>
                </div>
                <Button size="sm" variant="ghost" onClick={() => genInsight.mutate({})} disabled={genInsight.isPending}>
                  {genInsight.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Refresh"}
                </Button>
              </div>
              {genInsight.isError && (
                <AiErrorNotice
                  className="mb-3"
                  error={genInsight.error}
                  onRetry={() => genInsight.mutate({})}
                  retrying={genInsight.isPending}
                />
              )}
              {/* Same insight engine as Smart Insights — actions and follow-ups included. */}
              <div className="space-y-2.5">
                {coach.isLoading && <Skeleton className="h-24" />}
                {(coach.data ?? []).slice(0, 3).map((m) => (
                  <InsightCard key={m.id} insight={m} range={30} subjectId={null} compact />
                ))}
                {!coach.isLoading && (coach.data ?? []).length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">Generate your first insight.</p>
                )}
                <Link to="/insights" className="block pt-1 text-center text-xs text-primary hover:underline">
                  Open Smart Insights
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">Upcoming</h3>
                <Link to="/assignments" className="text-xs text-primary hover:underline">View all</Link>
              </div>
              <div className="space-y-2">
                {data.upcoming.length === 0 && <p className="py-3 text-center text-sm text-muted-foreground">Nothing due. Nice.</p>}
                {data.upcoming.map((a) => {
                  const due = relativeDue(a.dueDate);
                  return (
                    <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.title}</p>
                        <Badge variant={due.tone === "muted" ? "muted" : due.tone} className="mt-1">{due.label}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const FIRST_STEPS = [
  {
    icon: Network,
    title: "Create your first subject",
    body: "Add a subject and break it into concepts. This becomes your knowledge graph.",
    to: "/subjects",
    cta: "Add a subject",
    tint: "text-primary",
  },
  {
    icon: NotebookPen,
    title: "Capture something you learned",
    body: "Write a note, then turn it into flashcards or a quiz in one click.",
    to: "/notes",
    cta: "Write a note",
    tint: "text-secondary",
  },
  {
    icon: PlayCircle,
    title: "Log your first study session",
    body: "Run a focus session to start your streak — it only counts once you actually study.",
    to: "/focus",
    cta: "Start focusing",
    tint: "text-success",
  },
];

function FirstRun({ firstName, greeting }: { firstName: string; greeting: string }) {
  const seed = useSeed();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold tracking-tight">
          {greeting}, {firstName} 👋
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your workspace is empty — nothing here is pre-filled. Do any of these three things and your
          dashboard starts filling in with your own data.
        </p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-3">
        {FIRST_STEPS.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card className="flex h-full flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 p-5">
                <div className={`grid size-11 place-items-center rounded-xl bg-surface ${s.tint}`}>
                  <s.icon className="size-5" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{s.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
                </div>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link to={s.to}>
                    {s.cta} <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <div className="grid size-11 place-items-center rounded-xl bg-surface text-warning">
            <Flame className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Your streak starts at 0 — and stays there until you study</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Focus sessions, quizzes, flashcard reviews and notes each count as a study day. Adding
              subjects or assignments earns XP but never touches the streak.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <div className="grid size-11 place-items-center rounded-xl bg-surface text-muted-foreground">
            <Database className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Just want to look around?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Load a sample dataset — three subjects, notes, cards and a quiz — to explore every
              feature. You can clear it any time from Settings.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => seed.mutate(undefined as never)}
            disabled={seed.isPending}
          >
            {seed.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Load sample data
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2"><Skeleton className="h-72" /><Skeleton className="h-56" /></div>
        <div className="space-y-6"><Skeleton className="h-64" /><Skeleton className="h-48" /></div>
      </div>
    </div>
  );
}
