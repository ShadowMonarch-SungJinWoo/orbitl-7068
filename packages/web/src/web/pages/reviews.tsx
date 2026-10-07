import { useMemo, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, MessageSquareHeart, Pencil, PenLine, ThumbsUp, Trash2 } from "lucide-react";
import { authClient } from "../lib/auth";
import { Logo } from "../components/logo";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Input, Textarea } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { Skeleton } from "../components/ui/skeleton";
import { PageHeader, EmptyState } from "../components/ui/page-header";
import { Stars, StarPicker } from "../components/ui/stars";
import { Confetti } from "../components/confetti";
import { ReportButton } from "../components/report-button";
import { useToast } from "../components/toast";
import { fmtDate } from "../lib/format";
import { cn } from "@/lib/utils";
import {
  useCreateReview,
  useDeleteReview,
  useReviews,
  useUpdateReview,
  useVoteReview,
  type ReviewCategory,
  type ReviewSort,
} from "../queries/reviews";

const CATEGORIES: { value: ReviewCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "graph", label: "Knowledge Graph" },
  { value: "tutor", label: "AI Tutor" },
  { value: "focus", label: "Focus Mode" },
  { value: "gamification", label: "Gamification" },
  { value: "bug", label: "Bug report" },
  { value: "idea", label: "Feature idea" },
];

const SORTS: { value: ReviewSort; label: string }[] = [
  { value: "top", label: "Top rated" },
  { value: "recent", label: "Most recent" },
  { value: "rating", label: "Highest rating" },
];

const catLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

type Editing = { id: string; rating: number; title: string; body: string; role: string; category: ReviewCategory };

export default function ReviewsPage() {
  const { data: session } = authClient.useSession();
  const authed = !!session?.user;
  const { toast } = useToast();

  const [sort, setSort] = useState<ReviewSort>("top");
  const [category, setCategory] = useState<ReviewCategory | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [role, setRole] = useState("");
  const [cat, setCat] = useState<ReviewCategory>("general");
  const [burst, setBurst] = useState(0);

  const list = useReviews({ sort, category });
  const create = useCreateReview();
  const update = useUpdateReview();
  const remove = useDeleteReview();
  const vote = useVoteReview();

  const summary = list.data?.summary;
  const items = list.data?.items ?? [];
  const maxCount = useMemo(
    () => Math.max(1, ...(summary?.distribution.map((d) => d.count) ?? [1])),
    [summary],
  );

  const reset = () => {
    setEditing(null);
    setRating(5);
    setTitle("");
    setBody("");
    setRole("");
    setCat("general");
  };

  const startWrite = () => {
    reset();
    setOpen(true);
  };

  const startEdit = (r: (typeof items)[number]) => {
    setEditing({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      role: r.role ?? "",
      category: r.category as ReviewCategory,
    });
    setRating(r.rating);
    setTitle(r.title);
    setBody(r.body);
    setRole(r.role ?? "");
    setCat(r.category as ReviewCategory);
    setOpen(true);
  };

  const valid = title.trim().length >= 3 && body.trim().length >= 10;
  const busy = create.isPending || update.isPending;

  const submit = () => {
    if (!valid) return;
    const payload = { rating, title: title.trim(), body: body.trim(), role: role.trim() || null, category: cat };
    if (editing) {
      update.mutate(
        { id: editing.id, ...payload },
        {
          onSuccess: () => {
            setOpen(false);
            reset();
            toast({ kind: "success", title: "Review updated" });
          },
          onError: (e) => toast({ kind: "error", title: "Could not update", description: e.message }),
        },
      );
      return;
    }
    create.mutate(payload, {
      onSuccess: (res) => {
        setOpen(false);
        reset();
        setBurst(Date.now());
        toast({
          kind: "success",
          title: "Thanks for the review!",
          description: `+30 XP · level ${res.award.level}${res.award.leveledUp ? " — level up!" : ""}`,
        });
      },
      onError: (e) => toast({ kind: "error", title: "Could not post review", description: e.message }),
    });
  };

  const onVote = (id: string) => {
    if (!authed) {
      toast({ kind: "info", title: "Sign in to vote", description: "Create a free account to mark reviews helpful." });
      return;
    }
    vote.mutate({ id });
  };

  const content = (
    <>
      <Confetti trigger={burst} />

      <PageHeader
        title="Reviews"
        subtitle="What students say about OrbitL — and your chance to shape what we build next."
        icon={MessageSquareHeart}
        action={
          authed ? (
            <Button onClick={startWrite} className="rounded-xl">
              <PenLine className="size-4" /> Write a review
            </Button>
          ) : (
            <Link to="/login">
              <Button className="rounded-xl">Sign in to review</Button>
            </Link>
          )
        }
      />

      {/* Summary */}
      <Card className="mb-6 grid gap-8 p-6 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="text-center sm:pr-8 sm:text-left">
          <p className="text-5xl font-bold tracking-tight">{(summary?.average ?? 0).toFixed(1)}</p>
          <Stars value={summary?.average ?? 0} size={18} className="mt-2" />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {summary?.total ?? 0} review{summary?.total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="space-y-1.5">
          {(summary?.distribution ?? []).map((d) => (
            <div key={d.stars} className="flex items-center gap-3">
              <span className="w-8 shrink-0 text-xs text-muted-foreground">{d.stars}★</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-warning"
                  initial={{ width: 0 }}
                  animate={{ width: `${(d.count / maxCount) * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{d.count}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-border bg-surface p-1">
          {SORTS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSort(s.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                sort === s.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategory(null)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors",
              category === null
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(category === c.value ? null : c.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                category === c.value
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {list.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={MessageSquareHeart}
          title="No reviews here yet"
          description="Nothing matches this filter. Be the first to share your experience."
          action={authed ? <Button onClick={startWrite} className="rounded-xl">Write a review</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <AnimatePresence initial={false}>
            {items.map((r, i) => (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.04 }}
              >
                <Card className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                        {r.userName.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {r.userName}
                          {r.mine && <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.role ? `${r.role} · ` : ""}
                          {fmtDate(r.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="muted">{catLabel(r.category)}</Badge>
                  </div>

                  <Stars value={r.rating} size={15} className="mt-4" />
                  <h3 className="mt-2 text-sm font-semibold">{r.title}</h3>
                  <p className="mt-1.5 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {r.body}
                  </p>

                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <button
                      onClick={() => onVote(r.id)}
                      disabled={vote.isPending}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                        r.votedByMe
                          ? "border-primary/50 bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <ThumbsUp className={cn("size-3.5", r.votedByMe && "fill-current")} />
                      Helpful · {r.helpful}
                    </button>
                    {!r.mine && <ReportButton targetType="review" targetId={r.id} label="Report" />}
                    {r.mine && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => startEdit(r)} aria-label="Edit review">
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Delete review"
                          onClick={() =>
                            remove.mutate(
                              { id: r.id },
                              { onSuccess: () => toast({ kind: "success", title: "Review deleted" }) },
                            )
                          }
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Write / edit modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit your review" : "Write a review"}
        description={editing ? undefined : "Honest feedback helps us build the right things. You'll earn 30 XP."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!valid || busy} className="rounded-xl">
              {busy ? "Saving…" : editing ? "Save changes" : "Post review"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Your rating</label>
            <StarPicker value={rating} onChange={setRating} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Headline</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sum it up in a sentence" maxLength={120} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Your review</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What worked, what didn't, what changed for you?"
              className="min-h-32"
              maxLength={2000}
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">{body.trim().length}/2000</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">What it's about</label>
              <select
                value={cat}
                onChange={(e) => setCat(e.target.value as ReviewCategory)}
                className="flex h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Your role (optional)</label>
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="CS sophomore" maxLength={80} />
            </div>
          </div>
        </div>
      </Modal>
    </>
  );

  if (authed) return <div>{content}</div>;

  // Public shell for signed-out visitors
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="text-base font-bold tracking-tight">OrbitL</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="ghost" size="sm"><ArrowLeft className="size-4" /> Home</Button>
            </Link>
            <Link to="/login">
              <Button size="sm" className="rounded-xl">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-5 py-10">{content}</main>
    </div>
  );
}
