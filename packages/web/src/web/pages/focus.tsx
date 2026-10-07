import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { useSearch } from "wouter";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  Check,
  Loader2,
  Coffee,
  Zap,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  EyeOff,
  Repeat,
  Flame,
  Gauge,
  CalendarDays,
  Trophy,
  NotebookPen,
} from "lucide-react";
import { useSessions, useFocusStats, useCompleteSession, useReflectOnSession } from "../queries/focus";
import { useSubjects } from "../queries/subjects";
import { useTopicDetail } from "../queries/topics";
import { PageHeader } from "../components/ui/page-header";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input, Textarea } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { Modal } from "../components/ui/modal";
import { SubjectSelect, TopicPicker } from "../components/topic-picker";
import { Confetti } from "../components/confetti";
import { useToast } from "../components/toast";
import { fmtDate, fmtMinutes } from "../lib/format";
import { AMBIENTS, AmbientPlayer, type Ambient, ensureNotifyPermission, notify, playChime } from "../lib/focus-audio";
import { clearPersisted, readPersisted, readPersistedAt, writePersisted } from "../lib/persist";

type Phase = "focus" | "break" | "long";
type ModeId = "pomodoro" | "deep" | "sprint" | "custom";

const PRESETS: { id: ModeId; label: string; hint: string; focus: number; break: number; long: number }[] = [
  { id: "pomodoro", label: "Pomodoro", hint: "25 / 5", focus: 25, break: 5, long: 15 },
  { id: "deep", label: "Deep work", hint: "50 / 10", focus: 50, break: 10, long: 20 },
  { id: "sprint", label: "Sprint", hint: "15 / 3", focus: 15, break: 3, long: 10 },
];

/** Settings that should survive a reload — nobody wants to re-pick their sound every session. */
type Prefs = {
  mode: ModeId;
  focus: number;
  break: number;
  long: number;
  longEvery: number;
  autoStart: boolean;
  notifyOn: boolean;
  ambient: Ambient | "off";
};

const PREFS_KEY = "orbitl.focus.prefs";

const DEFAULT_PREFS: Prefs = {
  mode: "pomodoro",
  focus: 25,
  break: 5,
  long: 15,
  longEvery: 4,
  autoStart: false,
  notifyOn: true,
  ambient: "off",
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * The live timer, mirrored to storage.
 *
 * A running session is the one thing on this screen that must not be lost if
 * the page goes away without the user asking — a reload used to reset a
 * 40-minute interval to 25:00. The snapshot carries a wall-clock stamp, so a
 * timer that was running keeps counting across the gap instead of freezing at
 * whatever second the page died on.
 */
const RUN_KEY = "orbitl.focus.run";

/** Older than this and the session is treated as abandoned, not resumed. */
const RUN_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * How long a gap still counts as "the screen blinked". Up to this, the missing
 * seconds are credited to the session; past it the timer comes back paused
 * rather than inventing focus time the user didn't do.
 */
const RUN_GRACE_SEC = 90;

interface RunState {
  phase: Phase;
  running: boolean;
  left: number;
  elapsed: number;
  pauseCount: number;
  pausedSec: number;
  distractionCount: number;
  cycles: number;
  concept: string;
  subjectId: string;
  topicId: string;
  tasks: number;
}

function loadRun(): (RunState & { awayFor?: number }) | null {
  const snap = readPersisted<RunState & { at?: number }>(RUN_KEY, RUN_MAX_AGE_MS);
  if (!snap) return null;
  const savedAt = readPersistedAt(RUN_KEY) ?? Date.now();
  // Nothing in progress — don't resurrect an idle screen.
  if (!snap.running && snap.elapsed === 0 && !snap.concept && snap.tasks === 0) return null;
  if (!snap.running) return snap;

  const gap = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));

  // A short gap is a reload or an accidental remount — the user was sitting
  // right there, so credit the seconds and keep counting.
  if (gap <= RUN_GRACE_SEC) {
    return {
      ...snap,
      left: Math.max(0, snap.left - gap),
      elapsed: snap.elapsed + Math.min(gap, snap.left),
    };
  }

  // A long gap means the tab was closed or the machine slept. Crediting that
  // as focus time would log work nobody did, so the session comes back paused
  // exactly where it stopped and the user decides whether to resume it.
  return { ...snap, running: false, pauseCount: snap.pauseCount + 1, awayFor: gap };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n) || lo));

export default function FocusPage() {
  const { data: sessions, isLoading } = useSessions();
  const { data: stats } = useFocusStats();
  const { data: subjects } = useSubjects();
  const complete = useCompleteSession();
  const reflect = useReflectOnSession();
  const { toast } = useToast();

  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* private mode — prefs just won't persist */
    }
  }, [prefs]);

  // Whatever was in flight last time this screen was alive. Read once, at
  // mount, and used as the seed for every piece of timer state below.
  const restored = useRef<(RunState & { awayFor?: number }) | null>(loadRun()).current;

  // What's being studied. `concept` is free text so a session can be logged
  // before the concept exists in the graph; the topic link is optional on top.
  const [concept, setConcept] = useState(restored?.concept ?? "");
  const [subjectId, setSubjectId] = useState(restored?.subjectId ?? "");
  const [topicId, setTopicId] = useState(restored?.topicId ?? "");

  // `/focus?topic=<id>` arrives from a Smart Insights action ("start a focus
  // session on X"). Prefill the concept, subject and topic link once the topic
  // loads so the session is already pointed at the right thing.
  const search = useSearch();
  const paramTopicId = new URLSearchParams(search).get("topic") ?? "";
  const { data: paramTopic } = useTopicDetail(paramTopicId);
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !paramTopic?.topic) return;
    prefilled.current = true;
    setTopicId(paramTopic.topic.id);
    setSubjectId(paramTopic.topic.subjectId ?? "");
    setConcept((c) => c || paramTopic.topic.name);
  }, [paramTopic]);
  const [tasks, setTasks] = useState(restored?.tasks ?? 0);

  const [phase, setPhase] = useState<Phase>(restored?.phase ?? "focus");
  const [running, setRunning] = useState(restored?.running ?? false);
  const [left, setLeft] = useState(restored?.left ?? prefs.focus * 60);
  const [elapsed, setElapsed] = useState(restored?.elapsed ?? 0);

  // Honesty signals for the focus score. The server recomputes the score from
  // these, so the numbers here are evidence rather than a self-assessment.
  const [pauseCount, setPauseCount] = useState(restored?.pauseCount ?? 0);
  const [pausedSec, setPausedSec] = useState(restored?.pausedSec ?? 0);
  const [distractionCount, setDistractionCount] = useState(restored?.distractionCount ?? 0);
  const [cycles, setCycles] = useState(restored?.cycles ?? 0);

  const [burst, setBurst] = useState(0);
  const [reflectFor, setReflectFor] = useState<{ id: string; minutes: number } | null>(null);
  const [reflectionText, setReflectionText] = useState("");

  const savedRef = useRef(false);
  const ambientRef = useRef<AmbientPlayer | null>(null);

  const phaseMinutes = phase === "focus" ? prefs.focus : phase === "break" ? prefs.break : prefs.long;
  const total = phaseMinutes * 60;

  /** Editing any duration means the user is no longer on a preset. */
  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setPrefs((prev) => ({ ...prev, mode: p.id, focus: p.focus, break: p.break, long: p.long }));
    hardReset("focus", p.focus);
  };

  const hardReset = (nextPhase: Phase = phase, minutes?: number) => {
    setPhase(nextPhase);
    setRunning(false);
    setLeft((minutes ?? (nextPhase === "focus" ? prefs.focus : nextPhase === "break" ? prefs.break : prefs.long)) * 60);
    setElapsed(0);
    setPauseCount(0);
    setPausedSec(0);
    setDistractionCount(0);
    savedRef.current = false;
  };

  // Mirror the live timer on every change, including each tick, so whenever the
  // page is torn down the next mount can pick the session back up. Cheap: one
  // small JSON write a second, and nothing at all once the screen is idle.
  useEffect(() => {
    const idle = !running && elapsed === 0 && !concept && tasks === 0;
    if (idle) {
      clearPersisted(RUN_KEY);
      return;
    }
    writePersisted<RunState>(RUN_KEY, {
      phase,
      running,
      left,
      elapsed,
      pauseCount,
      pausedSec,
      distractionCount,
      cycles,
      concept,
      subjectId,
      topicId,
      tasks,
    });
  }, [
    phase,
    running,
    left,
    elapsed,
    pauseCount,
    pausedSec,
    distractionCount,
    cycles,
    concept,
    subjectId,
    topicId,
    tasks,
  ]);

  // Say so when a session came back from storage — silently resuming a timer
  // the user thought they'd lost is more confusing than helpful.
  const announcedResume = useRef(false);
  useEffect(() => {
    if (announcedResume.current || !restored) return;
    announcedResume.current = true;
    if (!restored.running && restored.elapsed === 0) return;
    // Came back after a real absence: say so, and say it's waiting on them.
    if (restored.awayFor) {
      const mins = Math.max(1, Math.round(restored.awayFor / 60));
      toast({
        kind: "info",
        title: "Session paused",
        description: `You were away about ${mins} min, so that time wasn't counted. Press Resume to carry on.`,
      });
      return;
    }
    toast({
      kind: "info",
      title: restored.running ? "Session resumed" : "Session restored",
      description: "The page reloaded — your timer picked up where it left off.",
    });
  }, [restored, toast]);

  // Main tick. Paused seconds are counted too, but only during a focus interval —
  // a long pause mid-focus is exactly what should dent the score.
  useEffect(() => {
    const t = setInterval(() => {
      if (running) {
        setLeft((l) => Math.max(0, l - 1));
        setElapsed((e) => e + 1);
      } else if (phase === "focus" && elapsed > 0 && left > 0) {
        setPausedSec((p) => p + 1);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [running, phase, elapsed, left]);

  // Tab-away during focus is an attention loss worth recording. Counted once per
  // hide, not per second, so alt-tabbing to check a formula isn't catastrophic.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && running && phase === "focus") setDistractionCount((d) => d + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [running, phase]);

  // Ambient bed follows the focus interval only — silence during a break is the point.
  useEffect(() => {
    if (!ambientRef.current) ambientRef.current = new AmbientPlayer();
    const player = ambientRef.current;
    if (running && phase === "focus" && prefs.ambient !== "off") player.start(prefs.ambient, 0.12);
    else player.stop();
    return () => {
      if (!running) player.stop();
    };
  }, [running, phase, prefs.ambient]);

  useEffect(() => () => ambientRef.current?.stop(), []);

  const logSession = useCallback(
    (durationSec: number, opts: { advance: boolean }) => {
      if (durationSec < 1 || savedRef.current) return;
      savedRef.current = true;
      const nextCycles = cycles + 1;
      complete.mutate(
        {
          durationSec,
          tasksCompleted: tasks,
          subjectId: subjectId || undefined,
          topicId: topicId || undefined,
          concept: concept.trim() || undefined,
          mode: prefs.mode,
          focusMinutes: prefs.focus,
          breakMinutes: prefs.break,
          longBreakMinutes: prefs.long,
          cyclesCompleted: nextCycles,
          pauseCount,
          pausedSec,
          distractionCount,
        },
        {
          onSuccess: (r) => {
            setBurst(Date.now());
            const minutes = Math.round(durationSec / 60);
            toast({
              kind: "success",
              title: `Session logged · +${r.xp} XP · ${r.focusScore}% focus`,
              description: r.award?.leveledUp
                ? `Level ${r.award.level} unlocked!`
                : `${fmtMinutes(minutes)} on ${concept.trim() || "deep work"}.`,
            });
            setCycles(nextCycles);
            setTasks(0);
            if (r.session) {
              setReflectionText("");
              setReflectFor({ id: r.session.id, minutes });
            }
            if (opts.advance) {
              const isLong = nextCycles % Math.max(1, prefs.longEvery) === 0;
              hardReset(isLong ? "long" : "break");
              if (prefs.autoStart) setRunning(true);
            } else {
              hardReset("focus");
            }
          },
          onError: (e) => {
            savedRef.current = false;
            toast({ kind: "error", title: "Could not save session", description: e.message });
          },
        },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cycles, tasks, subjectId, topicId, concept, prefs, pauseCount, pausedSec, distractionCount],
  );

  // Interval boundary.
  useEffect(() => {
    if (left !== 0 || !running) return;
    setRunning(false);
    if (phase === "focus") {
      playChime("focusEnd");
      if (prefs.notifyOn) notify("Focus interval done", "Time for a break — session is being logged.");
      logSession(prefs.focus * 60, { advance: true });
    } else {
      playChime("breakEnd");
      if (prefs.notifyOn) notify("Break over", "Ready for another round?");
      toast({ kind: "info", title: "Break over", description: "Ready for another round?" });
      hardReset("focus");
      if (prefs.autoStart) setRunning(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, running]);

  const start = async () => {
    if (prefs.notifyOn && !running) {
      const ok = await ensureNotifyPermission();
      if (!ok) setPref("notifyOn", false);
    }
    setRunning(true);
  };

  const togglePause = () => {
    if (running) {
      setRunning(false);
      if (phase === "focus") setPauseCount((p) => p + 1);
    } else {
      void start();
    }
  };

  const pct = total ? ((total - left) / total) * 100 : 0;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const size = 260;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;

  // Live preview of the score the server will assign, so the honesty signals are
  // visible while they still can be influenced.
  const liveScore = useMemo(() => {
    const planned = prefs.focus * 60;
    const completion = planned > 0 ? Math.min(1, elapsed / planned) : 1;
    const active = elapsed + pausedSec;
    const onTask = active > 0 ? elapsed / active : 1;
    const penalty = Math.min(0.4, distractionCount * 0.05);
    return Math.max(0, Math.min(100, Math.round((completion * 0.5 + onTask * 0.5 - penalty) * 100)));
  }, [elapsed, pausedSec, distractionCount, prefs.focus]);

  const nextIsLong = (cycles + 1) % Math.max(1, prefs.longEvery) === 0;
  const trend = stats?.trend ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <Confetti trigger={burst} />
      <PageHeader title="Focus Mode" subtitle="Distraction-free deep work, measured honestly." icon={Timer} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Flame} label="Today" value={fmtMinutes(stats?.todayMinutes ?? 0)} hint={`${stats?.todaySessions ?? 0} sessions`} />
        <StatCard icon={CalendarDays} label="Last 7 days" value={fmtMinutes(stats?.weekMinutes ?? 0)} hint={`${stats?.weekSessions ?? 0} sessions`} />
        <StatCard icon={Gauge} label="Avg focus score" value={`${stats?.avgFocusScore ?? 0}%`} hint="Last 14 days" />
        <StatCard icon={Trophy} label="Best day" value={fmtMinutes(stats?.bestDayMinutes ?? 0)} hint="Personal ceiling" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardContent className="flex flex-col items-center gap-6 p-6 sm:p-8">
              <div className="flex flex-wrap justify-center gap-1 rounded-xl bg-surface p-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p)}
                    className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                      prefs.mode === p.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.label} <span className="text-xs opacity-70">{p.hint}</span>
                  </button>
                ))}
                <button
                  onClick={() => setPref("mode", "custom")}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                    prefs.mode === "custom" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Custom
                </button>
              </div>

              {prefs.mode === "custom" && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="w-full max-w-md overflow-hidden">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MinuteField label="Focus" value={prefs.focus} min={1} max={180} onChange={(v) => { setPref("focus", v); if (phase === "focus" && !running) setLeft(v * 60); }} />
                    <MinuteField label="Break" value={prefs.break} min={1} max={60} onChange={(v) => setPref("break", v)} />
                    <MinuteField label="Long break" value={prefs.long} min={1} max={90} onChange={(v) => setPref("long", v)} />
                    <MinuteField label="Long every" value={prefs.longEvery} min={1} max={12} suffix="cycles" onChange={(v) => setPref("longEvery", v)} />
                  </div>
                </motion.div>
              )}

              <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="-rotate-90">
                  <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={phase === "focus" ? "var(--primary)" : "var(--accent)"}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={circ - (pct / 100) * circ}
                    style={{ transition: "stroke-dashoffset 0.9s linear" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                  <motion.span key={mm + ss} className="text-5xl font-bold tabular-nums tracking-tight">
                    {mm}:{ss}
                  </motion.span>
                  <Badge variant={phase === "focus" ? "default" : "accent"}>
                    {phase === "focus" ? <Zap className="size-3" /> : <Coffee className="size-3" />}
                    {phase === "focus" ? "Focus" : phase === "break" ? "Break" : "Long break"}
                  </Badge>
                  {concept.trim() && <p className="max-w-[190px] truncate text-center text-xs text-muted-foreground">{concept.trim()}</p>}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={togglePause} className="min-w-32">
                  {running ? (
                    <>
                      <Pause className="size-4" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="size-4" /> {elapsed > 0 ? "Resume" : "Start"}
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => hardReset()}>
                  <RotateCcw className="size-4" /> Reset
                </Button>
                {phase === "focus" && (
                  <Button variant="outline" disabled={elapsed < 1 || complete.isPending} onClick={() => logSession(elapsed, { advance: false })}>
                    {complete.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Log session
                  </Button>
                )}
                <Button variant="ghost" onClick={() => hardReset(phase === "focus" ? (nextIsLong ? "long" : "break") : "focus")}>
                  {phase === "focus" ? "Skip to break" : "Back to focus"}
                </Button>
              </div>

              <div className="grid w-full grid-cols-2 gap-3 border-t border-border pt-5 text-center sm:grid-cols-4">
                <LiveStat label="Cycle" value={`${cycles + (phase === "focus" ? 1 : 0)}`} hint={`Long break every ${prefs.longEvery}`} />
                <LiveStat label="Live score" value={`${liveScore}%`} hint={liveScore >= 90 ? "Bonus XP range" : "Stay on task"} />
                <LiveStat label="Pauses" value={`${pauseCount}`} hint={pausedSec > 0 ? `${Math.round(pausedSec / 60)}m paused` : "None"} />
                <LiveStat label="Tab-aways" value={`${distractionCount}`} hint="Counted while focusing" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <p className="text-sm font-semibold">What are you studying?</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Concept studied</p>
                  <Input
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    maxLength={120}
                    placeholder="e.g. Integration by parts"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Subject (optional)</p>
                  <SubjectSelect value={subjectId} onChange={setSubjectId} options={(subjects ?? []).map((s) => ({ id: s.id, name: s.name }))} />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Link to a concept (optional)</p>
                  <TopicPicker value={topicId} onChange={setTopicId} placeholder="No concept link" />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Tasks completed</p>
                  <div className="flex h-10 items-center gap-2">
                    <Button variant="outline" size="icon-sm" onClick={() => setTasks((t) => Math.max(0, t - 1))}>
                      −
                    </Button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">{tasks}</span>
                    <Button variant="outline" size="icon-sm" onClick={() => setTasks((t) => t + 1)}>
                      +
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Toggle on={prefs.autoStart} onClick={() => setPref("autoStart", !prefs.autoStart)} icon={Repeat} label="Auto-start next" />
                <Toggle
                  on={prefs.notifyOn}
                  onClick={async () => {
                    if (!prefs.notifyOn) {
                      const ok = await ensureNotifyPermission();
                      if (!ok) {
                        toast({ kind: "error", title: "Notifications blocked", description: "Allow notifications in your browser settings." });
                        return;
                      }
                    }
                    setPref("notifyOn", !prefs.notifyOn);
                  }}
                  icon={prefs.notifyOn ? Bell : BellOff}
                  label="Alerts & sound"
                />
                <div className="flex items-center gap-1 rounded-xl bg-surface p-1">
                  <button
                    onClick={() => setPref("ambient", "off")}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${prefs.ambient === "off" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
                  >
                    <VolumeX className="size-3.5" /> Silent
                  </button>
                  {AMBIENTS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setPref("ambient", a.id)}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${prefs.ambient === a.id ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
                    >
                      <Volume2 className="size-3.5" /> {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Focus trend</p>
                  <p className="text-xs text-muted-foreground">Minutes per day, last 14 days</p>
                </div>
                <Badge variant="muted">{fmtMinutes(trend.reduce((a, b) => a + b.minutes, 0))}</Badge>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend}>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="day"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      tickFormatter={(v: string) => v.slice(5)}
                    />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={28} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        fontSize: 12,
                        color: "var(--foreground)",
                      }}
                    />
                    <Bar dataKey="minutes" radius={[8, 8, 0, 0]}>
                      {trend.map((_, i) => (
                        <Cell key={i} fill="var(--primary)" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {(stats?.topConcepts.length ?? 0) > 0 && (
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold text-muted-foreground">Where your hours went</p>
                <div className="mt-3 space-y-2.5">
                  {stats?.topConcepts.map((c) => {
                    const max = stats.topConcepts[0]?.minutes || 1;
                    return (
                      <div key={c.concept}>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-medium">{c.concept}</p>
                          <p className="shrink-0 text-xs text-muted-foreground">{fmtMinutes(c.minutes)}</p>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${(c.minutes / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <p className="px-5 py-4 text-xs font-semibold text-muted-foreground">Session history</p>
              {isLoading ? (
                <div className="space-y-2 px-5 pb-5">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : !sessions || sessions.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">No sessions yet. Start your first timer.</p>
              ) : (
                <div className="max-h-[560px] divide-y divide-border overflow-y-auto">
                  {sessions.slice(0, 30).map((s) => (
                    <div key={s.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{s.conceptLabel || "Untitled session"}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {fmtMinutes(Math.round(s.durationSec / 60))}
                            {s.subjectName ? ` · ${s.subjectName}` : ""} · {fmtDate(s.createdAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant={s.focusScore >= 80 ? "success" : "warning"}>{s.focusScore}%</Badge>
                          <span className="text-xs text-muted-foreground">+{s.xpEarned}</span>
                        </div>
                      </div>
                      {(s.distractionCount > 0 || s.pauseCount > 0) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          {s.pauseCount > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Pause className="size-3" /> {s.pauseCount} pauses
                            </span>
                          )}
                          {s.distractionCount > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <EyeOff className="size-3" /> {s.distractionCount} tab-aways
                            </span>
                          )}
                        </div>
                      )}
                      {s.reflection && (
                        <p className="mt-2 rounded-lg bg-surface px-2.5 py-1.5 text-[11px] italic text-muted-foreground">“{s.reflection}”</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal open={!!reflectFor} onClose={() => setReflectFor(null)} title="How did that go?">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {reflectFor ? `${fmtMinutes(reflectFor.minutes)} logged.` : ""} One line on what clicked or what tripped you up — future you will
            thank you.
          </p>
          <Textarea
            value={reflectionText}
            onChange={(e) => setReflectionText(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Got the substitution step, still shaky on choosing u…"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReflectFor(null)}>
              Skip
            </Button>
            <Button
              disabled={!reflectionText.trim() || reflect.isPending}
              onClick={() => {
                if (!reflectFor) return;
                reflect.mutate(
                  { id: reflectFor.id, reflection: reflectionText.trim() },
                  {
                    onSuccess: () => {
                      toast({ kind: "success", title: "Reflection saved" });
                      setReflectFor(null);
                    },
                    onError: (e) => toast({ kind: "error", title: "Could not save", description: e.message }),
                  },
                );
              }}
            >
              {reflect.isPending ? <Loader2 className="size-4 animate-spin" /> : <NotebookPen className="size-4" />} Save reflection
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint }: { icon: typeof Flame; label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4" />
          <p className="text-xs font-medium">{label}</p>
        </div>
        <p className="mt-1.5 text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function LiveStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function MinuteField({
  label,
  value,
  min,
  max,
  suffix = "min",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="relative">
        <Input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
          className="pr-12 tabular-nums"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, icon: Icon, label }: { on: boolean; onClick: () => void; icon: typeof Bell; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
        on ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );
}
