import { useCallback, useEffect, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import "katex/dist/katex.min.css";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Quote,
  Code,
  Undo2,
  Redo2,
  Table as TableIcon,
  Sigma,
  Columns3,
  Rows3,
  Trash2,
  Strikethrough,
  Minus,
} from "lucide-react";
import { BlockMath, InlineMath } from "./math-node";
import { Modal } from "./modal";
import { Button } from "./button";
import { Textarea } from "./input";

/**
 * Rich-text note editor.
 *
 * Notes are stored as HTML rather than markdown because tables and formulas have
 * no clean markdown representation that survives a round-trip; the plain-text
 * mirror kept alongside is what AI and search read, so markup never leaks into a
 * prompt.
 */

const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4] },
    // The default link/blockquote behaviour is fine; only headings need pinning
    // so H4 is available for the deeply nested outlines students actually write.
    // StarterKit 3.x already bundles Underline; registering it again duplicates
    // the mark and corrupts the schema (getHTML() then throws).
  }),
  Placeholder.configure({ placeholder: "Start typing. Use the toolbar for headings, tables and formulas…" }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  InlineMath,
  BlockMath,
];

/** Editor-only styling for content nodes, since notes render inside our own theme. */
const PROSE = [
  "min-h-[420px] max-w-none px-1 focus:outline-none",
  "[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-bold",
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold",
  "[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:font-semibold",
  "[&_h4]:mt-3 [&_h4]:mb-1.5 [&_h4]:text-base [&_h4]:font-semibold",
  "[&_p]:my-2 [&_p]:text-sm [&_p]:leading-relaxed",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-sm",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:text-sm",
  "[&_li]:my-0.5",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-3 [&_blockquote]:text-sm [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border [&_pre]:bg-surface [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_hr]:my-4 [&_hr]:border-border",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_table]:my-3 [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-lg [&_table]:text-sm",
  "[&_th]:border [&_th]:border-border [&_th]:bg-surface [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold",
  "[&_td]:border [&_td]:border-border [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top",
  "[&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-sm [&_.is-editor-empty:first-child::before]:text-muted-foreground [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
].join(" ");

function Tool({
  onClick,
  active,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={!!active}
      disabled={disabled}
      // Toolbar buttons must not steal the selection before the command runs.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors disabled:opacity-40 ${
        active ? "bg-primary/15 text-primary" : "hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function HeadingButton({ editor, level }: { editor: Editor; level: 1 | 2 | 3 | 4 }) {
  return (
    <Tool
      title={`Heading ${level}`}
      active={editor.isActive("heading", { level })}
      onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
    >
      <span className="text-xs font-bold">H{level}</span>
    </Tool>
  );
}

export function RichTextEditor({
  value,
  onChange,
  editable = true,
}: {
  value: string;
  onChange: (html: string, text: string) => void;
  editable?: boolean;
}) {
  const [mathOpen, setMathOpen] = useState(false);
  const [mathValue, setMathValue] = useState("");
  const [mathDisplay, setMathDisplay] = useState(false);

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: value,
    editable,
    // React 19 StrictMode mounts, destroys and remounts. Rendering the editor in
    // an effect (rather than during render) keeps the instance React holds and
    // the instance TipTap owns from drifting apart.
    immediatelyRender: false,
    editorProps: { attributes: { class: PROSE } },
    onUpdate: ({ editor: e }) => {
      if (e.isDestroyed) return;
      onChange(e.getHTML(), e.getText());
    },
  });

  // Swapping to a different note replaces the document wholesale; guarding on the
  // current HTML keeps this from clobbering the caret on every keystroke.
  // A destroyed editor has no schema, so getHTML() would throw during teardown.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (value !== editor.getHTML()) editor.commands.setContent(value || "", { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(editable);
  }, [editable, editor]);

  const openMath = useCallback(() => {
    if (!editor) return;
    const node = editor.state.selection.$from.nodeAfter;
    const isMath = editor.isActive("inlineMath") || editor.isActive("blockMath");
    setMathDisplay(editor.isActive("blockMath"));
    setMathValue(isMath ? String(node?.attrs.latex ?? "") : "");
    setMathOpen(true);
  }, [editor]);

  const insertMath = () => {
    if (!editor) return;
    const latex = mathValue.trim();
    if (!latex) {
      setMathOpen(false);
      return;
    }
    editor
      .chain()
      .focus()
      .insertContent({ type: mathDisplay ? "blockMath" : "inlineMath", attrs: { latex } })
      .run();
    setMathOpen(false);
    setMathValue("");
  };

  if (!editor) return <div className="min-h-[420px] animate-pulse rounded-xl bg-muted/40" />;

  const inTable = editor.isActive("table");

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 mb-3 flex flex-wrap items-center gap-0.5 border-b border-border bg-card/90 px-4 pb-2 backdrop-blur">
        <Tool title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="size-4" />
        </Tool>
        <Tool title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="size-4" />
        </Tool>
        <Tool title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="size-4" />
        </Tool>
        <Tool title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="size-4" />
        </Tool>

        <span className="mx-1 h-5 w-px bg-border" />
        <HeadingButton editor={editor} level={1} />
        <HeadingButton editor={editor} level={2} />
        <HeadingButton editor={editor} level={3} />
        <HeadingButton editor={editor} level={4} />

        <span className="mx-1 h-5 w-px bg-border" />
        <Tool title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="size-4" />
        </Tool>
        <Tool title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="size-4" />
        </Tool>
        <Tool title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="size-4" />
        </Tool>
        <Tool title="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <Code className="size-4" />
        </Tool>
        <Tool title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="size-4" />
        </Tool>

        <span className="mx-1 h-5 w-px bg-border" />
        <Tool
          title="Insert table"
          active={inTable}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon className="size-4" />
        </Tool>
        <Tool title="Add column" disabled={!inTable} onClick={() => editor.chain().focus().addColumnAfter().run()}>
          <Columns3 className="size-4" />
        </Tool>
        <Tool title="Add row" disabled={!inTable} onClick={() => editor.chain().focus().addRowAfter().run()}>
          <Rows3 className="size-4" />
        </Tool>
        <Tool title="Delete table" disabled={!inTable} onClick={() => editor.chain().focus().deleteTable().run()}>
          <Trash2 className="size-4" />
        </Tool>

        <span className="mx-1 h-5 w-px bg-border" />
        <Tool title="Insert formula (LaTeX)" active={editor.isActive("inlineMath") || editor.isActive("blockMath")} onClick={openMath}>
          <Sigma className="size-4" />
        </Tool>

        <span className="mx-1 h-5 w-px bg-border" />
        <Tool title="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="size-4" />
        </Tool>
        <Tool title="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="size-4" />
        </Tool>
      </div>

      <EditorContent editor={editor} />

      <Modal open={mathOpen} onClose={() => setMathOpen(false)} title="Insert formula">
        <div className="space-y-3">
          <div className="flex gap-1 rounded-xl bg-surface p-1">
            <button
              type="button"
              onClick={() => setMathDisplay(false)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${!mathDisplay ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              Inline
            </button>
            <button
              type="button"
              onClick={() => setMathDisplay(true)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${mathDisplay ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              Display block
            </button>
          </div>
          <Textarea
            autoFocus
            value={mathValue}
            onChange={(e) => setMathValue(e.target.value)}
            rows={3}
            placeholder="\int_0^1 x^2\,dx = \frac{1}{3}"
            className="font-mono text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) insertMath();
            }}
          />
          <MathPreview latex={mathValue} display={mathDisplay} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMathOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!mathValue.trim()} onClick={insertMath}>
              <Sigma className="size-4" /> Insert
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Live preview so a typo in the LaTeX is caught before it lands in the note. */
function MathPreview({ latex, display }: { latex: string; display: boolean }) {
  const [state, setState] = useState<{ html: string; error: string | null }>({ html: "", error: null });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const katex = (await import("katex")).default;
      if (cancelled) return;
      try {
        setState({ html: katex.renderToString(latex || "", { displayMode: display, throwOnError: true }), error: null });
      } catch (e) {
        setState({ html: "", error: e instanceof Error ? e.message.split("\n")[0] : "Invalid LaTeX" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [latex, display]);

  if (!latex.trim()) return <p className="text-xs text-muted-foreground">Type LaTeX above — a preview appears here.</p>;
  if (state.error) return <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{state.error}</p>;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-center" dangerouslySetInnerHTML={{ __html: state.html }} />
  );
}
