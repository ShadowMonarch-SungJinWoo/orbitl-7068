import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Loader2, Trophy, RotateCcw, X } from "lucide-react";
import { useQuiz, useSubmitQuiz } from "../queries/quizzes";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { ProgressRing } from "../components/ui/progress-ring";
import { Confetti } from "../components/confetti";
import { useToast } from "../components/toast";
import { achievementList } from "../lib/achievements";
import { clearPersisted, usePersistentState } from "../lib/persist";

type Question = { question: string; options: string[]; answerIndex: number; explanation: string };

/** A part-answered attempt is worth keeping for a day, not forever. */
const ATTEMPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export default function QuizPlayPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const { data, isLoading } = useQuiz(id);
  const submit = useSubmitQuiz();
  const { toast } = useToast();

  const questions = useMemo<Question[]>(() => (data?.parsed as Question[]) ?? [], [data]);

  // An attempt in progress survives the page going away — a reload used to wipe
  // every answer given so far. Keyed per quiz, so attempts don't bleed together.
  const attemptKey = `orbitl.quiz.attempt.${id}`;
  const [answers, setAnswers] = usePersistentState<number[]>(attemptKey, [], {
    maxAgeMs: ATTEMPT_MAX_AGE_MS,
  });
  const [i, setI] = usePersistentState<number>(`${attemptKey}.at`, 0, {
    maxAgeMs: ATTEMPT_MAX_AGE_MS,
  });
  const [result, setResult] = useState<{ score: number; correct: number; total: number } | null>(null);
  const [burst, setBurst] = useState(0);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-muted-foreground">Quiz not found.</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link to="/quizzes">Back to quizzes</Link>
        </Button>
      </div>
    );
  }

  const q = questions[i];
  const selected = answers[i];
  const answeredAll = questions.length > 0 && answers.filter((a) => a !== undefined && a !== null).length === questions.length;

  const pick = (idx: number) => {
    if (result) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[i] = idx;
      return next;
    });
  };

  const finish = () => {
    submit.mutate(
      { quizId: id, answers: questions.map((_, n) => answers[n] ?? -1) },
      {
        onSuccess: (r) => {
          // Scored and banked on the server — the local attempt is spent.
          clearPersisted(attemptKey);
          clearPersisted(`${attemptKey}.at`);
          setResult({ score: r.score, correct: r.correct, total: r.total });
          if (r.score >= 80) setBurst(Date.now());
          if (r.award?.leveledUp) toast({ kind: "success", title: `Level up! You're level ${r.award.level}` });
          if (r.award?.newAchievements?.length)
            toast({ kind: "success", title: "Achievement unlocked", description: achievementList(r.award.newAchievements) });
        },
        onError: (e) => toast({ kind: "error", title: "Could not submit", description: e.message }),
      },
    );
  };

  if (result) {
    return (
      <div className="mx-auto max-w-2xl">
        <Confetti trigger={burst} />
        <Card className="mb-6">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <div className="grid size-16 place-items-center rounded-2xl bg-primary/15">
              <Trophy className="size-8 text-primary" />
            </div>
            <ProgressRing value={result.score} size={112} stroke={9} />
            <h2 className="text-xl font-bold">
              {result.correct} / {result.total} correct
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {result.score >= 80
                ? "Excellent — this concept is locking in. Mastery updated on your knowledge graph."
                : result.score >= 50
                  ? "Solid start. Review the explanations below and try again in a day or two."
                  : "This one needs work. Read the explanations, then generate flashcards for the same concept."}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setAnswers([]);
                  setI(0);
                }}
              >
                <RotateCcw className="size-4" /> Retake
              </Button>
              <Button asChild>
                <Link to="/quizzes">Back to quizzes</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Review</h3>
        <div className="space-y-3">
          {questions.map((question, n) => {
            const ok = answers[n] === question.answerIndex;
            return (
              <Card key={n} className={ok ? "border-success/40" : "border-destructive/40"}>
                <CardContent className="space-y-2 p-5">
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${ok ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
                      {ok ? <Check className="size-3" /> : <X className="size-3" />}
                    </span>
                    <p className="text-sm font-medium">{question.question}</p>
                  </div>
                  <p className="pl-7 text-sm">
                    <span className="text-muted-foreground">Correct: </span>
                    <span className="font-medium text-success">{question.options[question.answerIndex]}</span>
                  </p>
                  {!ok && answers[n] >= 0 && (
                    <p className="pl-7 text-sm">
                      <span className="text-muted-foreground">You picked: </span>
                      <span className="text-destructive">{question.options[answers[n]]}</span>
                    </p>
                  )}
                  <p className="pl-7 text-sm leading-relaxed text-muted-foreground">{question.explanation}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/quizzes">
            <ArrowLeft className="size-4" /> Quizzes
          </Link>
        </Button>
        <Badge variant="muted">
          {i + 1} / {questions.length}
        </Badge>
      </div>

      <h1 className="mb-4 text-lg font-bold">{data.title}</h1>

      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${((i + 1) / Math.max(1, questions.length)) * 100}%` }} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
          <Card>
            <CardContent className="space-y-4 p-6">
              <p className="text-base font-semibold leading-snug">{q?.question}</p>
              <div className="space-y-2">
                {q?.options.map((opt, idx) => {
                  const active = selected === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => pick(idx)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left text-sm transition-all ${
                        active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-surface hover:border-primary/40"
                      }`}
                    >
                      <span className={`grid size-6 shrink-0 place-items-center rounded-lg text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      <div className="mt-5 flex items-center justify-between">
        <Button variant="outline" disabled={i === 0} onClick={() => setI((x) => x - 1)}>
          <ArrowLeft className="size-4" /> Previous
        </Button>
        {i < questions.length - 1 ? (
          <Button disabled={selected === undefined} onClick={() => setI((x) => x + 1)}>
            Next <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button disabled={!answeredAll || submit.isPending} onClick={finish}>
            {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Submit
          </Button>
        )}
      </div>
    </div>
  );
}
