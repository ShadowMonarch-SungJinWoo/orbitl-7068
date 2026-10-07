import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { motion } from "motion/react";
import { StickyNote, Plus, Loader2, UploadCloud, FileText } from "lucide-react";
import { useNotes, useCreateNote } from "../queries/notes";
import { PageHeader, EmptyState } from "../components/ui/page-header";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { fmtDate } from "../lib/format";
import { useToast } from "../components/toast";
import { UploadModal } from "../components/upload-modal";

/**
 * The notes index is a library of documents. Opening one — or creating one —
 * navigates to its own full page, so writing always happens on a real page
 * rather than in a cramped pane beside the list.
 */
export default function NotesPage() {
  const { data, isLoading } = useNotes();
  const create = useCreateNote();
  const { toast } = useToast();
  const search = useSearch();
  const [, navigate] = useLocation();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [q, setQ] = useState("");

  // Older links pointed at /notes?id=… — honour them by redirecting to the page.
  useEffect(() => {
    const id = new URLSearchParams(search).get("id");
    if (id) navigate(`/notes/${id}`, { replace: true });
  }, [search, navigate]);

  const newNote = () => {
    create.mutate(
      { title: "Untitled note", content: "", format: "html" },
      {
        onSuccess: (n) => {
          toast({ kind: "success", title: "New page created" });
          navigate(`/notes/${n.id}`);
        },
        onError: (e) => toast({ kind: "error", title: "Could not create note", description: e.message }),
      },
    );
  };

  const needle = q.trim().toLowerCase();
  const notes = (data ?? []).filter(
    (n) =>
      !needle ||
      n.title.toLowerCase().includes(needle) ||
      (n.contentText || n.content).toLowerCase().includes(needle),
  );

  const preview = (n: (typeof notes)[number]) =>
    (n.contentText || n.content.replace(/<[^>]+>/g, " ").replace(/[#*>`-]/g, ""))
      .replace(/\s+/g, " ")
      .trim();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Notes"
        subtitle="Full-page documents with headings, tables and LaTeX formulas."
        icon={StickyNote}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setUploadOpen(true)}>
              <UploadCloud className="size-4" /> Upload file
            </Button>
            <Button onClick={newNote} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} New note
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="No notes yet"
          description="Create a page and write as long as you like — headings, tables and formulas included. Or upload a PDF and let OrbitL read it."
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setUploadOpen(true)}>
                <UploadCloud className="size-4" /> Upload file
              </Button>
              <Button onClick={newNote} disabled={create.isPending}>
                <Plus className="size-4" /> New note
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="mb-5 max-w-sm">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes…" />
          </div>

          {notes.length === 0 ? (
            <EmptyState icon={StickyNote} title="No matches" description="Nothing matches that search." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {notes.map((n, i) => (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.03 }}
                >
                  {/* Whole card is the link, so the page opens wherever you click. */}
                  <Link
                    to={`/notes/${n.id}`}
                    className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
                  >
                    <div className="mb-3 grid size-9 place-items-center rounded-xl bg-primary/12">
                      <FileText className="size-4 text-primary" />
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold">{n.title || "Untitled"}</p>
                    <p className="mt-1.5 line-clamp-4 flex-1 text-xs leading-relaxed text-muted-foreground">
                      {preview(n).slice(0, 220) || "Empty page"}
                    </p>
                    <p className="mt-3 text-[10px] text-muted-foreground">Edited {fmtDate(n.updatedAt)}</p>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}
