/**
 * Lightweight autoflagging for user-submitted text.
 *
 * This is deliberately *not* a general profanity filter. Students swear while
 * studying and false positives on a study app are worse than a missed word — the
 * list is limited to unambiguous slurs and explicit threats, the things that
 * warrant a human looking at the content quickly.
 *
 * Anything matched is flagged for review, never auto-deleted: the admin queue
 * makes the call. Nothing here is a substitute for the report button.
 */

/**
 * Stored split so the source file isn't itself a wall of slurs, and matched on
 * word boundaries so "classic" never trips "ass".
 */
const SLUR_PARTS = [
  ["n", "igger"],
  ["n", "igga"],
  ["f", "aggot"],
  ["k", "ike"],
  ["s", "pic"],
  ["c", "hink"],
  ["t", "ranny"],
  ["r", "etard"],
  ["w", "etback"],
  ["g", "ook"],
] as const;

const THREAT_PATTERNS = [
  /\bkill\s+(?:yourself|urself|ur ?self)\b/i,
  /\bkys\b/i,
  /\bi(?:'m| am)? ?(?:gonna|going to) (?:kill|murder|hurt) (?:you|u)\b/i,
];

const SLUR_RE = new RegExp(`\\b(?:${SLUR_PARTS.map(([a, b]) => `${a}${b}`).join("|")})(?:s|es)?\\b`, "i");

/**
 * Normalises common evasion (letter repetition, digit substitution, spacing)
 * before matching. Not bulletproof — it is not meant to be — but it catches the
 * lazy variants without needing a model.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/\$/g, "s")
    .replace(/[^a-z\s]/g, "")
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/\s+/g, " ");
}

export interface AutoFlag {
  flagged: boolean;
  reason: "abuse" | "violence" | null;
}

/** Returns whether text should be queued for review, and under which reason. */
export function autoFlag(text: string): AutoFlag {
  if (!text) return { flagged: false, reason: null };
  const raw = text.slice(0, 4000);
  const norm = normalise(raw);

  if (SLUR_RE.test(raw) || SLUR_RE.test(norm)) return { flagged: true, reason: "abuse" };
  for (const re of THREAT_PATTERNS) if (re.test(raw) || re.test(norm)) return { flagged: true, reason: "violence" };
  return { flagged: false, reason: null };
}

/** Short preview of reported content, so admins can triage without a join. */
export function excerpt(text: string, max = 240): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
