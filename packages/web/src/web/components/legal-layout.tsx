import { motion } from "motion/react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Logo } from "./logo";

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

/**
 * Shared shell for Privacy Policy and Terms. Rendered for signed-in and
 * anonymous visitors alike — the footer links to these from the marketing page,
 * and OAuth provider verification requires them to be publicly reachable.
 */
export function LegalLayout({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <div className="app-bg min-h-dvh text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
          <Link to="/">
            <span className="flex items-center gap-2.5">
              <Logo size={32} />
              <span className="text-sm font-bold">OrbitL</span>
            </span>
          </Link>
          <Link to="/">
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="size-4" /> Back
            </span>
          </Link>
        </div>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto w-full max-w-3xl px-5 py-12"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Legal</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
        <p className="mt-6 text-[15px] leading-relaxed text-muted-foreground">{intro}</p>

        <div className="mt-10 space-y-9">
          {sections.map((sec, i) => (
            <section key={sec.heading}>
              <h2 className="text-lg font-semibold">
                <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                {sec.heading}
              </h2>
              {sec.paragraphs?.map((p) => (
                <p key={p} className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
              {sec.bullets && (
                <ul className="mt-3 space-y-2">
                  {sec.bullets.map((b) => (
                    <li key={b} className="flex gap-3 text-[15px] leading-relaxed text-muted-foreground">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center gap-4 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/privacy">
            <span className="transition-colors hover:text-foreground">Privacy Policy</span>
          </Link>
          <Link to="/terms">
            <span className="transition-colors hover:text-foreground">Terms of Service</span>
          </Link>
          <span className="ml-auto text-xs">© {new Date().getFullYear()} OrbitL</span>
        </div>
      </motion.main>
    </div>
  );
}
