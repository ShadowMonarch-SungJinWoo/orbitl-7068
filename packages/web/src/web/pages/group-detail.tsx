import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Send,
  Users,
  Copy,
  Share2,
  Loader2,
  LogOut,
  StickyNote,
  Link2 as LinkIcon,
  Settings,
  Trash2,
  UserMinus,
  RefreshCw,
  X,
} from "lucide-react";
import {
  useGroup,
  useGroupMessages,
  usePostMessage,
  useShareNote,
  useUnshareNote,
  useLeaveGroup,
  useUpdateGroup,
  useDeleteGroup,
  useRegenerateInvite,
  useRemoveMember,
} from "../queries/groups";
import { useNotes } from "../queries/notes";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Textarea } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { ReportButton } from "../components/report-button";
import { useToast } from "../components/toast";
import { authClient } from "../lib/auth";
import { fmtDate } from "../lib/format";

const COLORS = ["#4F46E5", "#2563EB", "#06B6D4", "#22C55E", "#F59E0B", "#EF4444"];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default function GroupDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const [, navigate] = useLocation();
  const { data, isLoading } = useGroup(id);
  const { data: messages } = useGroupMessages(id);
  const post = usePostMessage();
  const leave = useLeaveGroup();
  const unshare = useUnshareNote();
  const removeMember = useRemoveMember();
  const { data: session } = authClient.useSession();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!data?.group) {
    return (
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-muted-foreground">Group not found, or you're not a member.</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link to="/groups">Back to groups</Link>
        </Button>
      </div>
    );
  }

  const g = data.group;
  const me = session?.user?.id;
  const isOwner = data.isOwner;

  const send = () => {
    const text = body.trim();
    if (!text) return;
    setBody("");
    post.mutate(
      { groupId: id, body: text },
      { onError: (e) => toast({ kind: "error", title: "Message failed", description: e.message }) },
    );
  };

  const doLeave = () => {
    const warning = isOwner
      ? "You own this group. Leaving hands it to the longest-standing member, or deletes it if you're the last one. Continue?"
      : "Leave this group?";
    if (!confirm(warning)) return;
    leave.mutate(
      { id },
      {
        onSuccess: (r) => {
          toast({
            kind: "success",
            title: r?.deleted ? "Group deleted" : "You left the group",
          });
          navigate("/groups");
        },
        onError: (e) => toast({ kind: "error", title: "Could not leave", description: e.message }),
      },
    );
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="Back">
            <Link to="/groups">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div
            className="grid size-11 place-items-center rounded-2xl text-sm font-bold text-white"
            style={{ background: g.color ?? "#4F46E5" }}
          >
            {g.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">{g.name}</h1>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3" /> {data.members.length} member{data.members.length === 1 ? "" : "s"}
              {isOwner && " · you own this group"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const url = `${window.location.origin}/join/${g.inviteCode}`;
              navigator.clipboard?.writeText(url);
              toast({ kind: "success", title: "Invite link copied", description: url });
            }}
          >
            <LinkIcon className="size-3.5" /> Copy invite link
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard?.writeText(g.inviteCode);
              toast({ kind: "success", title: "Invite code copied", description: g.inviteCode });
            }}
          >
            <Copy className="size-3.5" /> {g.inviteCode}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 className="size-3.5" /> Share note
          </Button>
          {isOwner && (
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings className="size-3.5" /> Settings
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="flex h-[560px] flex-col overflow-hidden">
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {!messages || messages.length === 0 ? (
              <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
                No messages yet — say hi to your group.
              </div>
            ) : (
              messages.map((m) => {
                const mine = m.userId === me;
                const system = m.userName === "OrbitL";
                if (system) {
                  return (
                    <div key={m.id} className="flex justify-center">
                      <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">{m.body}</span>
                    </div>
                  );
                }
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm ${
                        mine ? "bg-primary text-primary-foreground" : "border border-border bg-surface"
                      }`}
                    >
                      {!mine && <p className="mb-0.5 text-[11px] font-semibold text-accent">{m.userName}</p>}
                      <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <p className={`text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {new Date(m.createdAt).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}
                        </p>
                        {!mine && <ReportButton targetType="group_message" targetId={m.id} />}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
            <div ref={endRef} />
          </div>
          <div className="flex gap-2 border-t border-border p-3">
            <Input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Message your group…"
            />
            <Button onClick={send} disabled={!body.trim() || post.isPending} aria-label="Send">
              {post.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <p className="mb-3 text-xs font-semibold text-muted-foreground">Shared notes</p>
              {data.sharedNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing shared yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.sharedNotes.map((n) => {
                    const canUnshare = n.userId === me || isOwner;
                    return (
                      <div key={n.id} className="flex items-start gap-1.5 rounded-xl bg-surface p-2.5 transition hover:bg-muted">
                        <Link to={`/notes/${n.id}`} className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                          <StickyNote className="mt-0.5 size-3.5 shrink-0 text-accent" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{n.title}</span>
                            <span className="text-[11px] text-muted-foreground">{fmtDate(n.updatedAt)}</span>
                          </span>
                        </Link>
                        {canUnshare && (
                          <button
                            aria-label={`Un-share ${n.title}`}
                            title="Un-share"
                            disabled={unshare.isPending}
                            onClick={() =>
                              unshare.mutate(
                                { noteId: n.id, groupId: id },
                                {
                                  onSuccess: () => toast({ kind: "success", title: "Note un-shared" }),
                                  onError: (e) =>
                                    toast({ kind: "error", title: "Could not un-share", description: e.message }),
                                },
                              )
                            }
                            className="rounded-lg p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="mb-3 text-xs font-semibold text-muted-foreground">Members</p>
              <div className="space-y-2.5">
                {data.members.map((m) => {
                  const mine = m.userId === me;
                  const name = mine ? "You" : (m.userName ?? `Member ${m.userId.slice(0, 6)}`);
                  return (
                    <div key={m.id} className="flex items-center gap-2">
                      <div className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                        {initials(name) || "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{name}</p>
                        {m.userEmail && !mine && (
                          <p className="truncate text-[11px] text-muted-foreground">{m.userEmail}</p>
                        )}
                      </div>
                      <Badge variant={m.role === "owner" ? "secondary" : "muted"}>{m.role}</Badge>
                      {isOwner && !mine && m.role !== "owner" && (
                        <button
                          aria-label={`Remove ${name}`}
                          title="Remove from group"
                          disabled={removeMember.isPending}
                          onClick={() => {
                            if (!confirm(`Remove ${name} from this group?`)) return;
                            removeMember.mutate(
                              { groupId: id, userId: m.userId },
                              {
                                onSuccess: () => toast({ kind: "success", title: `${name} removed` }),
                                onError: (e) =>
                                  toast({ kind: "error", title: "Could not remove", description: e.message }),
                              },
                            );
                          }}
                          className="rounded-lg p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >
                          <UserMinus className="size-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Button
            variant="outline"
            className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
            disabled={leave.isPending}
            onClick={doLeave}
          >
            {leave.isPending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />} Leave group
          </Button>
        </div>
      </div>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} groupId={id} sharedIds={data.sharedNotes.map((n) => n.id)} />
      {isOwner && (
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          group={{ id: g.id, name: g.name, description: g.description, color: g.color, inviteCode: g.inviteCode }}
          onDeleted={() => navigate("/groups")}
        />
      )}
    </div>
  );
}

function SettingsModal({
  open,
  onClose,
  group,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  group: { id: string; name: string; description: string | null; color: string; inviteCode: string };
  onDeleted: () => void;
}) {
  const update = useUpdateGroup();
  const regen = useRegenerateInvite();
  const del = useDeleteGroup();
  const { toast } = useToast();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [color, setColor] = useState(group.color);

  useEffect(() => {
    if (open) {
      setName(group.name);
      setDescription(group.description ?? "");
      setColor(group.color);
    }
  }, [open, group.name, group.description, group.color]);

  const save = () => {
    if (!name.trim()) return;
    update.mutate(
      { id: group.id, name: name.trim(), description: description.trim() || null, color },
      {
        onSuccess: () => {
          toast({ kind: "success", title: "Group updated" });
          onClose();
        },
        onError: (e) => toast({ kind: "error", title: "Could not save", description: e.message }),
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Group settings"
      description="Only you, the owner, can change these."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={update.isPending || !name.trim()}>
            {update.isPending && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this group for? (optional)"
        />
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

        <div className="rounded-xl border border-border p-3">
          <p className="text-xs font-semibold text-muted-foreground">Invite code</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <code className="rounded-lg bg-muted px-2 py-1 text-sm tracking-widest">{group.inviteCode}</code>
            <Button
              size="sm"
              variant="outline"
              disabled={regen.isPending}
              onClick={() => {
                if (!confirm("Generate a new code? Existing invite links stop working.")) return;
                regen.mutate(
                  { id: group.id },
                  {
                    onSuccess: (r) => toast({ kind: "success", title: "New invite code", description: r?.inviteCode }),
                    onError: (e) => toast({ kind: "error", title: "Could not regenerate", description: e.message }),
                  },
                );
              }}
            >
              {regen.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Regenerate
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs font-semibold text-destructive">Danger zone</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Deleting removes all messages and un-shares every note. This can't be undone.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 border-destructive/40 text-destructive hover:bg-destructive/10"
            disabled={del.isPending}
            onClick={() => {
              if (!confirm(`Permanently delete "${group.name}"?`)) return;
              del.mutate(
                { id: group.id },
                {
                  onSuccess: () => {
                    toast({ kind: "success", title: "Group deleted" });
                    onClose();
                    onDeleted();
                  },
                  onError: (e) => toast({ kind: "error", title: "Could not delete", description: e.message }),
                },
              );
            }}
          >
            {del.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Delete group
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ShareModal({
  open,
  onClose,
  groupId,
  sharedIds,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  sharedIds: string[];
}) {
  const { data: notes } = useNotes();
  const share = useShareNote();
  const { toast } = useToast();
  const [noteId, setNoteId] = useState("");

  const options = useMemo(() => (notes ?? []).filter((n) => !sharedIds.includes(n.id)), [notes, sharedIds]);

  const submit = () => {
    if (!noteId) return;
    share.mutate(
      { noteId, groupId },
      {
        onSuccess: () => {
          toast({ kind: "success", title: "Note shared with the group" });
          setNoteId("");
          onClose();
        },
        onError: (e) => toast({ kind: "error", title: "Could not share", description: e.message }),
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share a note"
      description="Group members will be able to read it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={share.isPending || !noteId}>
            {share.isPending && <Loader2 className="size-4 animate-spin" />} Share
          </Button>
        </>
      }
    >
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Every note you have is already shared here. Create a new note first.
        </p>
      ) : (
        <select
          value={noteId}
          onChange={(e) => setNoteId(e.target.value)}
          className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <option value="">Select a note…</option>
          {options.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title}
            </option>
          ))}
        </select>
      )}
    </Modal>
  );
}
