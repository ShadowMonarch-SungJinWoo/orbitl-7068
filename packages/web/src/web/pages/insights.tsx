import { useState } from "react";
import { motion } from "motion/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Clock,
  Gauge,
  Loader2,
  Minus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useAnalytics, useDrilldown, type Range } from "../queries/insights";
import { useCoachMessages, useGenerateInsight, type CoachView } from "../queries/coach";
import { InsightCard } from "../components/insight-card";
import { PageHeader } from "../components/ui/page-header";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Modal } from "../components/ui/modal";
import { Skeleton } from "../components/ui/skeleton";
import { ProgressRing } from "../components/ui/progress-ring";
import { fmtMinutes } from "../lib/format";

const tooltipStyle = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    fontSize: 12,
    color: "var(--foreground)",
  },
  labelStyle: { color: "var(--muted-foreground)" },
} as const;

const RANGES: { value: Range; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

function hourLabel(h: number) {
  const suffix = h >= 12 ? "PM" : "AM";
  const base = h % 12 === 0 ? 12 : h % 12;
  return `${base} ${suffix}`;
}

/**
 * Period-over-period movement. A number on its own says nothing about whether a
 * student is getting better, so every headline metric carries its delta against
 * the immediately preceding window of the same length.
 */
function Delta({
  current,
  previous,
  unit = "",
  invert = false,
  format,
}: {
  current: number;
  previous: number;
  unit?: string;
  invert?: boolean;
  /** Renders the magnitude in the same units as the headline value (e.g. 9h 23m, not 563 min). */
  format?: (n: number) => string;
}) {
  if (previous === 0 && current === 0) {
    return <span className="text-[11px] text-muted-foreground">no data last period</span>;
  }
  const diff = current - previous;
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Minus className="size-3" /> flat
      </span>
    );
  }
  const good = invert ? diff < 0 : diff > 0;
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${good ? "text-success" : "text-destructive"}`}>
      <Icon className="size-3" />
      {diff > 0 ? "+" : "-"}
      {format ? format(Math.abs(diff)) : Math.abs(diff)}
      {unit} vs previous
    </span>
  );
}

export default function InsightsPage() {
  const [range, setRange] = useState<Range>(30);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [view, setView] = useState<CoachView>("active");
  const [selected, setSelected] = useState<{ key: string; bucketDays: number; subjectId: string | null; label: string } | null>(null);

  const { data: a, isLoading, isFetching } = useAnalytics({ range, subjectId });
  const coach = useCoachMessages(view);
  const generate = useGenerateInsight();
  const drill = useDrilldown(selected);

  if (isLoading || !a) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const c = a.current;
  const p = a.previous;
  const subjectLabel = subjectId ? (a.subjectMastery.find((s) => s.id === subjectId)?.name ?? "Subject") : "All subjects";

  const stats = [
    {
      label: "Avg focus score",
      value: `${c.avgFocus}%`,
      icon: Gauge,
      tone: "text-primary",
      delta: <Delta current={c.avgFocus} previous={p.avgFocus} unit="%" />,
    },
    {
      label: "Study time",
      value: fmtMinutes(c.minutes),
      icon: Clock,
      tone: "text-accent",
      delta: <Delta current={c.minutes} previous={p.minutes} format={fmtMinutes} />,
    },
    {
      label: "Learning velocity",
      value: `${c.velocity} XP/day`,
      icon: Zap,
      tone: "text-secondary",
      delta: <Delta current={c.velocity} previous={p.velocity} unit=" XP" />,
    },
    {
      label: "Avg quiz score",
      value: c.avgScore === null ? "—" : `${c.avgScore}%`,
      icon: BarChart3,
      tone: "text-warning",
      delta: <Delta current={c.avgScore ?? 0} previous={p.avgScore ?? 0} unit="%" />,
    },
  ];

  /**
   * Clicking a bar or point opens the rows behind it, for the exact bucket shown.
   * Recharts only hands back the active tick index, so the caller passes the same
   * array it charted and we resolve the bucket from it.
   */
  const onPointClick = (payload: unknown) => {
    const row = payload as { key?: string; label?: string } | undefined;
    if (!row?.key) return;
    setSelected({ key: row.key, bucketDays: a.bucketDays, subjectId, label: row.label ?? row.key });
  };

  /**
   * Line and Area expose only a CurveMouseEventHandler at the series level, which
   * describes the whole path and carries no point identity. The chart-level click
   * is the one that reports which point is active, so we resolve the bucket by
   * index against the very array we charted.
   */
  const onChartClick = (rows: readonly unknown[]) => (state: unknown) => {
    const idx = Number((state as { activeTooltipIndex?: number | string } | undefined)?.activeTooltipIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= rows.length) return;
    onPointClick(rows[idx]);
  };

  const scoreSeries = a.series.filter((b) => b.score !== null);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Smart Insights"
        subtitle="Your real study data, compared against the period before it — and a coach that reads the same numbers."
        icon={BarChart3}
      />

      {/* Filters — every number, chart and insight below is scoped by these. */}
      <Card className="mb-5">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex items-center gap-1 rounded-xl bg-surface p-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === r.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <select
            value={subjectId ?? ""}
            onChange={(e) => setSubjectId(e.target.value || null)}
            className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
          >
            <option value="">All subjects</option>
            {a.subjectMastery.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}

          <Button
            className="ml-auto"
            size="sm"
            onClick={() => generate.mutate({ range, subjectId, count: 3 })}
            disabled={generate.isPending}
          >
            {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {generate.isPending ? "Reading your data…" : "Generate insights"}
          </Button>
        </CardContent>
      </Card>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card>
              <CardContent className="flex items-center gap-3 p-5">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface">
                  <s.icon className={`size-5 ${s.tone}`} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-bold">{s.value}</p>
                  {s.delta}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Focus minutes</p>
                <p className="text-xs text-muted-foreground">
                  Last {a.range} days · {subjectLabel} · click a bar to see what you did
                </p>
              </div>
              <Badge variant="muted">{fmtMinutes(c.minutes)} total</Badge>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={a.series}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={28} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                  <Bar dataKey="minutes" radius={[8, 8, 0, 0]} className="cursor-pointer" onClick={(d: { payload?: unknown }) => onPointClick(d?.payload)}>
                    {a.series.map((b) => (
                      <Cell key={b.key} fill="var(--primary)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-5 text-center">
            <p className="self-start text-sm font-semibold">Exam readiness</p>
            <ProgressRing value={a.readiness} size={132} stroke={10} />
            <p className="text-xs text-muted-foreground">
              Average mastery across {subjectId ? "this subject's" : "all"} concepts on your knowledge graph.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <Badge variant="muted">{c.activeDays} active days</Badge>
              <Badge variant="muted">{c.sessions} sessions</Badge>
            </div>
            <Delta current={c.activeDays} previous={p.activeDays} unit=" days" />
          </CardContent>
        </Card>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-semibold">Quiz score trend</p>
            <p className="mb-4 text-xs text-muted-foreground">Average score per {a.bucketDays === 1 ? "day" : "week"} you took quizzes</p>
            <div className="h-52">
              {c.quizzes === 0 ? (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">No quizzes in this window.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={scoreSeries} onClick={onChartClick(scoreSeries)} className="cursor-pointer">
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={28} />
                    <Tooltip {...tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="var(--accent)"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "var(--accent)" }}
                      activeDot={{ r: 6, className: "cursor-pointer" }}
                      className="cursor-pointer"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-semibold">Mastery by subject</p>
            <p className="mb-4 text-xs text-muted-foreground">Where you're strong and where to push</p>
            <div className="h-52">
              {a.subjectMastery.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">Add subjects and concepts first.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={a.subjectMastery.map((s) => ({ subject: s.name, mastery: s.mastery }))}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                    <Radar dataKey="mastery" stroke="var(--secondary)" fill="var(--secondary)" fillOpacity={0.28} />
                    <Tooltip {...tooltipStyle} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <p className="text-sm font-semibold">XP momentum</p>
            <p className="mb-4 text-xs text-muted-foreground">
              {c.xp} XP this period vs {p.xp} before it · click a point for the detail
            </p>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={a.series} onClick={onChartClick(a.series)} className="cursor-pointer">
                  <defs>
                    <linearGradient id="xpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--secondary)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--secondary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={28} />
                  <Tooltip {...tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="xp"
                    stroke="var(--secondary)"
                    strokeWidth={2.5}
                    fill="url(#xpGrad)"
                    activeDot={{ r: 6, className: "cursor-pointer" }}
                    dot={{ r: 2, fill: "var(--secondary)" }}
                    className="cursor-pointer"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-semibold">This period at a glance</p>
            <Fact label="Peak study hour" value={c.bestHour === null ? "Not enough data" : hourLabel(c.bestHour)} />
            <Fact label="Avg session length" value={fmtMinutes(c.avgDuration)} />
            <Fact label="Quizzes taken" value={`${c.quizzes} (was ${p.quizzes})`} />
            <Fact
              label="Weakest concept"
              value={a.weakTopics[0] ? `${a.weakTopics[0].name} · ${a.weakTopics[0].mastery}%` : "No concepts yet"}
            />
            <Fact
              label="Most studied"
              value={a.studiedTopics[0] ? `${a.studiedTopics[0].name} · ${fmtMinutes(a.studiedTopics[0].minutes)}` : "Nothing logged"}
            />
          </CardContent>
        </Card>
      </div>

      {/* The AI coach — same engine, same numbers as everything above. */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">What the data says</h2>
        <div className="flex items-center gap-1 rounded-xl bg-surface p-1">
          {(["active", "history"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {generate.isError && (
        <p className="mb-3 text-sm text-destructive">
          {generate.error instanceof Error ? generate.error.message : "Couldn't generate insights. Try again."}
        </p>
      )}

      <div className="space-y-3">
        {coach.isLoading && <Skeleton className="h-40" />}

        {!coach.isLoading && !coach.data?.length && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <div className="grid size-12 place-items-center rounded-2xl bg-surface">
                <Sparkles className="size-5 text-accent" />
              </div>
              <p className="text-sm font-semibold">
                {view === "active" ? "No open insights" : "Nothing in your history yet"}
              </p>
              <p className="max-w-md text-xs text-muted-foreground">
                {view === "active"
                  ? "Generate a set and the coach will read the window you've selected — the same numbers in the charts above — and tell you what to do next."
                  : "Insights you mark done or dismiss are kept here so you can judge whether the advice actually worked."}
              </p>
              {view === "active" && (
                <Button size="sm" onClick={() => generate.mutate({ range, subjectId, count: 3 })} disabled={generate.isPending}>
                  {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  Generate insights
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {coach.data?.map((m) => (
          <InsightCard key={m.id} insight={m} range={range} subjectId={subjectId} />
        ))}
      </div>

      {/* Drill-down: the sessions and attempts behind one point on a chart. */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.label} in detail` : ""}
        description={
          drill.data
            ? `${drill.data.totals.sessions} session${drill.data.totals.sessions === 1 ? "" : "s"} · ${fmtMinutes(drill.data.totals.minutes)} · ${drill.data.totals.quizzes} quiz${drill.data.totals.quizzes === 1 ? "" : "zes"}${drill.data.totals.avgScore !== null ? ` · avg ${drill.data.totals.avgScore}%` : ""}`
            : "Loading…"
        }
        className="max-w-xl"
      >
        {drill.isLoading && <Loader2 className="size-5 animate-spin text-muted-foreground" />}

        {drill.data && (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Focus sessions</p>
              {drill.data.sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions logged.</p>
              ) : (
                <div className="space-y-2">
                  {drill.data.sessions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s.concept ?? "Untitled session"}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.subject ?? "No subject"} · {s.mode}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold">{fmtMinutes(s.minutes)}</p>
                        <p className="text-xs text-muted-foreground">{s.focusScore}% focus</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quiz attempts</p>
              {drill.data.attempts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No quizzes taken.</p>
              ) : (
                <div className="space-y-2">
                  {drill.data.attempts.map((q) => (
                    <div key={q.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{q.topic ?? "Quiz"}</p>
                        <p className="text-xs text-muted-foreground">{q.subject ?? "No subject"}</p>
                      </div>
                      <Badge variant={q.score >= 70 ? "success" : q.score >= 40 ? "warning" : "destructive"}>
                        {q.correct}/{q.total} · {q.score}%
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-xs font-semibold">{value}</span>
    </div>
  );
}
