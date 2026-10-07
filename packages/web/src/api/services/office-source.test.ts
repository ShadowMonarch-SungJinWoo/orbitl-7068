import { describe, expect, test } from "bun:test";
import { zipSync, strToU8 } from "fflate";
import { officeSource } from "./office-source";

const doc = (body: string) => `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>${body}</w:body></w:document>`;
const cell = (s: string) => `<w:tc><w:p><w:r><w:t>${s}</w:t></w:r></w:p></w:tc>`;

describe("Office study-source extraction", () => {
  test("DOCX row/column relationships survive extraction", () => {
    const bytes = zipSync({ "word/document.xml": strToU8(doc(`<w:tbl><w:tr>${cell("Process")}${cell("Energy")}</w:tr><w:tr>${cell("Diffusion")}${cell("None")}</w:tr></w:tbl>`)) });
    const source = officeSource(bytes, "docx");
    expect(source).toContain("Process\tEnergy");
    expect(source).toContain("Diffusion\tNone");
    expect(source).toContain("[TABLE:");
  });
  test("native Office equations preserve fractions and superscripts", () => {
    const xml = doc('<m:oMathPara><m:oMath><m:f><m:num><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:num><m:den><m:r><m:t>3</m:t></m:r></m:den></m:f></m:oMath></m:oMathPara>');
    const source = officeSource(zipSync({ "word/document.xml": strToU8(xml) }), "docx");
    expect(source).toContain("\\[\\frac{{x}^{2}}{3}\\]");
  });
  test("PPTX slides use numeric order and retain tables", () => {
    const slide = (s: string) => `<p:sld xmlns:p="urn:slides" xmlns:a="urn:drawing"><a:p><a:r><a:t>${s}</a:t></a:r></a:p></p:sld>`;
    const source = officeSource(zipSync({ "ppt/slides/slide10.xml": strToU8(slide("Last")), "ppt/slides/slide2.xml": strToU8(slide("First")) }), "pptx");
    expect(source.indexOf("First")).toBeLessThan(source.indexOf("Last"));
  });
  test("external declarations are rejected; no XML entity fetch", () => {
    const xml = '<!DOCTYPE d [<!ENTITY x SYSTEM "http://localhost/secret">]>' + doc("<w:p>&x;</w:p>");
    expect(() => officeSource(zipSync({ "word/document.xml": strToU8(xml) }), "docx")).toThrow("unsupported XML declarations");
  });
});