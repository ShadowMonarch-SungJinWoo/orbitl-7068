import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLocation } from "wouter";
import {
  Check,
  ChevronDown,
  CornerDownLeft,
  Lightbulb,
  Loader2,
  MessageCircleQuestion,
  PartyPopper,
  Sparkles,
  Target,
  Timer,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Markdown } from "./ui/markdown";
import { humanizeMath } from "../lib/math-text";
import { fmtDate } from "../lib/format";
import { useAskFollowUp, useInsightReplies, useSetInsightStatus } from "../queries/coach";
import { useGenerateQuiz } from "../queries/quizzes";
import { useCreateAssignment } from "../queries/assignments";

export interface Insight {
  id: string;
  kind: string;
  title: string;
  body: string;
  reason: string | null;
  subjectId: string | null;
  topicId: string | null;
  actionKind: string;
  actionLabel: string | null;
  actionTarget: string | null;
  status: string;
  createdAt: Date | string;
  replyCount?: number;
}

const KIND: Record<string, { icon: typeof Lightbulb; variant: "default" | "warning" | "success" | "accent"; label: string }> = {
  suggestion: { icon: Lightbulb, variant: "default", label: "Suggestion" },
  warning: { icon: TriangleAlert, variant: "warning", label: "Watch out" },
  celebration: { icon: PartyPopper, variant: "success", label: "Win" },
  plan: { icon: Target, variant: "accent", label: "Plan" },
};

/** Suggested questions, so "ask a follow-up" isn't a blank box the student ignores. */
const PROMPTS = ["Why is this happening?", "What exactly should I do about it?", "How do I know it's working?"];

/** Standalone card, used on the Smart Insights page. */
function FullShell({ dim, children }: { dim: boolean; children: React.ReactNode }) {
  return (
    <Card className={dim ? "opacity-70" : undefined}>
      <CardContent className="space-y-3 p-5">{children}</CardContent>
    </Card>
  );
}

/** Nested inside the dashboard's existing AI Coach card, so no second border. */
function CompactShell({ dim, children }: { dim: boolean; children: React.ReactNode }) {
  return <div className={`space-y-2.5 rounded-xl bg-surface p-3 ${dim ? "opacity-70" : ""}`}>{children}</div>;
}

export function InsightCard({
  insight,
  range,
  subjectId,
  compact = false,
}: {
  insight: Insight;
  range: 7 | 30 | 90;
  subjectId: string | null;
  /**
   * Dashboard variant: same engine, same follow-ups and same one-click action,
   * but nested inside an existing card and trimmed of the status controls that
   * belong on the Smart Insights page.
   */
  compact?: boolean;
}) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");

  const replies = useInsightReplies(open ? insight.id : null);
  const ask = useAskFollowUp();
  const setStatus = useSetInsightStatus();
  const genQuiz = useGenerateQuiz();
  const createAssignment = useCreateAssignment();

  const meta = KIND[insight.kind] ?? KIND.suggestion;
  const Icon = meta.icon;
  const resolved = insight.status !== "new";
  const busy = ask.isPending;

  function submit(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setQuestion("");
    ask.mutate({ messageId: insight.id, question: text, range, subjectId });
  }

  /**
   * The action the coach attached. A quiz needs a real concept to exist, so it is
   * only offered when the insight resolved to one — a button that cannot work is
   * worse than no button.
   */
  function runAction() {
    if (insight.actionKind === "focus") {
      navigate(insight.topicId ? `/focus?topic=${insight.topicId}` : "/focus");
      return;
    }
    if (insight.actionKind === "quiz" && insight.topicId) {
      genQuiz.mutate(
        { topicId: insight.topicId, count: 5 },
        { onSuccess: (quiz) => navigate(`/quizzes/${quiz.id}`) },
      );
      return;
    }
    if (insight.actionKind === "revision") {
      const due = new Date();
      due.setDate(due.getDate() + 2);
      createAssignment.mutate(
        {
          title: `Revise ${insight.actionTarget ?? insight.title}`,
          description: insight.body,
          subjectId: insight.subjectId ?? undefined,
          topicId: insight.topicId ?? undefined,
          dueDate: due.getTime(),
          priority: "high",
        },
        { onSuccess: () => navigate("/assignments") },
      );
    }
  }

  const actionable =
    insight.actionKind === "focus" ||
    insight.actionKind === "revision" ||
    (insight.actionKind === "quiz" && !!insight.topicId);
  const actionBusy = genQuiz.isPending || createAssignment.isPending;
  const ActionIcon = insight.actionKind === "quiz" ? Sparkles : insight.actionKind === "focus" ? Timer : Target;

  const Shell = compact ? CompactShell : FullShell;

  return (
    <Shell dim={resolved}>
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface">
            <Icon className="size-4 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant={meta.variant}>{meta.label}</Badge>
              {insight.status === "done" && (
                <Badge variant="success">
                  <Check className="size-3" /> Done
                </Badge>
              )}
              {insight.status === "dismissed" && <Badge variant="muted">Dismissed</Badge>}
              <span className="text-xs text-muted-foreground">{fmtDate(insight.createdAt)}</span>
            </div>
            <p className="text-sm font-semibold leading-snug">{insight.title}</p>
          </div>
        </div>

        <Markdown content={humanizeMath(insight.body)} className="text-sm text-muted-foreground" />

        {insight.reason && !compact && (
          <p className="rounded-xl bg-background px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Based on:</span> {insight.reason}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {actionable && (
            <Button size="sm" onClick={runAction} disabled={actionBusy} className="max-w-full">
              {actionBusy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <ActionIcon className="size-4 shrink-0" />}
              <span className="truncate">{insight.actionLabel ?? "Take action"}</span>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            <MessageCircleQuestion className="size-4" />
            Ask a follow-up
            {!!insight.replyCount && <span className="text-muted-foreground">({insight.replyCount})</span>}
          </Button>
          {resolved ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setStatus.mutate({ id: insight.id, status: "new" })}
              disabled={setStatus.isPending}
            >
              <Undo2 className="size-4" /> Reopen
            </Button>
          ) : compact ? null : (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStatus.mutate({ id: insight.id, status: "done" })}
                disabled={setStatus.isPending}
              >
                <Check className="size-4" /> Mark done
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStatus.mutate({ id: insight.id, status: "dismissed" })}
                disabled={setStatus.isPending}
              >
                <X className="size-4" /> Dismiss
              </Button>
            </>
          )}
          <ChevronDown
            className={`ml-auto size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 border-t border-border pt-3">
                {replies.isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}

                {replies.data?.map((m) => (
                  <div
                    key={m.id}
                    className={
                      m.role === "user"
                        ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-3 py-2 text-sm"
                        : "max-w-[92%] rounded-2xl rounded-bl-sm bg-surface px-3 py-2"
                    }
                  >
                    {m.role === "user" ? (
                      m.content
                    ) : (
                      <Markdown content={humanizeMath(m.content)} className="text-sm text-muted-foreground" />
                    )}
                  </div>
                ))}

                {busy && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Thinking about your numbers…
                  </div>
                )}
                {ask.isError && (
                  <p className="text-xs text-destructive">
                    {ask.error instanceof Error ? ask.error.message : "That didn't go through. Try again."}
                  </p>
                )}

                {!replies.data?.length && !busy && (
                  <div className="flex flex-wrap gap-2">
                    {PROMPTS.map((p) => (
                      <button
                        key={p}
                        onClick={() => submit(p)}
                        className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit(question);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask about this insight…"
                    maxLength={500}
                    className="h-9 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
                  />
                  <Button type="submit" size="icon-sm" disabled={busy || !question.trim()}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <CornerDownLeft className="size-4" />}
                  </Button>
                </form>
                <p className="text-[11px] text-muted-foreground">
                  Follow-ups stay scoped to this insight and your own study data.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
    </Shell>
  );
}
