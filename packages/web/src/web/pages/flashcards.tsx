import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Layers, Sparkles, Loader2, Plus, Trash2, RotateCcw, Trophy, CalendarClock, CheckCircle2 } from "lucide-react";
import { useFlashcards, useDueFlashcards, useReviewFlashcard, useGenerateFlashcards, useCreateFlashcard, useDeleteFlashcard } from "../queries/flashcards";
import { useGraph } from "../queries/topics";
import { PageHeader, EmptyState } from "../components/ui/page-header";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Textarea } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { Confetti } from "../components/confetti";
import { useToast } from "../components/toast";
import { AiErrorNotice } from "../components/ai-error";

export default function FlashcardsPage() {
  const { data, isLoading } = useFlashcards();
  const { toast } = useToast();
  const [tab, setTab] = useState<"review" | "browse">("review");
  const [genOpen, setGenOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Flashcards"
        subtitle="Spaced repetition that decides when each card comes back."
        icon={Layers}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAddOpen(true)}><Plus className="size-4" /> New</Button>
            <Button onClick={() => setGenOpen(true)}><Sparkles className="size-4" /> Generate</Button>
          </div>
        }
      />

      <div className="mb-5 flex w-fit gap-1 rounded-xl bg-surface p-1">
        {(["review", "browse"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-1.5 text-sm font-medium capitalize ${tab === t ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>{t}</button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-80" />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Layers} title="No flashcards yet" description="Generate a deck from any concept, or add cards manually." action={<Button onClick={() => setGenOpen(true)}><Sparkles className="size-4" /> Generate cards</Button>} />
      ) : tab === "review" ? (
        <ReviewQueue />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => <BrowseCard key={c.id} card={c} />)}
        </div>
      )}

      <GenerateModal open={genOpen} onClose={() => setGenOpen(false)} onDone={(n) => toast({ kind: "success", title: `${n} cards generated` })} />
      <AddModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

type Card = { id: string; front: string; back: string; ease: number };
type Grade = "again" | "hard" | "good" | "easy";

const GRADE_BUTTONS: { grade: Grade; label: string; className: string }[] = [
  { grade: "again", label: "Again", className: "border-destructive/40 text-destructive hover:bg-destructive/10" },
  { grade: "hard", label: "Hard", className: "border-warning/40 text-warning hover:bg-warning/10" },
  { grade: "good", label: "Good", className: "border-primary/40 text-primary hover:bg-primary/10" },
  { grade: "easy", label: "Easy", className: "border-success/40 text-success hover:bg-success/10" },
];

function formatDue(date: string | Date) {
  const d = new Date(date);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days <= 0) return "later today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * The review tab only ever shows cards the scheduler says are owed. When the
 * queue is empty that's a finished state, not an empty state — it tells you
 * when the next card comes back instead of pretending you have nothing.
 */
function ReviewQueue() {
  const { data, isLoading } = useDueFlashcards();

  if (isLoading) return <Skeleton className="h-80" />;
  if (!data) return null;

  if (data.cards.length === 0) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <div className="grid size-16 place-items-center rounded-2xl bg-success/15">
            <CheckCircle2 className="size-8 text-success" />
          </div>
          <h3 className="text-xl font-bold">Nothing due right now</h3>
          <p className="text-sm text-muted-foreground">
            All {data.total} card{data.total === 1 ? "" : "s"} are scheduled ahead.
            {data.nextDueAt ? <> The next one comes back <span className="font-medium text-foreground">{formatDue(data.nextDueAt)}</span>.</> : null}
          </p>
          <p className="text-xs text-muted-foreground">Use the Browse tab to look through the deck any time.</p>
        </CardContent>
      </Card>
    );
  }

  return <ReviewMode cards={data.cards} dueCount={data.dueCount} total={data.total} />;
}

function ReviewMode({ cards, dueCount, total }: { cards: Card[]; dueCount: number; total: number }) {
  const review = useReviewFlashcard();
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [burst, setBurst] = useState(0);
  const [lastNext, setLastNext] = useState<string | null>(null);

  // Freeze the deck for the session — grading mutates `dueAt`, and a live
  // refetch would otherwise reshuffle the pile mid-review.
  const deck = useMemo(() => cards, []);
  const card = deck[i];
  const finished = i >= deck.length;

  const answer = (grade: Grade) => {
    if (!card) return;
    review.mutate(
      { id: card.id, grade },
      { onSuccess: (res) => setLastNext(res && "nextLabel" in res ? res.nextLabel ?? null : null) },
    );
    setDone((d) => d + 1);
    if (grade !== "again") setCorrect((c) => c + 1);
    setFlipped(false);
    setTimeout(() => setI((x) => x + 1), 180);
  };

  const restart = () => { setI(0); setFlipped(false); setDone(0); setCorrect(0); setLastNext(null); };

  if (finished) {
    const pct = done ? Math.round((correct / done) * 100) : 0;
    if (pct >= 80 && burst === 0) setBurst(Date.now());
    return (
      <>
        <Confetti trigger={burst} />
        <Card className="mx-auto max-w-md">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <div className="grid size-16 place-items-center rounded-2xl bg-success/15"><Trophy className="size-8 text-success" /></div>
            <h3 className="text-xl font-bold">Session complete!</h3>
            <p className="text-muted-foreground">You recalled <span className="font-semibold text-foreground">{correct}/{done}</span> ({pct}%). Each card is rescheduled by how well it went.</p>
            <p className="text-xs text-muted-foreground">{total} card{total === 1 ? "" : "s"} in the deck · lapses come back in about 10 minutes.</p>
            <Button variant="outline" onClick={restart}><RotateCcw className="size-4" /> Run through them again</Button>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>Card {i + 1} of {deck.length} due{dueCount > deck.length ? ` (of ${dueCount})` : ""}</span>
        <span className="flex items-center gap-3">
          {lastNext && <span className="flex items-center gap-1 text-xs"><CalendarClock className="size-3" /> back {lastNext}</span>}
          <span>{correct} recalled</span>
        </span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${(i / deck.length) * 100}%` }} />
      </div>

      <div className="[perspective:1600px]">
        <motion.div
          key={card.id}
          className="relative h-72 w-full cursor-pointer [transform-style:preserve-3d]"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          onClick={() => setFlipped((f) => !f)}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-8 text-center shadow-soft [backface-visibility:hidden]">
            <Badge variant="muted">Question</Badge>
            <p className="text-lg font-semibold">{card.front}</p>
            <p className="absolute bottom-4 text-xs text-muted-foreground">Click to flip</p>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-8 text-center shadow-soft [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <Badge variant="accent">Answer</Badge>
            <p className="text-base leading-relaxed">{card.back}</p>
          </div>
        </motion.div>
      </div>

      <AnimatePresence mode="wait">
        {flipped && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5">
            <p className="mb-2 text-center text-xs text-muted-foreground">How well did you recall it? This sets when the card returns.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRADE_BUTTONS.map((b) => (
                <Button key={b.grade} variant="outline" className={b.className} onClick={() => answer(b.grade)}>
                  {b.label}
                </Button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BrowseCard({ card }: { card: Card }) {
  const del = useDeleteFlashcard();
  const [show, setShow] = useState(false);
  return (
    <Card className="group relative">
      <CardContent className="p-4">
        <button onClick={() => del.mutate({ id: card.id })} className="absolute right-2 top-2 rounded-lg p-1.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
        <p className="pr-6 text-sm font-semibold">{card.front}</p>
        <button onClick={() => setShow((s) => !s)} className="mt-2 text-xs text-primary hover:underline">{show ? "Hide" : "Show"} answer</button>
        {show && <p className="mt-1.5 text-sm text-muted-foreground">{card.back}</p>}
      </CardContent>
    </Card>
  );
}

function TopicPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useGraph();
  const topics = (data?.nodes ?? []).filter((n) => n.type === "topic");
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <option value="">Select a concept…</option>
      {topics.map((t) => <option key={(t as any).topicId} value={(t as any).topicId}>{t.label}</option>)}
    </select>
  );
}

function GenerateModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (n: number) => void }) {
  const gen = useGenerateFlashcards();
  const [topicId, setTopicId] = useState("");
  const [count, setCount] = useState(6);
  const submit = () => {
    if (!topicId) return;
    gen.mutate({ topicId, count }, { onSuccess: (cards) => { onDone(cards.length); onClose(); setTopicId(""); } });
  };
  return (
    <Modal open={open} onClose={onClose} title="Generate flashcards" description="AI creates a deck for any concept." footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={gen.isPending || !topicId}>{gen.isPending ? <><Loader2 className="size-4 animate-spin" /> Generating…</> : <><Sparkles className="size-4" /> Generate</>}</Button>
      </>
    }>
      <div className="space-y-4">
        <div><p className="mb-1.5 text-xs font-medium text-muted-foreground">Concept</p><TopicPicker value={topicId} onChange={setTopicId} /></div>
        {gen.isError && <AiErrorNotice error={gen.error} onRetry={submit} retrying={gen.isPending} />}
        <div><p className="mb-1.5 text-xs font-medium text-muted-foreground">Number of cards: {count}</p><input type="range" min={1} max={60} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-primary" /></div>
      </div>
    </Modal>
  );
}

function AddModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateFlashcard();
  const [topicId, setTopicId] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const submit = () => {
    if (!front.trim() || !back.trim()) return;
    create.mutate({ front: front.trim(), back: back.trim(), topicId: topicId || undefined }, { onSuccess: () => { setFront(""); setBack(""); onClose(); } });
  };
  return (
    <Modal open={open} onClose={onClose} title="New flashcard" footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={create.isPending || !front.trim() || !back.trim()}>{create.isPending && <Loader2 className="size-4 animate-spin" />} Add</Button>
      </>
    }>
      <div className="space-y-3">
        <TopicPicker value={topicId} onChange={setTopicId} />
        <Input value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front (question)" />
        <Textarea value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back (answer)" />
      </div>
    </Modal>
  );
}
