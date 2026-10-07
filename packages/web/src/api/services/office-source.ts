import { unzipSync, strFromU8 } from "fflate";
import { DOMParser, type Node, type Element } from "@xmldom/xmldom";

const children = (n: Node) => Array.from(n.childNodes ?? []);
const local = (n: Node) => (n as Element).localName || n.nodeName.split(":").pop();
const child = (n: Node, name: string) => children(n).find(c => local(c) === name);

/** Office's native equation tree → LaTeX, before layout is flattened to text. */
function math(n: Node | undefined): string {
  if (!n) return "";
  const part = (name: string) => math(child(n, name));
  switch (local(n)) {
    case "t": return n.textContent ?? "";
    case "f": {
      const props = child(n, "fPr");
      const type = props && child(props, "type") as Element | undefined;
      const command = type?.getAttribute("m:val") === "noBar" ? "binom" : "frac";
      return `\\${command}{${part("num")}}{${part("den")}}`;
    }
    case "sSup": return `{${part("e")}}^{${part("sup")}}`;
    case "sSub": return `{${part("e")}}_{${part("sub")}}`;
    case "sSubSup": return `{${part("e")}}_{${part("sub")}}^{${part("sup")}}`;
    case "rad": return `\\sqrt${part("deg") ? `[${part("deg")}]` : ""}{${part("e")}}`;
    case "m": return `\\begin{matrix}${children(n).filter(c => local(c) === "mr").map(row =>
      children(row).filter(c => local(c) === "e").map(math).join(" & ")).join(" \\\\ ")}\\end{matrix}`;
    case "d": {
      const props = child(n, "dPr");
      const val = (name: string, fallback: string) => {
        const el = props && child(props, name) as Element | undefined;
        return el?.getAttribute("m:val") ?? el?.getAttribute("val") ?? fallback;
      };
      const delim = (s: string) => s === "{" || s === "}" ? `\\${s}` : s || ".";
      return `\\left${delim(val("begChr", "("))}${children(n).filter(c => local(c) === "e").map(math).join(",")}\\right${delim(val("endChr", ")"))}`;
    }
    case "eqArr": return `\\begin{aligned}${children(n).filter(c => local(c) === "e").map(math).join(" \\\\ ")}\\end{aligned}`;
    case "limLow": return `{${part("e")}}_{${part("lim")}}`;
    case "limUpp": return `{${part("e")}}^{${part("lim")}}`;
    case "bar": {
      const props = child(n, "barPr");
      const pos = props && child(props, "pos") as Element | undefined;
      return `\\${pos?.getAttribute("m:val") === "bot" ? "underline" : "overline"}{${part("e")}}`;
    }
    case "acc": {
      const props = child(n, "accPr");
      const chr = props && child(props, "chr") as Element | undefined;
      const accents: Record<string, string> = { "̂": "hat", "̅": "bar", "⃗": "vec", "̇": "dot", "̈": "ddot", "̃": "tilde", "̌": "check", "̆": "breve" };
      return `\\${accents[chr?.getAttribute("m:val") ?? "̂"] ?? "hat"}{${part("e")}}`;
    }
    case "groupChr": {
      const props = child(n, "groupChrPr");
      const pos = props && child(props, "pos") as Element | undefined;
      return `\\${pos?.getAttribute("m:val") === "top" ? "overbrace" : "underbrace"}{${part("e")}}`;
    }
    case "nary": {
      const props = child(n, "naryPr");
      const chr = props && child(props, "chr") as Element | undefined;
      const symbol = chr?.getAttribute("m:val") || chr?.getAttribute("val") || "∫";
      return `${symbol}_{${part("sub")}}^{${part("sup")}} ${part("e")}`;
    }
    default:
      if (String(local(n)).endsWith("Pr")) return "";
      return children(n).map(math).join("");
  }
}

function read(n: Node): string {
  const name = local(n);
  if (name === "oMathPara") return `\n\\[${math(child(n, "oMath") ?? n)}\\]\n`;
  if (name === "oMath") return `\\(${math(n)}\\)`;
  if (name === "t") return n.textContent ?? "";
  if (name === "tab") return "\t";
  if (name === "br") return "\n";
  if (name === "tbl") {
    const rows = children(n).filter(c => local(c) === "tr").map(row =>
      children(row).filter(c => local(c) === "tc").flatMap(cell => {
        const props = child(cell, "tcPr");
        const span = props && child(props, "gridSpan") as Element | undefined;
        const count = Math.min(50, Math.max(1, Number(span?.getAttribute("w:val") ?? 1)));
        return [read(cell).trim().replace(/\n/g, " "), ...Array(count - 1).fill("")];
      }).join("\t"));
    return `\n[TABLE: tab-separated cells; each line is one row]\n${rows.join("\n")}\n[END TABLE]\n`;
  }
  if (name && /Pr$/.test(name)) return "";
  return children(n).map(read).join("") + (name === "p" ? "\n" : "");
}

/** Read only document/slide XML; no relationships, macros, network access or OCR. */
export function officeSource(bytes: Uint8Array, kind: "docx" | "pptx"): string {
  let total = 0;
  const files = unzipSync(bytes, { filter: entry => {
    const wanted = kind === "docx" ? entry.name === "word/document.xml" : /^ppt\/slides\/slide\d+\.xml$/.test(entry.name);
    if (wanted) {
      total += entry.originalSize;
      if (total > 20 * 1024 * 1024) throw new Error("Office document XML is too large to process safely");
    }
    return wanted;
  }});
  const names = Object.keys(files).sort((a, b) => Number(a.match(/slide(\d+)/)?.[1] ?? 0) - Number(b.match(/slide(\d+)/)?.[1] ?? 0));
  return names.map((name, i) => {
    const xml = strFromU8(files[name]);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Document contains unsupported XML declarations");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (!doc.documentElement) throw new Error("Office document XML is empty");
    return (kind === "pptx" ? `\n[SLIDE ${i + 1}]\n` : "") + read(doc.documentElement);
  }).join("\n\n");
}