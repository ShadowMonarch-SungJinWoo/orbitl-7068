import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../lib/s3";
import { officeSource } from "./office-source";

/** Hard ceiling on characters fed to the model, keeps token cost predictable. */
export const MAX_EXTRACT_CHARS = 12000;

export type Extraction = {
  /** Extracted plain text, already truncated. Empty when nothing could be read. */
  text: string;
  /** True when the file type is supported and text was found. */
  ok: boolean;
  /** Human-readable reason when ok is false. */
  reason?: string;
  /** Characters extracted before truncation. */
  chars: number;
  kind: "text" | "pdf" | "docx" | "pptx" | "unsupported";
  truncated?: boolean;
};

const TEXT_EXT = ["txt", "md", "markdown", "csv", "tsv", "json", "log", "rtf"];

function extOf(name: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1]!.toLowerCase() : "";
}

function tidy(raw: string) {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchBytes(key: string): Promise<Uint8Array> {
  const res = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  const body = res.Body as unknown as { transformToByteArray?: () => Promise<Uint8Array> };
  if (!body?.transformToByteArray) throw new Error("Empty object body");
  return await body.transformToByteArray();
}

/**
 * Read an uploaded file out of S3 and return its plain text.
 * Never throws: unreadable or unsupported files come back with ok: false so the
 * caller can fall back to topic-only generation.
 */
export async function extractFileText(fileKey: string, fileName: string): Promise<Extraction> {
  const ext = extOf(fileName) || extOf(fileKey);
  const kind: Extraction["kind"] = ext === "pdf" || ext === "docx" || ext === "pptx" ? ext : TEXT_EXT.includes(ext) ? "text" : "unsupported";

  if (kind === "unsupported") {
    return { text: "", ok: false, chars: 0, kind, reason: `.${ext || "unknown"} files can't be read yet` };
  }

  try {
    const bytes = await fetchBytes(fileKey);
    let text = "";

    if (kind === "pdf") {
      const { getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      try {
        const pages: string[] = [];
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          const positioned = content.items.filter(item => "str" in item && item.str.trim())
            .map(item => {
              const it = item as { str: string; transform: number[]; width: number; height: number };
              return { x: it.transform[4], y: it.transform[5], width: it.width, height: Math.abs(it.height), text: it.str, script: false };
            });
          // Small raised/lowered glyph runs adjacent to larger text are script
          // cues (not standalone rows). Preserve these before grouping PDF lines.
          for (const item of positioned) {
            if (!/^[\p{L}\p{N}+−()]+$/u.test(item.text)) continue;
            const base = positioned.find(b => b !== item && b.height > item.height * 1.25 &&
              Math.abs(item.x - b.x - b.width) < 8 && Math.abs(item.y - b.y) >= 2 && Math.abs(item.y - b.y) < b.height);
            if (base) { base.text += `${item.y > base.y ? "^" : "_"}{${item.text}}`; item.script = true; }
          }
          // Preserve row/column cues instead of merging every page into prose.
          const lines: { y: number; items: { x: number; width: number; text: string }[] }[] = [];
          for (const item of positioned) {
            if (item.script) continue;
            const y = item.y;
            let line = lines.find(l => Math.abs(l.y - y) < 3);
            if (!line) { line = { y, items: [] }; lines.push(line); }
            line.items.push({ x: item.x, width: item.width, text: item.text });
          }
          pages.push(lines.sort((a, b) => b.y - a.y).map(l => {
            const items = l.items.sort((a, b) => a.x - b.x);
            return items.map((it, i) => {
              const prev = items[i - 1];
              const gap = prev ? it.x - (prev.x + prev.width) : 0;
              return (i ? gap > 15 ? "\t" : " " : "") + it.text;
            }).join("");
          }).join("\n"));
        }
        text = pages.join("\n\n");
      } finally { await pdf.cleanup(); }
    } else if (kind === "docx" || kind === "pptx") {
      text = officeSource(bytes, kind);
    } else {
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }

    text = tidy(text);
    if (text.length < 20) {
      return { text: "", ok: false, chars: text.length, kind, reason: "no readable text found in the file" };
    }
    const chars = text.length;
    return { text: text.slice(0, MAX_EXTRACT_CHARS), ok: true, chars, kind, truncated: chars > MAX_EXTRACT_CHARS };
  } catch (err) {
    return {
      text: "",
      ok: false,
      chars: 0,
      kind,
      reason: err instanceof Error ? err.message : "could not read the file",
    };
  }
}
