import { useMemo } from "react";

/** Tiny, dependency-free markdown renderer for study notes & AI replies.
 * Supports headings, bold, italic, inline code, code blocks, lists, blockquotes, links. */
function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1.5 py-0.5 text-[0.85em] font-mono">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-primary underline underline-offset-2">$1</a>');
}

function render(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // code block
    if (line.trim().startsWith("```")) {
      closeList();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(escapeHtml(lines[i]));
        i++;
      }
      i++;
      out.push(`<pre class="my-3 overflow-x-auto rounded-xl border border-border bg-surface p-3 text-xs font-mono leading-relaxed">${buf.join("\n")}</pre>`);
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      const sizes = ["text-xl", "text-lg", "text-base", "text-sm"];
      out.push(`<h${level} class="mt-4 mb-2 font-bold ${sizes[level - 1]}">${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeList();
      out.push(`<blockquote class="my-3 border-l-2 border-accent pl-3 text-sm italic text-muted-foreground">${inline(line.replace(/^>\s?/, ""))}</blockquote>`);
      i++;
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ul || ol) {
      const type = ul ? "ul" : "ol";
      if (listType !== type) {
        closeList();
        listType = type;
        out.push(`<${type} class="my-2 space-y-1 ${type === "ul" ? "list-disc" : "list-decimal"} pl-5 text-sm">`);
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
      i++;
      continue;
    }

    if (line.trim() === "") {
      closeList();
      i++;
      continue;
    }

    closeList();
    out.push(`<p class="my-2 text-sm leading-relaxed">${inline(line)}</p>`);
    i++;
  }
  closeList();
  return out.join("\n");
}

/** Exposed so legacy markdown notes can be converted to HTML for the rich editor. */
export function markdownToHtml(md: string): string {
  return render(md || "");
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  const html = useMemo(() => render(content || ""), [content]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
