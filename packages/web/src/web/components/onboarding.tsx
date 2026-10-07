import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLocation } from "wouter";
import {
  Network,
  NotebookPen,
  Timer,
  Sparkles,
  Flame,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Logo } from "./logo";
import { useCompleteOnboarding } from "../queries/me";

interface Step {
  icon: typeof Network;
  tint: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    tint: "text-accent",
    eyebrow: "Welcome",
    title: "This is your learning OS",
    body: "OrbitL keeps everything you're studying in one place and turns it into a live picture of what you actually know. Your workspace is empty right now — that's on purpose. Everything you see from here will be yours.",
    points: [
      "Nothing is pre-filled or faked",
      "Takes about two minutes to set up",
      "You can revisit this tour from Settings",
    ],
  },
  {
    icon: Network,
    tint: "text-primary",
    eyebrow: "Step 1",
    title: "Start with a subject",
    body: "Add a subject, then break it into concepts. Each concept becomes a node in your knowledge graph, with a mastery score that moves as you study.",
    points: [
      "Subjects → concepts → sub-concepts",
      "Link prerequisites so gaps are obvious",
      "Ask the AI to explain any node on the spot",
    ],
  },
  {
    icon: NotebookPen,
    tint: "text-secondary",
    eyebrow: "Step 2",
    title: "Study, and let it track itself",
    body: "Write notes, generate flashcards and quizzes from any topic, and run focus sessions. Every one of those feeds mastery back into the graph.",
    points: [
      "Notes attach to the concept they belong to",
      "Quizzes and cards generate from your own material",
      "Weak areas surface automatically in Insights",
    ],
  },
  {
    icon: Flame,
    tint: "text-warning",
    eyebrow: "Step 3",
    title: "Your streak has to be earned",
    body: "The streak only moves on days you actually log study — a focus session, a quiz, a flashcard review, or a note. Adding an assignment or tidying up your subjects doesn't count.",
    points: [
      "One study day = one streak day",
      "Miss a day and the streak resets to zero",
      "XP still accrues for everything else you do",
    ],
  },
];

export function OnboardingTour({ onDone }: { onDone?: () => void }) {
  const [step, setStep] = useState(0);
  const [, navigate] = useLocation();
  const complete = useCompleteOnboarding();
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step]!;
  const Icon = current.icon;

  const finish = (destination?: string) => {
    complete.mutate(undefined as never, {
      onSettled: () => {
        onDone?.();
        if (destination) navigate(destination);
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
      >
        {/* Progress */}
        <div className="flex gap-1.5 p-4 pb-0">
          {STEPS.map((s, i) => (
            <button
              key={s.title}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
              className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={false}
                animate={{ width: i <= step ? "100%" : "0%" }}
                transition={{ duration: 0.35 }}
              />
            </button>
          ))}
        </div>

        <div className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <Logo size={32} className="rounded-xl" />
            <span className="text-sm font-semibold">OrbitL</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {step + 1} of {STEPS.length}
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22 }}
            >
              <div className={`mb-4 grid size-12 place-items-center rounded-2xl bg-surface ${current.tint}`}>
                <Icon className="size-6" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {current.eyebrow}
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">{current.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{current.body}</p>
              <ul className="mt-4 space-y-2">
                {current.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span className="text-muted-foreground">{p}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border p-4">
          <Button variant="ghost" size="sm" onClick={() => finish()} disabled={complete.isPending}>
            Skip tour
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((n) => n - 1)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={() => finish("/subjects")} disabled={complete.isPending}>
                {complete.isPending ? <Loader2 className="size-4 animate-spin" /> : <Timer className="size-4" />}
                Add my first subject
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep((n) => n + 1)}>
                Next <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
