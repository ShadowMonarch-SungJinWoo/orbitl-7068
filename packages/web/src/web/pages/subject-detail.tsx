import { useState } from "react";
import { Link, useParams } from "wouter";
import { motion } from "motion/react";
import { ArrowLeft, Plus, Loader2, Network, ChevronRight, Trash2, Sparkles } from "lucide-react";
import { useSubject } from "../queries/subjects";
import { useCreateTopic, useDeleteTopic } from "../queries/topics";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { ProgressRing } from "../components/ui/progress-ring";
import { Skeleton } from "../components/ui/skeleton";
import { Badge } from "../components/ui/badge";
import { masteryTone } from "../lib/format";
import { useToast } from "../components/toast";

export default function SubjectDetailPage() {
  const { id = "" } = useParams();
  const { data, isLoading } = useSubject(id);
  const create = useCreateTopic();
  const del = useDeleteTopic();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | undefined>(undefined);

  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      { subjectId: id, name: name.trim(), parentId },
      {
        onSuccess: () => {
          toast({ kind: "success", title: "Concept added", description: name });
          setName("");
          setParentId(undefined);
          setOpen(false);
        },
      },
    );
  };

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const roots = data.topics.filter((t) => !t.parentId);
  const childrenOf = (pid: string) => data.topics.filter((t) => t.parentId === pid);
  const avg = data.topics.length ? Math.round(data.topics.reduce((a, b) => a + b.mastery, 0) / data.topics.length) : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/subjects" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All subjects
      </Link>

      <Card className="mb-6 overflow-hidden">
        <div className="h-1.5" style={{ background: data.color }} />
        <CardContent className="flex flex-wrap items-center gap-6 p-6">
          <div className="grid size-14 place-items-center rounded-2xl" style={{ background: `${data.color}22`, color: data.color }}>
            <Network className="size-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{data.name}</h1>
            <p className="text-sm text-muted-foreground">{data.topics.length} concepts · {avg}% average mastery</p>
          </div>
          <ProgressRing value={avg} size={72} stroke={7} color={data.color} />
          <div className="flex gap-2">
            <Link to="/graph"><Button variant="outline"><Sparkles className="size-4" /> View in graph</Button></Link>
            <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Add concept</Button>
          </div>
        </CardContent>
      </Card>

      {roots.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">No concepts yet. Add your first one.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {roots.map((t, i) => {
            const kids = childrenOf(t.id);
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card>
                  <CardContent className="p-4">
                    <TopicRow topic={t} onDelete={() => del.mutate({ id: t.id })} onAddChild={() => { setParentId(t.id); setOpen(true); }} />
                    {kids.length > 0 && (
                      <div className="mt-2 space-y-1.5 border-l border-border pl-4">
                        {kids.map((c) => (
                          <TopicRow key={c.id} topic={c} child onDelete={() => del.mutate({ id: c.id })} />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => { setOpen(false); setParentId(undefined); }}
        title={parentId ? "Add sub-concept" : "Add concept"}
        description="Concepts become nodes in your knowledge graph."
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false); setParentId(undefined); }}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending || !name.trim()}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />} Add
            </Button>
          </>
        }
      >
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Newton's Laws" onKeyDown={(e) => e.key === "Enter" && submit()} />
      </Modal>
    </div>
  );
}

function TopicRow({
  topic,
  child,
  onDelete,
  onAddChild,
}: {
  topic: { id: string; name: string; mastery: number; revisionStatus: string };
  child?: boolean;
  onDelete: () => void;
  onAddChild?: () => void;
}) {
  const tone = masteryTone(topic.mastery);
  return (
    <div className="group flex items-center gap-3">
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      <Link to={`/graph?topic=${topic.id}`} className={`flex-1 truncate font-medium hover:text-primary ${child ? "text-sm" : ""}`}>
        {topic.name}
      </Link>
      <Badge variant={topic.revisionStatus === "revised" ? "success" : topic.revisionStatus === "in_progress" ? "warning" : "muted"}>
        {topic.revisionStatus.replace("_", " ")}
      </Badge>
      <div className="hidden w-32 items-center gap-2 sm:flex">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-destructive"}`} style={{ width: `${topic.mastery}%` }} />
        </div>
        <span className="w-9 text-right text-xs font-semibold tabular-nums">{topic.mastery}%</span>
      </div>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {onAddChild && (
          <button onClick={onAddChild} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" title="Add sub-concept">
            <Plus className="size-4" />
          </button>
        )}
        <button onClick={onDelete} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive" title="Delete">
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
