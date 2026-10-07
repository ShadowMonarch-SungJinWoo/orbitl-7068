import { useState } from "react";
import { motion } from "motion/react";
import { Link } from "wouter";
import { Loader2, Mail, ArrowLeft, MailCheck } from "lucide-react";
import { authClient } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useToast } from "../components/toast";
import { Logo } from "../components/logo";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (res.error) throw new Error(res.error.message);
      // Always show the same confirmation — never reveal whether an address exists.
      setSent(true);
    } catch (err) {
      toast({
        kind: "error",
        title: "Couldn't send the email",
        description: err instanceof Error ? err.message : "Try again in a moment.",
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

        {sent ? (
          <>
            <div className="grid size-12 place-items-center rounded-2xl bg-success/10">
              <MailCheck className="size-6 text-success" />
            </div>
            <h2 className="mt-4 text-2xl font-bold">Check your inbox</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{email}</span>, we've sent a
              link to reset your password. It expires in an hour.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing arrived? Check spam, or{" "}
              <button onClick={() => setSent(false)} className="font-semibold text-primary hover:underline">
                try a different address
              </button>
              .
            </p>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold">Forgot your password?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the email you signed up with and we'll send you a reset link.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                  className="pl-9"
                />
              </div>
              <Button type="submit" disabled={loading} className="h-11 w-full">
                {loading && <Loader2 className="size-4 animate-spin" />}
                Send reset link
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
