import { useRef, useState } from "react";
import { Loader2, UploadCloud, FileText, Sparkles } from "lucide-react";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useToast } from "./toast";
import { usePresignUpload, useIngestUpload } from "../queries/upload";
import { useGraph } from "../queries/topics";
import { AiErrorNotice } from "./ai-error";

const ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.markdown,.csv,.tsv,.json,.log";
// Mirrors MAX_FILE_BYTES in api/lib/upload-policy.ts — the server is the real
// gate, this is only so the user finds out before the bytes leave their machine.
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Upload a study file, extract its real text server-side, and turn it into a
 * note (+ optional flashcards and a quiz when a topic is chosen).
 */
export function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const presign = usePresignUpload();
  const ingest = useIngestUpload();
  const { data: graph } = useGraph();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [topicId, setTopicId] = useState("");
  const [generate, setGenerate] = useState(true);
  const [stage, setStage] = useState<"idle" | "uploading" | "processing">("idle");
  const [error, setError] = useState<{ message: string; data?: unknown } | null>(null);

  const topics = (graph?.nodes ?? []).filter((n) => n.type === "topic");
  const busy = stage !== "idle";

  const pick = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast({ kind: "error", title: "File too large", description: "Keep uploads under 20 MB." });
      return;
    }
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const reset = () => {
    setFile(null);
    setTitle("");
    setTopicId("");
    setStage("idle");
  };

  const submit = async () => {
    if (!file) return;
    try {
      setError(null);
      setStage("uploading");
      const { url, key } = await presign.mutateAsync({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      });
      const put = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type || "application/octet-stream" },
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);

      setStage("processing");
      const topic = topics.find((t) => t.topicId === topicId);
      const res = await ingest.mutateAsync({
        fileKey: key,
        fileName: file.name,
        title: title.trim() || file.name,
        topicId: topic?.topicId,
        subjectId: topic?.subjectId,
        generateMaterials: generate,
      });

      if (res.extraction.ok) {
        toast({
          kind: "success",
          title: "File processed",
          description: `Read ${res.extraction.chars.toLocaleString()} characters${res.flashCount ? ` · ${res.flashCount} flashcards` : ""}${res.quizId ? " · quiz ready" : ""}.`,
        });
      } else {
        toast({
          kind: "info",
          title: "Note created",
          description: res.extraction.reason ?? "Couldn't read the file contents.",
        });
      }
      reset();
      onClose();
    } catch (err) {
      setStage("idle");
      // Keep the failure on-screen with a retry: re-picking the file after a
      // toast disappears is the worst possible recovery path for a 20 MB PDF.
      setError({
        message: err instanceof Error ? err.message : "Something went wrong.",
        data: (err as { data?: unknown } | null)?.data,
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Upload study material"
      description="PDF, Word (.docx), PowerPoint (.pptx), Markdown, text or CSV. We read the actual contents — not just the filename."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!file || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {stage === "uploading" ? "Uploading…" : stage === "processing" ? "Reading & generating…" : "Process file"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <AiErrorNotice error={error} onRetry={submit} retrying={busy} />}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0] ?? null);
          }}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-colors hover:border-primary/40"
        >
          {file ? (
            <>
              <FileText className="size-6 text-primary" />
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB · click to change</p>
            </>
          ) : (
            <>
              <UploadCloud className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">Drop a file or click to browse</p>
              <p className="text-xs text-muted-foreground">PDF, DOCX, PPTX, TXT, MD, CSV — up to 15 MB</p>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lecture 4 — Thermodynamics" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Link to a concept (optional)</label>
          <select
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/50"
          >
            <option value="">No concept — just make a note</option>
            {topics.map((t) => (
              <option key={t.topicId} value={t.topicId!}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Pick a concept to also get flashcards and a quiz generated from the file.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={generate} onChange={(e) => setGenerate(e.target.checked)} className="size-4 accent-primary" />
          Use AI to structure notes from the file
        </label>
      </div>
    </Modal>
  );
}
