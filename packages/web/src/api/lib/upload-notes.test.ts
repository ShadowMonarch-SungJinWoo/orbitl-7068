import { describe, expect, test } from "bun:test";
import { noteInline, renderStudyNotes, studyNotesSchema, type StudyNotes } from "./upload-notes";

const block = (type: StudyNotes["blocks"][number]["type"], text = "", extra = {}) => ({ type, text, level: 2, items: [], rows: [], ...extra });

describe("upload notes → existing editor representation", () => {
  test("tables use native editable cells, never Markdown pipes", () => {
    const html = renderStudyNotes({ blocks: [block("table", "", { rows: [["Process", "Energy"], ["Diffusion", "No"], ["Active transport", "ATP"]] })] });
    expect(html).toContain("<table><tbody><tr><th><p>Process</p></th>");
    expect(html).toContain("<td><p>ATP</p></td>");
    expect(html).not.toContain("|---");
  });
  test("inline and block math have the exact existing editor's attributes", () => {
    const html = renderStudyNotes({ blocks: [
      block("paragraph", "The velocity is \\(v_0 + at\\)."),
      block("equation", "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}"),
    ] });
    expect(html).toContain('<span data-latex="v_0 + at" data-math="inline">');
    expect(html).toContain('<div data-latex="x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}" data-math="block">');
  });
  test("bold math does not leak emphasis markup or damage LaTeX", () => {
    const html = noteInline("**\\(\\omega\\)**: *angular frequency*");
    expect(html).toContain('<strong><span data-latex="\\omega"');
    expect(html).toContain("</span></strong>: <em>angular frequency</em>");
    expect(html).not.toContain("**");
  });
  test("normal prose remains structured without invented math or tables", () => {
    const html = renderStudyNotes({ blocks: [block("heading", "Memory", { level: 1 }), block("paragraph", "**Encoding** forms a memory."), block("orderedList", "", { items: ["Study", "Recall", "Correct errors"] })] });
    expect(html).toContain("<h1>Memory</h1>");
    expect(html).toContain("<p><strong>Encoding</strong> forms a memory.</p>");
    expect(html).toContain("<ol><li><p>Study</p></li>");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("data-latex");
  });
  test("model/source HTML is escaped, not trusted", () => {
    const html = noteInline('<img src=x onerror="alert(1)"><script>alert(1)</script>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img");
  });
  test("invalid math and incomplete tables cannot be silently saved", () => {
    expect(() => renderStudyNotes({ blocks: [block("equation", "\\frac{1}")] })).toThrow();
    expect(() => renderStudyNotes({ blocks: [block("table", "", { rows: [["A", "B"], ["a"]] })] })).toThrow("incomplete table");
  });
  test("schema rejects empty output", () => {
    expect(studyNotesSchema.safeParse({ blocks: [] }).success).toBe(false);
  });
});