import { motion } from "motion/react";
import { Link } from "wouter";
import { Compass, ArrowLeft, Network, StickyNote, Timer } from "lucide-react";
import { Button } from "../components/ui/button";
import { Logo } from "../components/logo";

const suggestions = [
  { href: "/graph", icon: Network, label: "Knowledge Graph" },
  { href: "/notes", icon: StickyNote, label: "Notes" },
  { href: "/focus", icon: Timer, label: "Focus Mode" },
];

/**
 * Real 404. Unknown URLs used to silently redirect to the dashboard, which made
 * typos and stale links look like broken features.
 */
export default function NotFoundPage({ authed = false }: { authed?: boolean }) {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg text-center"
      >
        {!authed && (
          <div className="mb-8 flex items-center justify-center gap-2.5">
            <Logo size={36} />
            <span className="text-lg font-bold">OrbitL</span>
          </div>
        )}

        <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-border bg-card">
          <Compass className="size-7 text-accent" />
        </div>

        <p className="mt-6 text-sm font-semibold tracking-widest text-muted-foreground">404</p>
        <h1 className="mt-2 text-3xl font-bold">This page drifted out of orbit</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
          The link you followed doesn't point anywhere in OrbitL. It may have been moved, or the URL has a typo.
        </p>

        <div className="mt-7 flex justify-center">
          <Link href="/">
            <Button className="gap-2">
              <ArrowLeft className="size-4" />
              {authed ? "Back to dashboard" : "Back to home"}
            </Button>
          </Link>
        </div>

        {authed && (
          <div className="mt-8">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Or jump to</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {suggestions.map((sg) => (
                <Link key={sg.href} href={sg.href}>
                  <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm transition-colors hover:border-primary/50 hover:bg-muted">
                    <sg.icon className="size-4 text-accent" />
                    {sg.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
