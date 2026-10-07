import { useState } from "react";
import { motion } from "motion/react";
import { Link } from "wouter";
import { Loader2, Lock, ArrowLeft, ShieldAlert, CheckCircle2 } from "lucide-react";
import { authClient } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useToast } from "../components/toast";
import { Logo } from "../components/logo";

/** Better Auth appends `?token=...`, or `?error=INVALID_TOKEN` when the link is stale. */
function readParams() {
  const p = new URLSearchParams(window.location.search);
  return { token: p.get("token"), error: p.get("error") };
}

export default function ResetPasswordPage() {
  const { toast } = useToast();
  const [{ token, error }] = useState(readParams);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || mismatch) return;
    setLoading(true);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res.error) throw new Error(res.error.message);
      setDone(true);
    } catch (err) {
      toast({
        kind: "error",
        title: "Couldn't reset your password",
        description: err instanceof Error ? err.message : "The link may have expired — request a new one.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-bg grid min-h-dvh place-items-center p-6 text-foreground">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <Logo size={40} />
          <span className="text-lg font-bold">OrbitL</span>
        </div>

        {!token || error ? (
          <>
            <div className="grid size-12 place-items-center rounded-2xl bg-warning/10">
              <ShieldAlert className="size-6 text-warning" />
            </div>
            <h2 className="mt-4 text-2xl font-bold">This link is no longer valid</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Reset links expire an hour after they're sent and can only be used once. Request a fresh one and
              you'll be back in shortly.
            </p>
            <Link href="/forgot-password">
              <Button className="mt-6 h-11 w-full">Request a new link</Button>
            </Link>
          </>
        ) : done ? (
          <>
            <div className="grid size-12 place-items-center rounded-2xl bg-success/10">
              <CheckCircle2 className="size-6 text-success" />
            </div>
            <h2 className="mt-4 text-2xl font-bold">Password updated</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You can now sign in with your new password.
            </p>
            <Link href="/login">
              <Button className="mt-6 h-11 w-full">Go to sign in</Button>
            </Link>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold">Choose a new password</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick something at least 8 characters long that you don't use elsewhere.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-3">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  required
                  minLength={8}
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New password"
                  className="pl-9"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirm new password"
                  className="pl-9"
                />
              </div>
              {mismatch && <p className="text-xs text-error">Those passwords don't match.</p>}
              <Button type="submit" disabled={loading || mismatch} className="h-11 w-full">
                {loading && <Loader2 className="size-4 animate-spin" />}
                Update password
              </Button>
            </form>
          </>
        )}

        <Link href="/login">
          <span className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Back to sign in
          </span>
        </Link>
      </motion.div>
    </div>
  );
}
