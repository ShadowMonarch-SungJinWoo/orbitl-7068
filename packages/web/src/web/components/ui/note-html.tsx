import { useEffect, useMemo, useRef } from "react";

/**
 * Read-only renderer for HTML note bodies.
 *
 * The saved HTML stores formulas as `<span data-latex="...">$x$</span>` rather
 * than baked KaTeX markup, so this re-renders them on display. That keeps the
 * stored note independent of the KaTeX version that happened to be installed
 * when it was written.
 */

const PROSE = [
  "[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-bold",
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold",
  "[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:font-semibold",
  "[&_h4]:mt-3 [&_h4]:mb-1.5 [&_h4]:text-base [&_h4]:font-semibold",
  "[&_p]:my-2 [&_p]:text-sm [&_p]:leading-relaxed",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-sm",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:text-sm",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-3 [&_blockquote]:text-sm [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border [&_pre]:bg-surface [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_hr]:my-4 [&_hr]:border-border",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
  "[&_th]:border [&_th]:border-border [&_th]:bg-surface [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold",
  "[&_td]:border [&_td]:border-border [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top",
].join(" ");

export function NoteHtml({ html, className = "" }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Strip scripts/handlers: the HTML is the user's own, but a note can be shared
  // into a study group, so it is never trusted verbatim.
  const safe = useMemo(
    () =>
      (html || "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
        .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
        .replace(/\son\w+\s*=\s*'[^']*'/gi, ""),
    [html],
  );

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>("[data-latex]");
    if (nodes.length === 0) return;
    let cancelled = false;
    void (async () => {
      const [{ default: katex }] = await Promise.all([import("katex"), import("katex/dist/katex.min.css")]);
      if (cancelled) return;
      nodes.forEach((el) => {
        const latex = el.getAttribute("data-latex") ?? "";
        const display = el.getAttribute("data-math") === "block" || el.tagName === "DIV";
        try {
          el.innerHTML = katex.renderToString(latex, { displayMode: display, throwOnError: true });
          if (display) el.className = "my-3 overflow-x-auto text-center";
        } catch {
          // Leave the raw `$latex$` text in place — visible and fixable.
        }
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [safe]);

  return <div ref={ref} className={`${PROSE} ${className}`} dangerouslySetInnerHTML={{ __html: safe }} />;
}
