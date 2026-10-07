import { describe, expect, test } from "bun:test";
import { extractFileText, MAX_EXTRACT_CHARS } from "./extract";

/**
 * Only the type-gating branch is unit-tested: everything else needs a real S3
 * object, which is covered by the live ingest check instead.
 */
describe("extractFileText", () => {
  test("rejects unsupported extensions without touching storage", async () => {
    for (const name of ["old.doc", "old.ppt", "sheet.xlsx", "archive.zip", "photo.png", "noextension"]) {
      const r = await extractFileText(`uploads/x/${name}`, name);
      expect(r.ok).toBe(false);
      expect(r.kind).toBe("unsupported");
      expect(r.text).toBe("");
      expect(r.reason).toContain("can't be read yet");
    }
  });

  test("classifies supported types by extension (case-insensitive)", async () => {
    // These keys don't exist in storage, so they fail on read — but the kind
    // must already show the file was accepted for extraction.
    for (const [name, kind] of [
      ["notes.MD", "text"],
      ["data.csv", "text"],
      ["paper.PDF", "pdf"],
      ["paper.docx", "docx"],
      ["slides.pptx", "pptx"],
    ] as const) {
      const r = await extractFileText(`uploads/does-not-exist/${name}`, name);
      expect(r.kind).toBe(kind);
      expect(r.ok).toBe(false);
    }
  });

  test("never throws on a missing object", async () => {
    const r = await extractFileText("uploads/missing/really-not-here.txt", "really-not-here.txt");
    expect(r.ok).toBe(false);
    expect(typeof r.reason).toBe("string");
  });

  test("truncation ceiling is sane", () => {
    expect(MAX_EXTRACT_CHARS).toBeGreaterThan(1000);
    expect(MAX_EXTRACT_CHARS).toBeLessThanOrEqual(50_000);
  });
});
