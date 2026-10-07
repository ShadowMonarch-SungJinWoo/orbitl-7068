import { Link } from "wouter";
import { motion } from "motion/react";
import {
  ArrowRight,
  BarChart3,
  Brain,
  CalendarClock,
  Check,
  Layers,
  Moon,
  Network,
  Quote,
  Sparkles,
  Sun,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import { Logo } from "../components/logo";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Stars } from "../components/ui/stars";
import { useTheme } from "../components/theme";
import { useTopReviews } from "../queries/reviews";

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI Study Coach",
    desc: "Insights that read your real study data, tell you why a number moved, and hand you the next action — with follow-up questions on any of them.",
  },
  {
    icon: BarChart3,
    title: "Smart Insights",
    desc: "Mastery trends, focus hours and weak-spot detection — so you always know the highest-leverage thing to study next.",
  },
  {
    icon: Layers,
    title: "Flashcards & Quizzes",
    desc: "Generate spaced-repetition decks and quizzes from any note or topic in one click, then review with full explanations.",
  },
  {
    icon: Timer,
    title: "Focus Mode",
    desc: "Distraction-free deep-work sessions logged straight to the topic you were studying. Every minute counts toward mastery.",
  },
  {
    icon: Trophy,
    title: "XP, Streaks & Achievements",
    desc: "Levels, streaks and unlockable badges turn consistency into something you can feel. Momentum, not motivation.",
  },
  {
    icon: Users,
    title: "Study Groups",
    desc: "Share notes and decks, argue in group chat, and keep a shared deadline board with your cohort.",
  },
  {
    icon: CalendarClock,
    title: "Assignment Board",
    desc: "A kanban for every deadline, colour-coded by urgency, linked to the concepts each assignment actually tests.",
  },
  {
    icon: Brain,
    title: "Notes that connect",
    desc: "Markdown notes attached to concept nodes, with comments — your knowledge stops living in a folder graveyard.",
  },
];

const STEPS = [
  { n: "01", title: "Add your subjects", desc: "Import or create subjects and let OrbitL break them into a concept tree." },
  { n: "02", title: "Study anything", desc: "Notes, flashcards, quizzes, focus sessions — all feed the same mastery model." },
  { n: "03", title: "Watch the graph light up", desc: "Weak nodes glow red, mastered ones go green. Your next move is obvious." },
];

/** Smooth-scrolls to an in-page section without letting the router hijack the click. */
function jumpTo(e: React.MouseEvent, hash: string) {
  e.preventDefault();
  const el = document.getElementById(hash);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", `#${hash}`);
}

function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl scroll-mt-24 px-5 ${className}`}>
      {children}
    </section>
  );
}

export default function HomePage() {
  const { theme, toggle } = useTheme();
  const top = useTopReviews(3);
  const summary = top.data?.summary;

  return (
    <div className="app-bg min-h-dvh text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <Logo size={34} />
            <span className="text-base font-bold tracking-tight">OrbitL</span>
          </div>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#features" onClick={(e) => jumpTo(e, "features")} className="transition-colors hover:text-foreground">Features</a>
            <a href="#how" onClick={(e) => jumpTo(e, "how")} className="transition-colors hover:text-foreground">How it works</a>
            <a href="#reviews" onClick={(e) => jumpTo(e, "reviews")} className="transition-colors hover:text-foreground">Reviews</a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="grid size-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <Link to="/login">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex">Sign in</Button>
            </Link>
            <Link to="/login">
              <Button size="sm" className="rounded-xl">
                Get Started <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="grid-bg relative overflow-hidden">
        <div className="pointer-events-none absolute -left-40 top-0 size-[28rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-32 size-[26rem] rounded-full bg-secondary/20 blur-3xl" />
        <Section className="relative py-20 text-center sm:py-28">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Badge variant="accent" className="mb-6 px-3 py-1">
              <Sparkles className="size-3" /> AI-native study operating system
            </Badge>
            <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
              Stop managing notes.
              <br />
              Start <span className="text-gradient">mastering concepts</span>.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
              OrbitL maps everything you're learning into one living knowledge graph, tracks mastery as you study, and
              puts an AI coach on top of it — so you always know exactly what to do next.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link to="/login">
                <Button size="lg" className="h-12 rounded-xl px-7 text-base">
                  Get Started <ArrowRight className="size-4" />
                </Button>
              </Link>
              <a href="#features" onClick={(e) => jumpTo(e, "features")}>
                <Button size="lg" variant="outline" className="h-12 rounded-xl px-7 text-base">
                  See how it works
                </Button>
              </a>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              {["Free to start", "No credit card", "Your data, exportable"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-success" /> {t}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Stat strip */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="glass mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border sm:grid-cols-4"
          >
            {[
              { v: summary ? summary.average.toFixed(1) : "4.8", l: "Average rating" },
              { v: summary ? `${summary.total}` : "—", l: "Student reviews" },
              { v: "12", l: "Tools in one place" },
              { v: "∞", l: "Concepts mapped" },
            ].map((s) => (
              <div key={s.l} className="px-4 py-5">
                <p className="text-2xl font-bold text-gradient">{s.v}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.l}</p>
              </div>
            ))}
          </motion.div>
        </Section>
      </div>

      {/* Flagship: knowledge graph */}
      <Section className="py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5 }}
          >
            <Badge variant="default" className="mb-4"><Network className="size-3" /> The flagship</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Your whole degree, as one interactive graph
            </h2>
            <p className="mt-4 text-muted-foreground">
              Every subject becomes a tree of concepts, every concept a node with a live mastery score. Prerequisites
              connect, weak areas glow red, and the AI explains any node on demand. It's the difference between a pile
              of notes and an actual model of what you know.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Mastery-coloured nodes updated by every quiz, card and focus session",
                "Prerequisite edges reveal why a topic isn't sticking",
                "Click any node for an instant AI explanation at your level",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  <span className="text-muted-foreground">{t}</span>
                </li>
              ))}
            </ul>
            <Link to="/login">
              <Button className="mt-8 rounded-xl">Explore your graph <ArrowRight className="size-4" /></Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5 }}
            className="relative"
          >
            <div className="pointer-events-none absolute inset-0 rounded-3xl bg-primary/20 blur-3xl" />
            <Card className="relative overflow-hidden p-6">
              <div className="grid-bg absolute inset-0 opacity-60" />
              <div className="relative grid grid-cols-3 gap-4">
                {[
                  { l: "Limits", m: 92, tone: "bg-success" },
                  { l: "Derivatives", m: 78, tone: "bg-success" },
                  { l: "Integration", m: 41, tone: "bg-warning" },
                  { l: "Series", m: 24, tone: "bg-destructive" },
                  { l: "Vectors", m: 66, tone: "bg-warning" },
                  { l: "Matrices", m: 88, tone: "bg-success" },
                  { l: "Eigenvalues", m: 33, tone: "bg-destructive" },
                  { l: "Proofs", m: 71, tone: "bg-success" },
                  { l: "Topology", m: 12, tone: "bg-destructive" },
                ].map((n, i) => (
                  <motion.div
                    key={n.l}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-xl border border-border bg-card/80 p-3 backdrop-blur"
                  >
                    <p className="truncate text-[11px] font-semibold">{n.l}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${n.tone}`} style={{ width: `${n.m}%` }} />
                    </div>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">{n.m}% mastery</p>
                  </motion.div>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>
      </Section>

      {/* Features */}
      <Section id="features" className="py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything a student needs, in orbit</h2>
          <p className="mt-4 text-muted-foreground">
            Twelve tools that used to live in twelve tabs — now sharing one brain.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: (i % 4) * 0.06 }}
            >
              <Card className="h-full p-5 transition-colors hover:border-primary/40">
                <div className="mb-3 grid size-10 place-items-center rounded-xl bg-primary/10">
                  <f.icon className="size-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section id="how" className="py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Up and running in three steps</h2>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <Card className="h-full p-6">
                <span className="text-gradient text-3xl font-bold">{s.n}</span>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Reviews */}
      <Section id="reviews" className="py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Loved by students who were drowning</h2>
          {summary && summary.total > 0 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm text-muted-foreground">
              <Stars value={summary.average} size={18} />
              <span>
                <span className="font-semibold text-foreground">{summary.average.toFixed(1)}</span> out of 5 ·{" "}
                {summary.total} review{summary.total === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {(top.data?.items ?? []).map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <Card className="flex h-full flex-col p-6">
                <Quote className="size-5 text-primary/60" />
                <Stars value={r.rating} size={15} className="mt-3" />
                <h3 className="mt-3 text-sm font-semibold">{r.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
                <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    {r.userName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.userName}</p>
                    {r.role && <p className="truncate text-xs text-muted-foreground">{r.role}</p>}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link to="/reviews">
            <Button variant="outline" className="rounded-xl">
              Read all reviews <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </Section>

      {/* Closing CTA */}
      <Section className="py-20">
        <div className="relative overflow-hidden rounded-3xl border border-border p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute -left-20 -top-20 size-80 rounded-full bg-primary/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 size-80 rounded-full bg-secondary/25 blur-3xl" />
          <div className="relative">
            <Logo size={54} className="mx-auto rounded-2xl" />
            <h2 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
              Put your studying <span className="text-gradient">in orbit</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Create an account and OrbitL will seed your first subjects, concepts and deck in seconds. See your
              knowledge graph before you finish your coffee.
            </p>
            <Link to="/login">
              <Button size="lg" className="mt-8 h-12 rounded-xl px-8 text-base">
                Get Started — it's free <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="text-sm font-semibold">OrbitL</span>
            <span className="text-xs text-muted-foreground">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <a href="#features" onClick={(e) => jumpTo(e, "features")} className="transition-colors hover:text-foreground">Features</a>
            <Link to="/reviews" className="transition-colors hover:text-foreground">Reviews</Link>
            <Link to="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="transition-colors hover:text-foreground">Terms</Link>
            <Link to="/login" className="transition-colors hover:text-foreground">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
