import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import katex from "katex";
import { useMemo } from "react";

/**
 * LaTeX formulas inside notes.
 *
 * No TipTap maths package is installed, so this is a pair of purpose-built atom
 * nodes rendering through KaTeX directly. Storing the raw LaTeX in a
 * `data-latex` attribute means the formula round-trips through the saved HTML
 * losslessly — the rendered markup is regenerated on load rather than trusted,
 * so a KaTeX upgrade can never leave a note stuck with stale output.
 */

function renderKatex(latex: string, display: boolean): { html: string; error: string | null } {
  try {
    return {
      html: katex.renderToString(latex, { displayMode: display, throwOnError: true, output: "html" }),
      error: null,
    };
  } catch (e) {
    return { html: "", error: e instanceof Error ? e.message : "Invalid LaTeX" };
  }
}

function MathView({ node, selected, display }: NodeViewProps & { display: boolean }) {
  const latex = String(node.attrs.latex ?? "");
  const { html, error } = useMemo(() => renderKatex(latex, display), [latex, display]);

  return (
    <NodeViewWrapper
      as={display ? "div" : "span"}
      data-math={display ? "block" : "inline"}
      className={[
        display ? "my-3 block overflow-x-auto text-center" : "inline-block align-middle",
        "rounded-lg px-1",
        selected ? "ring-2 ring-ring/60" : "",
        error ? "bg-destructive/10 text-destructive" : "",
      ].join(" ")}
    >
      {error ? (
        // A broken formula shows its source, not a blank space — the student can
        // still see and fix what they typed.
        <span className="font-mono text-xs" title={error}>
          {latex || "empty formula"}
        </span>
      ) : (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </NodeViewWrapper>
  );
}

export const InlineMath = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-latex") ?? "",
        renderHTML: (attrs) => ({ "data-latex": attrs.latex }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-latex]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    // Also emit the LaTeX as text so any consumer that ignores the attribute
    // (plain-text mirror, AI prompt, search) still sees the formula.
    return ["span", mergeAttributes(HTMLAttributes, { "data-math": "inline" }), `$${node.attrs.latex}$`];
  },

  addNodeView() {
    return ReactNodeViewRenderer((props: NodeViewProps) => <MathView {...props} display={false} />);
  },
});

export const BlockMath = Node.create({
  name: "blockMath",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-latex") ?? "",
        renderHTML: (attrs) => ({ "data-latex": attrs.latex }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-latex]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-math": "block" }), `$$${node.attrs.latex}$$`];
  },

  addNodeView() {
    return ReactNodeViewRenderer((props: NodeViewProps) => <MathView {...props} display />);
  },
});
