import { useState } from "react";
import { motion } from "motion/react";
import { Link } from "wouter";
import { Loader2, Mail, Lock, User, Network, Sparkles, Trophy } from "lucide-react";
import { authClient } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useToast } from "../components/toast";
import { Logo } from "../components/logo";

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="size-4">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
    <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.44 14.97.5 12 .5A11 11 0 0 0 2.18 6.94l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

/**
 * Where to go after a successful sign-in. Only same-origin absolute paths are
 * honoured so a crafted `?next=//evil.com` can't turn login into an open redirect.
 */
function nextPath() {
  const raw = new URLSearchParams(window.location.search).get("next");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default function LoginPage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [social, setSocial] = useState(false);

  const google = async () => {
    setSocial(true);
    try {
      await authClient.managedAuth.signIn({ provider: "google" });
    } catch {
      toast({ kind: "error", title: "Sign-in failed", description: "Could not start Google sign-in." });
      setSocial(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const res = await authClient.signUp.email({ email, password, name: name || email.split("@")[0] });
        if (res.error) throw new Error(res.error.message);
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message);
      }
      // Land on the dashboard (or wherever `?next=` points — invite links send
      // people through here) with a freshly-hydrated session. A hard navigation
      // avoids the window where the session store is still empty and `/` would
      // render the marketing page. Keep the spinner up until the page swaps.
      window.location.replace(nextPath());
      return;
    } catch (err) {
      toast({ kind: "error", title: "Authentication failed", description: err instanceof Error ? err.message : "Try again." });
      setLoading(false);
    }
  };

  return (
    <div className="app-bg flex min-h-dvh text-foreground">
      {/* Left brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-border p-12 lg:flex">
        <div className="absolute -left-24 top-1/4 size-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -right-10 bottom-10 size-80 rounded-full bg-secondary/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <Logo size={44} className="rounded-2xl" />
          <span className="text-lg font-bold">OrbitL</span>
        </div>
        <div className="relative space-y-6">
          <h1 className="max-w-md text-4xl font-bold leading-tight">
            The operating system for how you <span className="text-gradient">learn</span>.
          </h1>
          <p className="max-w-md text-muted-foreground">
            Map every concept, let AI find your weak spots, and turn studying into a game you actually want to play.
          </p>
          <div className="space-y-3">
            {[
              { icon: Network, text: "Interactive knowledge graph of everything you know" },
              { icon: Sparkles, text: "An AI coach that adapts to your progress" },
              { icon: Trophy, text: "XP, streaks & achievements that keep you going" },
            ].map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.1 }}
                className="flex items-center gap-3 text-sm"
              >
                <div className="grid size-9 place-items-center rounded-xl bg-surface">
                  <f.icon className="size-4 text-accent" />
                </div>
                {f.text}
              </motion.div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-muted-foreground">© 2026 OrbitL. Built for ambitious students.</p>
      </div>

      {/* Right form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo size={40} />
            <span className="text-lg font-bold">OrbitL</span>
          </div>

          <h2 className="text-2xl font-bold">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to continue learning." : "Start building your knowledge graph today."}
          </p>

          <Button onClick={google} disabled={social} variant="outline" className="mt-6 h-11 w-full gap-2.5">
            {social ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
            Continue with Google
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or {mode === "signin" ? "sign in" : "sign up"} with email
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="pl-9" />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@school.edu"
                className="pl-9"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 8 chars)"
                className="pl-9"
              />
            </div>
            {mode === "signin" && (
              <div className="flex justify-end">
                <Link href="/forgot-password">
                  <span className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                    Forgot your password?
                  </span>
                </Link>
              </div>
            )}
            <Button type="submit" disabled={loading} className="h-11 w-full">
              {loading && <Loader2 className="size-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to OrbitL?" : "Already have an account?"}{" "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-semibold text-primary hover:underline"
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
