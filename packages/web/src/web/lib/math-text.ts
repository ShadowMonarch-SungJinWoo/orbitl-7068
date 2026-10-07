/**
 * AI prose (coach insights and their follow-up answers) is instructed never to emit
 * LaTeX, but models slip. This rewrites the common LaTeX they might still produce
 * into the plain whiteboard notation students can actually read, and is applied to
 * model-written text right before rendering.
 */

const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  n: "ⁿ", i: "ⁱ", "+": "⁺", "-": "⁻",
};

const SUBSCRIPTS: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
};

/** Single-token commands with a direct Unicode equivalent. */
const SYMBOLS: Array<[RegExp, string]> = [
  [/\\times\b/g, "×"],
  [/\\div\b/g, "÷"],
  [/\\cdot\b/g, "·"],
  [/\\pm\b/g, "±"],
  [/\\mp\b/g, "∓"],
  [/\\leq?\b/g, "≤"],
  [/\\geq?\b/g, "≥"],
  [/\\neq\b/g, "≠"],
  [/\\approx\b/g, "≈"],
  [/\\equiv\b/g, "≡"],
  [/\\propto\b/g, "∝"],
  [/\\infty\b/g, "∞"],
  [/\\sum\b/g, "∑"],
  [/\\prod\b/g, "∏"],
  [/\\int\b/g, "∫"],
  [/\\partial\b/g, "∂"],
  [/\\nabla\b/g, "∇"],
  [/\\degree\b/g, "°"],
  [/\\circ\b/g, "°"],
  [/\\rightarrow\b|\\to\b|\\Rightarrow\b/g, "→"],
  [/\\leftarrow\b/g, "←"],
  [/\\leftrightarrow\b|\\iff\b/g, "↔"],
  [/\\in\b/g, "∈"],
  [/\\notin\b/g, "∉"],
  [/\\subset\b/g, "⊂"],
  [/\\cup\b/g, "∪"],
  [/\\cap\b/g, "∩"],
  [/\\forall\b/g, "∀"],
  [/\\exists\b/g, "∃"],
  [/\\therefore\b/g, "∴"],
  [/\\alpha\b/g, "α"],
  [/\\beta\b/g, "β"],
  [/\\gamma\b/g, "γ"],
  [/\\Delta\b/g, "Δ"],
  [/\\delta\b/g, "δ"],
  [/\\epsilon\b|\\varepsilon\b/g, "ε"],
  [/\\theta\b/g, "θ"],
  [/\\lambda\b/g, "λ"],
  [/\\mu\b/g, "μ"],
  [/\\pi\b/g, "π"],
  [/\\rho\b/g, "ρ"],
  [/\\sigma\b/g, "σ"],
  [/\\Sigma\b/g, "∑"],
  [/\\tau\b/g, "τ"],
  [/\\phi\b|\\varphi\b/g, "φ"],
  [/\\omega\b/g, "ω"],
  [/\\Omega\b/g, "Ω"],
];

/** Commands that only add typographic noise once the maths is plain text. */
const DROPPED = [
  /\\left\s*/g,
  /\\right\s*/g,
  /\\displaystyle\s*/g,
  /\\limits\b/g,
  /\\!/g,
  /\\,/g,
  /\\;/g,
  /\\:/g,
  /\\quad/g,
  /\\qquad/g,
];

/** Matches a `{...}` group with one level of nesting, which covers real answers. */
const GROUP = "\\{((?:[^{}]|\\{[^{}]*\\})*)\\}";

function toScript(body: string, table: Record<string, string>) {
  const chars = [...body];
  if (chars.every((c) => table[c])) return chars.map((c) => table[c]).join("");
  return null;
}

function rewriteCommands(input: string) {
  let out = input;

  // \frac{a}{b} -> a/b, parenthesised when the parts are not single tokens.
  const frac = new RegExp(`\\\\[dt]?frac\\s*${GROUP}\\s*${GROUP}`, "g");
  for (let i = 0; i < 4; i++) {
    const next = out.replace(frac, (_m, a: string, b: string) => {
      const wrap = (v: string) => (/^[\w.]+$/.test(v.trim()) ? v.trim() : `(${v.trim()})`);
      return `${wrap(a)}/${wrap(b)}`;
    });
    if (next === out) break;
    out = next;
  }

  // \sqrt[3]{x} -> ∛(x), \sqrt{x} -> √(x)
  out = out.replace(new RegExp(`\\\\sqrt\\s*\\[\\s*3\\s*\\]\\s*${GROUP}`, "g"), (_m, a: string) => `∛(${a.trim()})`);
  out = out.replace(new RegExp(`\\\\sqrt\\s*${GROUP}`, "g"), (_m, a: string) =>
    /^[\w.]+$/.test(a.trim()) ? `√${a.trim()}` : `√(${a.trim()})`,
  );

  // \text{...}, \mathrm{...} and friends keep only their content.
  out = out.replace(
    new RegExp(`\\\\(?:text|textbf|textit|mathrm|mathbf|mathit|mathsf|operatorname|bm)\\s*${GROUP}`, "g"),
    (_m, a: string) => a,
  );

  // Superscripts and subscripts.
  out = out.replace(new RegExp(`\\^\\s*${GROUP}`, "g"), (_m, a: string) => toScript(a.trim(), SUPERSCRIPTS) ?? `^(${a.trim()})`);
  out = out.replace(/\^\s*([0-9niN+-])/g, (_m, a: string) => SUPERSCRIPTS[a] ?? `^${a}`);
  out = out.replace(new RegExp(`_\\s*${GROUP}`, "g"), (_m, a: string) => toScript(a.trim(), SUBSCRIPTS) ?? `_(${a.trim()})`);
  out = out.replace(/_\s*([0-9])/g, (_m, a: string) => SUBSCRIPTS[a] ?? `_${a}`);

  for (const [re, sub] of SYMBOLS) out = out.replace(re, sub);
  for (const re of DROPPED) out = out.replace(re, "");

  // Anything still wrapped in braces is now just noise around its content.
  out = out.replace(new RegExp(GROUP, "g"), (_m, a: string) => a);

  return out;
}

/**
 * Strips LaTeX math delimiters and rewrites LaTeX commands to readable plain text.
 * Fenced code blocks are left untouched — a student asking about LaTeX itself, or
 * about code containing backslashes, must still see exactly what they wrote.
 */
export function humanizeMath(text: string): string {
  if (!text) return text;
  if (!/[\\$]/.test(text)) return text;

  const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/g);

  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // code span or fence
      let out = part;

      // Display and inline delimiters -> bare content.
      out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_m, a: string) => `\n${a.trim()}\n`);
      out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_m, a: string) => a.trim());
      out = out.replace(/\$\$([\s\S]*?)\$\$/g, (_m, a: string) => `\n${a.trim()}\n`);
      // Single $ only when it clearly wraps maths, so prices like $12 survive.
      out = out.replace(/(?<![\d$])\$(?!\s)([^$\n]{1,200}?)(?<!\s)\$(?![\d$])/g, (m, a: string) =>
        /[\\^_=+/]|[a-zA-Z]/.test(a) ? a : m,
      );

      return rewriteCommands(out);
    })
    .join("");
}
