import { useState } from "react";
import { Settings, Moon, Sun, LogOut, Loader2, Sparkles, Database, GraduationCap, Trash2, Mail, MailCheck, MailWarning, Flame, Shield, UserX, Download } from "lucide-react";
import { Link } from "wouter";
import { PageHeader } from "../components/ui/page-header";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { useTheme } from "../components/theme";
import { useProfile, useSetCosmetic } from "../queries/game";
import { useEmailPrefs, useExportData, useResetData, useSeed, useSetEmailPrefs, useStatus } from "../queries/me";
import { OnboardingTour } from "../components/onboarding";
import { useToast } from "../components/toast";
import { authClient } from "../lib/auth";

const AVATARS = ["🎓", "🧠", "🚀", "📚", "🔬", "🎯", "🐙", "🦉", "⚡", "🌱"];

export default function SettingsPage() {
  const [replayTour, setReplayTour] = useState(false);
  const reset = useResetData();
  const exportData = useExportData();
  const { theme, setTheme } = useTheme();
  const { data: profile } = useProfile();
  const { data: status } = useStatus();
  const setCosmetic = useSetCosmetic();
  const seed = useSeed();
  const { data: session } = authClient.useSession();
  const { toast } = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const { data: prefs } = useEmailPrefs();
  const setPrefs = useSetEmailPrefs();
  const [resending, setResending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const resendVerification = async () => {
    if (!session?.user?.email) return;
    setResending(true);
    try {
      const res = await authClient.sendVerificationEmail({
        email: session.user.email,
        callbackURL: "/?verified=1",
      });
      if (res.error) throw new Error(res.error.message);
      toast({ kind: "success", title: "Confirmation email sent", description: "The link is good for 24 hours." });
    } catch (err) {
      toast({
        kind: "error",
        title: "Couldn't send the email",
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setResending(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await authClient.deleteUser({ password: deletePassword });
      if (res.error) throw new Error(res.error.message ?? "Delete failed");
      window.location.href = "/";
    } catch (err) {
      toast({
        kind: "error",
        title: "Couldn't delete the account",
        description: err instanceof Error ? err.message : "Check your password and try again.",
      });
      setDeleting(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    await authClient.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" subtitle="Your profile, appearance and workspace." icon={Settings} />

      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 p-5">
            <div className="grid size-14 place-items-center rounded-2xl bg-surface text-2xl">{!profile?.avatar || profile.avatar === "scholar" ? "🎓" : profile.avatar}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{session?.user?.name || "Student"}</p>
              <p className="truncate text-sm text-muted-foreground">{session?.user?.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Level {profile?.level ?? 1}</Badge>
              <Badge variant="warning">{profile?.streak ?? 0}d streak</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <p className="text-sm font-semibold">Avatar</p>
              <p className="text-xs text-muted-foreground">Pick the emoji that represents you.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  onClick={() => setCosmetic.mutate({ avatar: a })}
                  className={`grid size-11 place-items-center rounded-xl text-xl transition ${
                    profile?.avatar === a ? "bg-primary/15 ring-2 ring-ring" : "bg-surface hover:bg-muted"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <p className="text-sm font-semibold">Appearance</p>
              <p className="text-xs text-muted-foreground">OrbitL is designed dark-first, but light mode is fully supported.</p>
            </div>
            <div className="flex gap-2">
              <Button variant={theme === "dark" ? "default" : "outline"} onClick={() => setTheme("dark")}>
                <Moon className="size-4" /> Dark
              </Button>
              <Button variant={theme === "light" ? "default" : "outline"} onClick={() => setTheme("light")}>
                <Sun className="size-4" /> Light
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Database className="size-4 text-accent" /> Starter workspace
              </p>
              <p className="text-xs text-muted-foreground">
                {status?.seeded
                  ? "Your workspace has starter subjects and concepts. Re-seeding is safe — it won't duplicate."
                  : "Load a set of example subjects, concepts, notes and assignments to explore the app."}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={seed.isPending}
              onClick={() =>
                seed.mutate(
                  undefined as never,
                  {
                    onSuccess: () => toast({ kind: "success", title: "Workspace ready" }),
                    onError: (e) => toast({ kind: "error", title: "Seed failed", description: e.message }),
                  },
                )
              }
            >
              {seed.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Load starter data
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <GraduationCap className="size-4 text-primary" /> Getting started tour
              </p>
              <p className="text-xs text-muted-foreground">
                Replay the welcome walkthrough — how the graph, study tools and streak rules work.
              </p>
            </div>
            <Button variant="outline" onClick={() => setReplayTour(true)}>
              <GraduationCap className="size-4" /> Replay tour
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Mail className="size-4 text-primary" /> Email
              </p>
              <p className="text-xs text-muted-foreground">
                Where password resets and reminders go. Nothing else is ever sent here.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/60 p-3">
              {prefs?.emailVerified ? (
                <MailCheck className="size-[18px] shrink-0 text-success" />
              ) : (
                <MailWarning className="size-[18px] shrink-0 text-warning" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{prefs?.email ?? session?.user?.email}</p>
                <p className="text-xs text-muted-foreground">
                  {prefs?.emailVerified
                    ? "Confirmed"
                    : "Not confirmed yet — resets and reminders can't be delivered."}
                </p>
              </div>
              {prefs && !prefs.emailVerified && (
                <Button variant="outline" size="sm" disabled={resending} onClick={resendVerification}>
                  {resending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Resend
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Flame className="size-4 text-warning" /> Streak reminders
                </p>
                <p className="text-xs text-muted-foreground">
                  One email on days you haven't studied yet and your streak is about to reset.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!prefs || setPrefs.isPending}
                onClick={() =>
                  setPrefs.mutate(
                    { streakReminders: !prefs?.streakReminders },
                    {
                      onSuccess: () =>
                        toast({
                          kind: "success",
                          title: prefs?.streakReminders ? "Reminders off" : "Reminders on",
                        }),
                      onError: (e) => toast({ kind: "error", title: "Couldn't save", description: e.message }),
                    },
                  )
                }
              >
                {setPrefs.isPending && <Loader2 className="size-4 animate-spin" />}
                {prefs?.streakReminders ? "On" : "Off"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Download className="size-4" /> Export your data
              </p>
              <p className="text-xs text-muted-foreground">
                Downloads everything on your account — subjects, concepts, notes, cards, quizzes,
                attempts, assignments, sessions, XP history and reviews — as a single JSON file.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={exportData.isPending}
              onClick={() =>
                exportData.mutate(undefined as never, {
                  onSuccess: (data) => {
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `orbitl-export-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast({ kind: "success", title: "Export downloaded" });
                  },
                  onError: (e) => toast({ kind: "error", title: "Export failed", description: e.message }),
                })
              }
            >
              {exportData.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Download JSON
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Trash2 className="size-4 text-destructive" /> Reset workspace
              </p>
              <p className="text-xs text-muted-foreground">
                Permanently deletes every subject, concept, note, card, quiz, assignment and session,
                and puts your XP and streak back to zero. This cannot be undone.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={reset.isPending}
              onClick={() => {
                if (!window.confirm("Delete all of your study data? This cannot be undone.")) return;
                reset.mutate(undefined as never, {
                  onSuccess: () => toast({ kind: "success", title: "Workspace cleared" }),
                  onError: (e) => toast({ kind: "error", title: "Reset failed", description: e.message }),
                });
              }}
            >
              {reset.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Delete all my data
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-sm font-semibold">Session</p>
              <p className="text-xs text-muted-foreground">Sign out of OrbitL on this device.</p>
            </div>
            <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" disabled={signingOut} onClick={signOut}>
              {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />} Sign out
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardContent className="space-y-3 p-5">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <UserX className="size-4 text-destructive" /> Delete account
              </p>
              <p className="text-xs text-muted-foreground">
                Closes your OrbitL account for good: your login, profile, all study data, group
                memberships and reviews are erased immediately. Groups you own are removed for every
                member. There is no undo and no recovery window.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => {
                setDeletePassword("");
                setDeleteConfirm("");
                setDeleteOpen(true);
              }}
            >
              <UserX className="size-4" /> Delete my account
            </Button>
          </CardContent>
        </Card>

        <Modal
          open={deleteOpen}
          onClose={() => !deleting && setDeleteOpen(false)}
          title="Delete your account?"
          description="This erases your account and every piece of data attached to it. It cannot be undone."
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Your password</label>
              <Input
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Type <span className="font-semibold text-foreground">DELETE</span> to confirm
              </label>
              <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="DELETE" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" disabled={deleting} onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={deleting || deleteConfirm !== "DELETE" || deletePassword.length < 1}
                onClick={deleteAccount}
              >
                {deleting ? <Loader2 className="size-4 animate-spin" /> : <UserX className="size-4" />} Delete forever
              </Button>
            </div>
          </div>
        </Modal>

        <div className="flex flex-wrap items-center gap-4 px-1 pb-2 text-xs text-muted-foreground">
          <Shield className="size-3.5" />
          <Link to="/privacy">
            <span className="transition-colors hover:text-foreground">Privacy Policy</span>
          </Link>
          <Link to="/terms">
            <span className="transition-colors hover:text-foreground">Terms of Service</span>
          </Link>
        </div>
      </div>

      {replayTour && <OnboardingTour onDone={() => setReplayTour(false)} />}
    </div>
  );
}
