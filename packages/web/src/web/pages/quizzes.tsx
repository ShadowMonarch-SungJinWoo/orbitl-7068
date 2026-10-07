import { useState } from "react";
import { Link } from "wouter";
import { motion } from "motion/react";
import { ListChecks, Sparkles, Loader2, Trash2, Play, History } from "lucide-react";
import { useQuizzes, useGenerateQuiz, useDeleteQuiz, useQuizAttempts } from "../queries/quizzes";
import { AiErrorNotice } from "../components/ai-error";
import { PageHeader, EmptyState } from "../components/ui/page-header";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Modal } from "../components/ui/modal";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { TopicPicker } from "../components/topic-picker";
import { useToast } from "../components/toast";
import { fmtDate } from "../lib/format";

export default function QuizzesPage() {
  const { data, isLoading } = useQuizzes();
  const { data: attempts } = useQuizAttempts();
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Quizzes"
        subtitle="AI-generated practice tests that adapt to your concepts."
        icon={ListChecks}
        action={
          <Button onClick={() => setOpen(true)}>
            <Sparkles className="size-4" /> Generate quiz
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No quizzes yet"
          description="Pick any concept and let the AI build a quiz around it."
          action={
            <Button onClick={() => setOpen(true)}>
              <Sparkles className="size-4" /> Generate your first quiz
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((q, i) => {
            const best = (attempts ?? []).filter((a) => a.quizId === q.id).sort((a, b) => b.score - a.score)[0];
            return (
              <motion.div key={q.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <QuizCard quiz={q} bestScore={best?.score ?? null} />
              </motion.div>
            );
          })}
        </div>
      )}

      {attempts && attempts.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <History className="size-4" /> Recent attempts
          </h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {attempts.slice(0, 8).map((a) => (
                <div key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-muted-foreground">{fmtDate(a.createdAt)}</span>
                  <span>
                    {a.correct}/{a.total} correct
                  </span>
                  <Badge variant={a.score >= 80 ? "success" : a.score >= 50 ? "warning" : "destructive"}>{a.score}%</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <GenerateModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function QuizCard({
  quiz,
  bestScore,
}: {
  quiz: { id: string; title: string; questionCount: number; createdAt: Date | string };
  bestScore: number | null;
}) {
  const del = useDeleteQuiz();
  return (
    <Card className="group h-full transition-colors hover:border-primary/40">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold leading-tight">{quiz.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {quiz.questionCount} questions · {fmtDate(quiz.createdAt)}
            </p>
          </div>
          <button
            onClick={() => del.mutate({ id: quiz.id })}
            aria-label="Delete quiz"
            className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <div className="mt-auto flex items-center justify-between">
          {bestScore === null ? (
            <Badge variant="muted">Not attempted</Badge>
          ) : (
            <Badge variant={bestScore >= 80 ? "success" : bestScore >= 50 ? "warning" : "destructive"}>Best {bestScore}%</Badge>
          )}
          <Button size="sm" asChild>
            <Link to={`/quizzes/${quiz.id}`}>
              <Play className="size-3.5" /> {bestScore === null ? "Start" : "Retake"}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function GenerateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const gen = useGenerateQuiz();
  const { toast } = useToast();
  const [topicId, setTopicId] = useState("");
  const [count, setCount] = useState(5);

  const submit = () => {
    if (!topicId) return;
    gen.mutate(
      { topicId, count },
      {
        onSuccess: () => {
          toast({ kind: "success", title: "Quiz ready", description: `${count} questions generated.` });
          setTopicId("");
          onClose();
        },
        onError: (e) => toast({ kind: "error", title: "Generation failed", description: e.message }),
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate a quiz"
      description="The AI writes questions, options and explanations for the concept you pick."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={gen.isPending || !topicId}>
            {gen.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Generate
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Concept</p>
          <TopicPicker value={topicId} onChange={setTopicId} />
        </div>
        {gen.isError && <AiErrorNotice error={gen.error} onRetry={submit} retrying={gen.isPending} />}
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Questions: {count}</p>
          <input
            type="range"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
      </div>
    </Modal>
  );
}
