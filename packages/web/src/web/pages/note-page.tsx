import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Loader2,
  Trash2,
  Save,
  Eye,
  Pencil,
  MessageSquare,
  Send,
  Sigma,
  Check,
  StickyNote,
} from "lucide-react";
import { useNote, useUpdateNote, useDeleteNote, useAddComment } from "../queries/notes";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { Markdown, markdownToHtml } from "../components/ui/markdown";
import { NoteHtml } from "../components/ui/note-html";
import { ReportButton } from "../components/report-button";
import { fmtDate } from "../lib/format";
import { useToast } from "../components/toast";

const RichTextEditor = lazy(() =>
  import("../components/ui/rich-text-editor").then((m) => ({ default: m.RichTextEditor })),
);

/** Words are what a writer counts, so the footer counts them the way a word processor does. */
function stats(text: string) {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return { words, chars: trimmed.length, minutes: Math.max(1, Math.round(words / 200)) };
}

/**
 * A note gets its own page — a full-width document surface rather than a pane in a
 * list — so long-form writing has the room a word processor gives it. Saves happen
 * automatically a couple of seconds after typing stops, and the header always shows
 * whether the current text is on the server.
 */
export default function NotePage() {
  const params = useParams<{ id: string }>();
  const id = params.id!;
  const [, navigate] = useLocation();
  const { data, isLoading, isError } = useNote(id);
  const update = useUpdateNote();
  const del = useDeleteNote();
  const addComment = useAddComment();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  const [legacy, setLegacy] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [comment, setComment] = useState("");
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const loaded = useRef<string | null>(null);
  // Held in a ref so the autosave timer always writes the newest text, not the
  // text as it was when the timer was scheduled.
  const latest = useRef({ title: "", html: "" });

  useEffect(() => {
    if (!data || loaded.current === data.id) return;
    const isMarkdown = data.format !== "html";
    const initialHtml = isMarkdown ? markdownToHtml(data.content) : data.content;
    setTitle(data.title);
    setHtml(initialHtml);
    setText(data.contentText || "");
    setLegacy(isMarkdown && !!data.content.trim());
    latest.current = { title: data.title, html: initialHtml };
    loaded.current = data.id;
    setDirty(false);
  }, [data]);

  const persist = (opts: { silent?: boolean } = {}) => {
    update.mutate(
      { id, title: latest.current.title, content: latest.current.html, format: "html" },
      {
        onSuccess: () => {
          setDirty(false);
          setLegacy(false);
          setSavedAt(new Date());
          if (!opts.silent) toast({ kind: "success", title: "Saved" });
        },
        onError: (e) => toast({ kind: "error", title: "Could not save", description: e.message }),
      },
    );
  };

  // Autosave: quiet, debounced, and skipped while a save is already in flight.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      if (!update.isPending) persist({ silent: true });
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, title, html]);

  // Ctrl/Cmd+S is the reflex of anyone writing a long document.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty || legacy) persist();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, legacy]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[70vh] w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-4xl py-20 text-center">
        <StickyNote className="mx-auto size-10 text-muted-foreground" />
        <p className="mt-4 text-base font-semibold">This note could not be opened</p>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted.</p>
        <Link to="/notes">
          <Button variant="outline" className="mt-5 rounded-xl">
            <ArrowLeft className="size-4" /> Back to notes
          </Button>
        </Link>
      </div>
    );
  }

  const s = stats(text || html.replace(/<[^>]+>/g, " "));
  const status = update.isPending
    ? "Saving…"
    : dirty || legacy
      ? "Unsaved changes"
      : savedAt
        ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : `Last edited ${fmtDate(data.updatedAt)}`;

  return (
    <div className="mx-auto max-w-5xl pb-16">
      {/* Document chrome — stays put while the page scrolls. */}
      <div className="sticky top-0 z-20 -mx-4 mb-6 flex flex-wrap items-center gap-2 border-b border-border bg-bg/85 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <Link to="/notes">
          <Button variant="ghost" size="sm" className="rounded-xl">
            <ArrowLeft className="size-4" /> Notes
          </Button>
        </Link>
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          {update.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : !dirty && !legacy ? (
            <Check className="size-3 text-success" />
          ) : null}
          {status}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-surface p-1">
            <button
              onClick={() => setMode("edit")}
              className={`rounded-md p-1.5 ${mode === "edit" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
              title="Write"
            >
              <Pencil className="size-4" />
            </button>
            <button
              onClick={() => setMode("preview")}
              className={`rounded-md p-1.5 ${mode === "preview" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
              title="Read"
            >
              <Eye className="size-4" />
            </button>
          </div>
          <Button size="sm" onClick={() => persist()} disabled={update.isPending || (!dirty && !legacy)}>
            {update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
          </Button>
          <button
            onClick={() => {
              if (!confirm("Delete this note? This cannot be undone.")) return;
              del.mutate({ id }, { onSuccess: () => navigate("/notes") });
            }}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            title="Delete note"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {legacy && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-xs text-warning">
          <Sigma className="size-3.5" />
          Converted from markdown to rich text — save to keep the formatted version.
        </div>
      )}

      {/* The page itself. Paper-like surface, generous margins, comfortable measure. */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-2xl border border-border bg-card shadow-soft"
      >
        <div className="px-6 pt-10 sm:px-14 lg:px-20">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              latest.current = { ...latest.current, title: e.target.value };
              setDirty(true);
            }}
            placeholder="Untitled note"
            className="h-auto border-0 bg-transparent px-0 text-3xl font-bold leading-tight tracking-tight shadow-none focus-visible:ring-0 sm:text-4xl"
          />
          <div className="mt-3 h-px bg-border" />
        </div>

        <div className="min-h-[65vh] px-6 py-8 sm:px-14 lg:px-20">
          {mode === "edit" ? (
            <Suspense fallback={<Skeleton className="h-[60vh]" />}>
              <RichTextEditor
                value={html}
                onChange={(nextHtml, nextText) => {
                  setHtml(nextHtml);
                  setText(nextText);
                  latest.current = { ...latest.current, html: nextHtml };
                  setDirty(true);
                }}
              />
            </Suspense>
          ) : text.trim() || html.replace(/<[^>]+>/g, "").trim() ? (
            data.format === "html" || dirty || legacy ? <NoteHtml html={html} /> : <Markdown content={data.content} />
          ) : (
            <p className="text-sm text-muted-foreground">This note is empty. Switch to Write and start typing.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-border px-6 py-3 text-xs text-muted-foreground sm:px-14 lg:px-20">
          <span>{s.words.toLocaleString()} words</span>
          <span>{s.chars.toLocaleString()} characters</span>
          <span>{s.minutes} min read</span>
          <span className="ml-auto sm:hidden">{status}</span>
        </div>
      </motion.div>

      {/* Comments live below the document, the way margin notes follow a page. */}
      <div className="mt-8 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <MessageSquare className="size-4 text-muted-foreground" /> Comments
          {data.comments.length > 0 && <span className="text-muted-foreground">({data.comments.length})</span>}
        </div>
        <div className="space-y-2">
          {data.comments.length === 0 && (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          )}
          {data.comments.map((c) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">{c.userName}</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] text-muted-foreground">{fmtDate(c.createdAt)}</p>
                  <ReportButton targetType="note_comment" targetId={c.id} />
                </div>
              </div>
              <p className="mt-1 text-sm">{c.body}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && comment.trim()) {
                addComment.mutate({ noteId: id, body: comment.trim() });
                setComment("");
              }
            }}
          />
          <Button
            size="icon"
            disabled={!comment.trim() || addComment.isPending}
            onClick={() => {
              addComment.mutate({ noteId: id, body: comment.trim() });
              setComment("");
            }}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
