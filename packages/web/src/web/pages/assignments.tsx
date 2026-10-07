import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { CalendarClock, Plus, Trash2, Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import { useAssignments, useCreateAssignment, useUpdateAssignment, useDeleteAssignment } from "../queries/assignments";
import { useSubjects } from "../queries/subjects";
import { PageHeader, EmptyState } from "../components/ui/page-header";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Textarea } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { SubjectSelect } from "../components/topic-picker";
import { useToast } from "../components/toast";
import { relativeDue, fmtDate } from "../lib/format";

type Status = "todo" | "in_progress" | "done";
type Assignment = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | string | null;
  subjectId: string | null;
};

const COLUMNS: { key: Status; label: string; tint: string }[] = [
  { key: "todo", label: "To do", tint: "bg-muted text-muted-foreground" },
  { key: "in_progress", label: "In progress", tint: "bg-warning/15 text-warning" },
  { key: "done", label: "Done", tint: "bg-success/15 text-success" },
];

const PRIORITY: Record<string, "destructive" | "warning" | "muted"> = {
  high: "destructive",
  medium: "warning",
  low: "muted",
};

export default function AssignmentsPage() {
  const { data, isLoading } = useAssignments();
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const g: Record<Status, Assignment[]> = { todo: [], in_progress: [], done: [] };
    (data ?? []).forEach((a) => {
      const k = (["todo", "in_progress", "done"].includes(a.status) ? a.status : "todo") as Status;
      g[k].push(a as Assignment);
    });
    (Object.keys(g) as Status[]).forEach((k) =>
      g[k].sort((a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity)),
    );
    return g;
  }, [data]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Assignments"
        subtitle="Deadlines, priorities and progress in one board."
        icon={CalendarClock}
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New assignment
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing on the board"
          description="Add your assignments and OrbitL will keep the deadlines in view."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Add assignment
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.key} className="rounded-2xl border border-border bg-surface/50 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${col.tint}`}>{col.label}</span>
                <span className="text-xs text-muted-foreground">{grouped[col.key].length}</span>
              </div>
              <div className="space-y-2.5">
                {grouped[col.key].map((a, i) => (
                  <motion.div key={a.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <AssignmentCard a={a} status={col.key} />
                  </motion.div>
                ))}
                {grouped[col.key].length === 0 && (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">Empty</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function AssignmentCard({ a, status }: { a: Assignment; status: Status }) {
  const update = useUpdateAssignment();
  const del = useDeleteAssignment();
  const { toast } = useToast();
  const due = relativeDue(a.dueDate);
  const order: Status[] = ["todo", "in_progress", "done"];
  const idx = order.indexOf(status);

  const move = (dir: -1 | 1) => {
    const next = order[idx + dir];
    if (!next) return;
    update.mutate(
      { id: a.id, status: next },
      {
        onSuccess: (r) => {
          if (next === "done") toast({ kind: "success", title: "Nice work", description: `+30 XP${r?.award?.leveledUp ? ` · Level ${r.award.level}!` : ""}` });
        },
      },
    );
  };

  return (
    <Card className="group">
      <CardContent className="space-y-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-semibold leading-snug ${status === "done" ? "text-muted-foreground line-through" : ""}`}>{a.title}</p>
          <button
            onClick={() => del.mutate({ id: a.id })}
            aria-label="Delete assignment"
            className="rounded-lg p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        {a.description && <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{a.description}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={PRIORITY[a.priority] ?? "muted"}>{a.priority}</Badge>
          {status !== "done" ? (
            <Badge variant={due.tone === "muted" ? "muted" : due.tone === "warning" ? "warning" : "destructive"}>{due.label}</Badge>
          ) : (
            <Badge variant="success">Completed</Badge>
          )}
          {a.dueDate && <span className="text-[11px] text-muted-foreground">{fmtDate(a.dueDate)}</span>}
        </div>
        <div className="flex gap-1.5 pt-0.5">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={idx === 0 || update.isPending} onClick={() => move(-1)}>
            <ChevronLeft className="size-3.5" /> Back
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={idx === 2 || update.isPending} onClick={() => move(1)}>
            Advance <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateAssignment();
  const { data: subjects } = useSubjects();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [due, setDue] = useState("");

  const submit = () => {
    if (!title.trim()) return;
    create.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        subjectId: subjectId || undefined,
        priority,
        dueDate: due ? new Date(due).getTime() : undefined,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setDue("");
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New assignment"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || !title.trim()}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />} Create
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Assignment title" autoFocus />
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details (optional)" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Subject</p>
            <SubjectSelect value={subjectId} onChange={setSubjectId} options={(subjects ?? []).map((s) => ({ id: s.id, name: s.name }))} />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Priority</p>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
              className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Due date</p>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
