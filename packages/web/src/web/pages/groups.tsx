import { useState } from "react";
import { Link } from "wouter";
import { motion } from "motion/react";
import { Users, Plus, LogIn, Loader2, ArrowRight, Link as LinkIcon } from "lucide-react";
import { useGroups, useCreateGroup, useJoinGroup } from "../queries/groups";
import { PageHeader, EmptyState } from "../components/ui/page-header";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Textarea } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { useToast } from "../components/toast";

export default function GroupsPage() {
  const { data, isLoading } = useGroups();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Study Groups"
        subtitle="Share notes, ask questions, keep each other accountable."
        icon={Users}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setJoinOpen(true)}>
              <LogIn className="size-4" /> Join
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> New group
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No groups yet"
          description="Create a group for your class, or join one with an invite code."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Create a group
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((g, i) => (
            <motion.div key={g.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="group h-full transition-colors hover:border-primary/40">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: g.color ?? "#4F46E5" }}>
                      {g.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold leading-tight">{g.name}</p>
                      <p className="text-xs text-muted-foreground">{g.memberCount} member{g.memberCount === 1 ? "" : "s"}</p>
                    </div>
                  </div>
                  {g.description && <p className="line-clamp-2 text-sm text-muted-foreground">{g.description}</p>}
                  <div className="mt-auto flex items-center justify-between">
                    <button
                      title="Copy invite link"
                      onClick={() => {
                        const url = `${window.location.origin}/join/${g.inviteCode}`;
                        navigator.clipboard?.writeText(url);
                        toast({ kind: "success", title: "Invite link copied", description: url });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                    >
                      <LinkIcon className="size-3" /> {g.inviteCode}
                    </button>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`/groups/${g.id}`}>
                        Open <ArrowRight className="size-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinModal open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}

const COLORS = ["#4F46E5", "#2563EB", "#06B6D4", "#22C55E", "#F59E0B", "#EF4444"];

function CreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateGroup();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), description: description.trim() || undefined, color },
      {
        onSuccess: (g) => {
          toast({ kind: "success", title: "Group created", description: `Invite code: ${g?.inviteCode}` });
          setName("");
          setDescription("");
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New study group"
      description="You'll get an invite code to share with classmates."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || !name.trim()}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />} Create
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" autoFocus />
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this group for? (optional)" />
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Color</p>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                className={`size-7 rounded-full transition ${color === c ? "ring-2 ring-ring ring-offset-2 ring-offset-card" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function JoinModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const join = useJoinGroup();
  const { toast } = useToast();
  const [code, setCode] = useState("");

  const submit = () => {
    if (!code.trim()) return;
    join.mutate(
      { code: code.trim() },
      {
        onSuccess: (g) => {
          toast({ kind: "success", title: `Joined ${g?.name}` });
          setCode("");
          onClose();
        },
        onError: (e) => toast({ kind: "error", title: "Could not join", description: e.message }),
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Join a group"
      description="Enter the 6-character invite code."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={join.isPending || !code.trim()}>
            {join.isPending && <Loader2 className="size-4 animate-spin" />} Join
          </Button>
        </>
      }
    >
      <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. 7KQ2ZP" className="uppercase tracking-widest" autoFocus />
      <Badge variant="muted" className="mt-3">
        Codes are case-insensitive
      </Badge>
    </Modal>
  );
}
