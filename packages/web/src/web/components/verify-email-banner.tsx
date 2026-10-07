import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MailWarning, Loader2, X, CheckCircle2 } from "lucide-react";
import { authClient } from "../lib/auth";
import { useToast } from "./toast";

const DISMISS_KEY = "orbitl:verify-dismissed";

/**
 * Nudge for unverified accounts.
 *
 * Sign-in is not blocked on verification — the whole app stays usable — but an
 * unverified address means password resets and streak reminders can't reach the
 * user, so it's worth a persistent (dismissible) reminder.
 */
export function VerifyEmailBanner() {
  const { data: session, refetch } = authClient.useSession();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "1");

  // Coming back from the confirmation link — say so, then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") !== "1") return;
    toast({ kind: "success", title: "Email confirmed", description: "You're all set." });
    void refetch();
    params.delete("verified");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [refetch, toast]);

  const user = session?.user;
  const show = !!user && user.emailVerified === false && !hidden;

  const resend = async () => {
    if (!user) return;
    setSending(true);
    try {
      const res = await authClient.sendVerificationEmail({
        email: user.email,
        callbackURL: "/?verified=1",
      });
      if (res.error) throw new Error(res.error.message);
      toast({
        kind: "success",
        title: "Confirmation email sent",
        description: `Check ${user.email} — the link is good for 24 hours.`,
      });
    } catch (err) {
      toast({
        kind: "error",
        title: "Couldn't send the email",
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-warning/25 bg-warning/8 px-4 py-3"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning/12">
            <MailWarning className="size-[18px] text-warning" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Confirm your email address</p>
            <p className="text-xs text-muted-foreground">
              We sent a link to <span className="text-foreground">{user?.email}</span>. Until it's confirmed we
              can't send password resets or streak reminders.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={resend}
              disabled={sending}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-warning/15 px-3 text-xs font-semibold text-warning transition-colors hover:bg-warning/25 disabled:opacity-60"
            >
              {sending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Resend email
            </button>
            <button
              onClick={() => {
                sessionStorage.setItem(DISMISS_KEY, "1");
                setHidden(true);
              }}
              aria-label="Dismiss"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
