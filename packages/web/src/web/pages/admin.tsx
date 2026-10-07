import { useState } from "react";
import { motion } from "motion/react";
import {
  ShieldCheck,
  Activity,
  AlertTriangle,
  Database,
  Clock,
  Gauge,
  Trash2,
  Play,
  Download,
  EyeOff,
  Check,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { PageHeader, EmptyState } from "../components/ui/page-header";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { useToast } from "../components/toast";
import {
  useAdminBackups,
  useAdminErrors,
  useAdminOverview,
  useAdminSpendHistory,
  useBackupLink,
  useBackupNow,
  useClearErrors,
  useRunJob,
} from "../queries/admin";
import { useModerationQueue, useResolveReport } from "../queries/moderation";

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function when(value: string | Date | null | undefined) {
  if (!value) return "never";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "never";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Usage vs a configured ceiling. A blank/zero cap means "unlimited". */
function CapBar({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const tone = pct >= 90 ? "bg-error" : pct >= 70 ? "bg-warning" : "gradient-brand";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {used.toLocaleString()}
          {cap > 0 ? ` / ${cap.toLocaleString()}` : " / ∞"}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          className={`h-full rounded-full ${tone}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {action}
    </div>
  );
}

export default function AdminPage() {
  const { toast } = useToast();
  const overview = useAdminOverview();
  const errors = useAdminErrors(30);
  const spend = useAdminSpendHistory(14);
  const backups = useAdminBackups();
  const [queueStatus, setQueueStatus] = useState<"open" | "all">("open");
  const queue = useModerationQueue(queueStatus);

  const clearErrors = useClearErrors();
  const backupNow = useBackupNow();
  const backupLink = useBackupLink();
  const runJob = useRunJob();
  const resolve = useResolveReport();

  // The server answers NOT_FOUND to non-admins, so a failed overview is simply
  // "you don't have access" — no separate permission call needed.
  if (overview.isError) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Admin" icon={ShieldCheck} />
        <EmptyState
          icon={ShieldCheck}
          title="Not available"
          description="This area is restricted to OrbitL operators."
        />
      </div>
    );
  }

  const data = overview.data;
  const caps = data?.spend.caps;

  return (
    <div className="mx-auto max-w-6xl pb-10">
      <PageHeader
        title="Operations"
        subtitle="Health, spend, jobs, backups and moderation."
        icon={ShieldCheck}
        action={
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              overview.refetch();
              errors.refetch();
              backups.refetch();
              queue.refetch();
            }}
          >
            <RefreshCw className="size-4" /> Refresh
          </Button>
        }
      />

      {/* Health + counters */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="size-3.5 text-success" /> Health
            </div>
            {overview.isLoading ? (
              <Skeleton className="mt-2 h-7 w-24" />
            ) : (
              <>
                <p className="mt-1 text-2xl font-bold capitalize">{data?.health.status ?? "—"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  DB {data?.health.database} · {data?.health.latencyMs}ms
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="size-3.5 text-accent" /> Uptime
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {data ? `${Math.floor(data.health.uptimeSec / 3600)}h ${Math.floor((data.health.uptimeSec % 3600) / 60)}m` : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">since last deploy</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="size-3.5 text-warning" /> Faults (24h)
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">{data?.errors.last24hTotal ?? 0}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {data?.errors.last24hGroups ?? 0} distinct · {data?.errors.groups ?? 0} total groups
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <EyeOff className="size-3.5 text-secondary" /> Reports open
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">{queue.data?.counts.open ?? 0}</p>
            <p className="mt-1 text-xs text-muted-foreground">{queue.data?.counts.total ?? 0} all time</p>
          </CardContent>
        </Card>
      </div>

      {/* AI spend vs global ceilings */}
      <div className="mt-8">
        <SectionTitle icon={Gauge} title="AI spend" hint={data ? `${data.spend.day} · ${data.spend.month}` : undefined} />
        <Card>
          <CardContent className="grid gap-5 p-5 sm:grid-cols-2">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today</p>
              <CapBar label="Requests" used={data?.spend.today.requests ?? 0} cap={caps?.dailyRequests ?? 0} />
              <CapBar
                label="Tokens"
                used={(data?.spend.today.inputTokens ?? 0) + (data?.spend.today.outputTokens ?? 0)}
                cap={caps?.dailyTokens ?? 0}
              />
            </div>
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">This month</p>
              <CapBar label="Requests" used={data?.spend.thisMonth.requests ?? 0} cap={caps?.monthlyRequests ?? 0} />
              <CapBar
                label="Tokens"
                used={(data?.spend.thisMonth.inputTokens ?? 0) + (data?.spend.thisMonth.outputTokens ?? 0)}
                cap={caps?.monthlyTokens ?? 0}
              />
            </div>
          </CardContent>
        </Card>

        {!!spend.data?.length && (
          <Card className="mt-3">
            <CardContent className="p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last 14 days</p>
              <div className="space-y-2">
                {spend.data.map((row) => (
                  <div key={row.day} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{row.day}</span>
                    <span className="tabular-nums">
                      {row.requests.toLocaleString()} req ·{" "}
                      {(row.inputTokens + row.outputTokens).toLocaleString()} tok
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Scheduled jobs */}
      <div className="mt-8">
        <SectionTitle icon={Clock} title="Scheduled jobs" hint="in-process, DB-locked" />
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {(data?.jobs ?? []).map((job) => (
              <div key={job.name} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{job.name}</span>
                    {job.running && <Badge variant="warning">running</Badge>}
                    {job.lastStatus === "ok" && !job.running && <Badge variant="success">ok</Badge>}
                    {job.lastStatus === "error" && <Badge variant="destructive">error</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    every {job.everyMinutes}m · last run {when(job.lastRunAt)}
                    {job.lastDetail ? ` · ${job.lastDetail}` : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={runJob.isPending}
                  onClick={() =>
                    runJob.mutate(
                      { name: job.name as "streak-reminders" | "db-backup" | "cleanup" },
                      {
                        onSuccess: (res) =>
                          toast({
                            kind: res.ok ? "success" : "error",
                            title: res.ok ? `${job.name} finished` : `${job.name} failed`,
                            description: res.ok ? undefined : res.error,
                          }),
                        onError: (e) => toast({ kind: "error", title: "Could not run job", description: e.message }),
                      },
                    )
                  }
                >
                  {runJob.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Run now
                </Button>
              </div>
            ))}
            {!data?.jobs.length && !overview.isLoading && (
              <p className="p-4 text-sm text-muted-foreground">No jobs have run yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Backups */}
      <div className="mt-8">
        <SectionTitle
          icon={Database}
          title="Backups"
          hint={backups.data ? `${backups.data.retentionDays}-day retention` : undefined}
          action={
            <Button
              size="sm"
              className="gap-1.5"
              disabled={backupNow.isPending}
              onClick={() =>
                backupNow.mutate(undefined as never, {
                  onSuccess: (res) => {
                    toast({
                      kind: res.ok ? "success" : "error",
                      title: res.ok ? "Backup complete" : "Backup failed",
                      description: res.ok ? undefined : res.error,
                    });
                    backups.refetch();
                  },
                  onError: (e) => toast({ kind: "error", title: "Backup failed", description: e.message }),
                })
              }
            >
              {backupNow.isPending ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />} Back
              up now
            </Button>
          }
        />
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {(backups.data?.items ?? []).map((b) => (
              <div key={b.key} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{b.key.replace("backups/", "")}</p>
                  <p className="text-xs text-muted-foreground">
                    {bytes(b.size)} · {when(b.lastModified)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() =>
                    backupLink.mutate(
                      { key: b.key },
                      {
                        onSuccess: ({ url }) => window.open(url, "_blank", "noopener"),
                        onError: (e) => toast({ kind: "error", title: "Link failed", description: e.message }),
                      },
                    )
                  }
                >
                  <Download className="size-4" /> Download
                </Button>
              </div>
            ))}
            {!backups.data?.items.length && (
              <p className="p-4 text-sm text-muted-foreground">
                No dumps yet — the nightly job creates the first one, or run it now.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Moderation queue */}
      <div className="mt-8">
        <SectionTitle
          icon={EyeOff}
          title="Moderation queue"
          action={
            <div className="flex gap-1.5">
              {(["open", "all"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={queueStatus === s ? "default" : "outline"}
                  onClick={() => setQueueStatus(s)}
                >
                  {s === "open" ? "Open" : "All"}
                </Button>
              ))}
            </div>
          }
        />
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {(queue.data?.items ?? []).map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{r.targetType.replace("_", " ")}</Badge>
                  <Badge variant={r.status === "open" ? "warning" : "muted"}>{r.status}</Badge>
                  <Badge variant="destructive">{r.reason}</Badge>
                  {r.autoFlagged && <Badge variant="secondary">auto</Badge>}
                  <span className="text-xs text-muted-foreground">{when(r.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm text-foreground/90">{r.targetExcerpt || "(no excerpt)"}</p>
                {r.note && <p className="mt-1 text-xs text-muted-foreground">Reporter note: {r.note}</p>}
                {r.status === "open" && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1.5"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ id: r.id, action: "hide" })}
                    >
                      <EyeOff className="size-4" /> Hide
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ id: r.id, action: "dismiss" })}
                    >
                      <Check className="size-4" /> Dismiss
                    </Button>
                  </div>
                )}
                {r.status === "actioned" && (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ id: r.id, action: "unhide" })}
                    >
                      <X className="size-4" /> Restore content
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {!queue.data?.items.length && (
              <p className="p-4 text-sm text-muted-foreground">Nothing in the queue. Good sign.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Error log */}
      <div className="mt-8">
        <SectionTitle
          icon={AlertTriangle}
          title="Error log"
          hint="deduped by fingerprint"
          action={
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={clearErrors.isPending || !errors.data?.length}
              onClick={() =>
                clearErrors.mutate(
                  {},
                  {
                    onSuccess: () => {
                      errors.refetch();
                      toast({ kind: "success", title: "Error log cleared" });
                    },
                  },
                )
              }
            >
              <Trash2 className="size-4" /> Clear all
            </Button>
          }
        />
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {(errors.data ?? []).map((e) => (
              <div key={e.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={e.level === "error" ? "destructive" : "warning"}>{e.level}</Badge>
                  <Badge variant="muted">{e.source}</Badge>
                  {e.count > 1 && <Badge variant="outline">×{e.count}</Badge>}
                  <span className="text-xs text-muted-foreground">{when(e.lastSeenAt)}</span>
                </div>
                <p className="mt-2 break-words text-sm font-medium">{e.message}</p>
                {e.path && <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.path}</p>}
                {e.stack && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Stack</summary>
                    <pre className="mt-1.5 max-h-48 overflow-auto rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                      {e.stack}
                    </pre>
                  </details>
                )}
                <div className="mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => clearErrors.mutate({ id: e.id }, { onSuccess: () => errors.refetch() })}
                  >
                    <Trash2 className="size-4" /> Dismiss
                  </Button>
                </div>
              </div>
            ))}
            {!errors.data?.length && <p className="p-4 text-sm text-muted-foreground">No errors recorded.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
