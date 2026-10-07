import { useState } from "react";
import { Link } from "wouter";
import { motion } from "motion/react";
import { BookOpen, Plus, Loader2, MoreVertical, Trash2 } from "lucide-react";
import { useSubjects, useCreateSubject, useDeleteSubject } from "../queries/subjects";
import { PageHeader, EmptyState } from "../components/ui/page-header";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { Skeleton } from "../components/ui/skeleton";
import { useToast } from "../components/toast";

const COLORS = ["#2563EB", "#4F46E5", "#06B6D4", "#22C55E", "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6"];

export default function SubjectsPage() {
  const { data, isLoading } = useSubjects();
  const create = useCreateSubject();
  const del = useDeleteSubject();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [menu, setMenu] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), color },
      {
        onSuccess: () => {
          toast({ kind: "success", title: "Subject created", description: name });
          setName("");
          setColor(COLORS[0]);
          setOpen(false);
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Subjects"
        subtitle="Organize your studies by subject."
        icon={BookOpen}
        action={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> New subject</Button>}
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : data && data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s, i) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="group relative overflow-hidden transition-all hover:-translate-y-0.5 hover:border-ring/40">
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: s.color }} />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="grid size-11 place-items-center rounded-xl" style={{ background: `${s.color}22`, color: s.color }}>
                      <BookOpen className="size-5" />
                    </div>
                    <div className="relative">
                      <button onClick={() => setMenu(menu === s.id ? null : s.id)} className="rounded-lg p-1.5 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100">
                        <MoreVertical className="size-4" />
                      </button>
                      {menu === s.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
                          <div className="absolute right-0 top-8 z-20 w-36 rounded-xl border border-border bg-card p-1 shadow-soft">
                            <button
                              onClick={() => { del.mutate({ id: s.id }); setMenu(null); }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-destructive hover:bg-muted"
                            >
                              <Trash2 className="size-4" /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <Link to={`/subjects/${s.id}`}>
                    <h3 className="mt-3 text-lg font-semibold">{s.name}</h3>
                    <p className="text-sm text-muted-foreground">{s.topicCount} concepts</p>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${s.mastery}%`, background: s.color }} />
                      </div>
                      <span className="ml-3 text-sm font-semibold tabular-nums">{s.mastery}%</span>
                    </div>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="No subjects yet"
          description="Create your first subject to start building your knowledge graph."
          action={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> New subject</Button>}
        />
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New subject"
        description="Give it a name and a color."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending || !name.trim()}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />} Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Organic Chemistry" onKeyDown={(e) => e.key === "Enter" && submit()} />
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Color</p>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`size-8 rounded-lg transition-transform ${color === c ? "scale-110 ring-2 ring-offset-2 ring-offset-card" : ""}`}
                  style={{ background: c, boxShadow: color === c ? `0 0 0 2px ${c}` : undefined }}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
