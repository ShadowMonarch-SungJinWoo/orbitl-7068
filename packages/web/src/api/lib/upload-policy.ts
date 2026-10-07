import { ORPCError } from "@orpc/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";

/**
 * Upload abuse controls.
 *
 * Everything here is enforced at **presign**, not at ingest. That is the whole
 * point: presign is where we hand out a writable URL to our bucket, so a file
 * that breaks a rule must never receive one. Checking after the upload means the
 * bytes are already paid for and stored.
 */

/** Only formats the extractor can actually read. Anything else is dead weight. */
const ALLOWED = new Map<string, string[]>([
  ["pdf", ["application/pdf"]],
  ["docx", ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]],
  ["pptx", ["application/vnd.openxmlformats-officedocument.presentationml.presentation"]],
  ["txt", ["text/plain"]],
  ["md", ["text/markdown", "text/plain"]],
  ["markdown", ["text/markdown", "text/plain"]],
  ["csv", ["text/csv", "text/plain", "application/vnd.ms-excel"]],
  ["tsv", ["text/tab-separated-values", "text/plain"]],
  ["json", ["application/json", "text/plain"]],
  ["log", ["text/plain"]],
]);

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_FILES_PER_DAY = 30;
export const MAX_BYTES_PER_DAY = 200 * 1024 * 1024; // 200 MB

export const ALLOWED_EXTENSIONS = [...ALLOWED.keys()];

function extensionOf(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return m ? m[1].toLowerCase() : "";
}

/**
 * Strips path separators and control characters so a filename can never escape
 * its prefix in the object key.
 */
export function safeName(filename: string): string {
  return (
    filename
      .replace(/[\\/]/g, "_")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(-120) || "file"
  );
}

export interface PresignRequest {
  filename: string;
  contentType: string;
  size: number;
}

/**
 * Validates one upload request against the allowlist, the per-file ceiling and
 * the user's daily quota. Throws a user-safe `ORPCError` on any violation.
 */
export async function assertUploadAllowed(userId: string, req: PresignRequest) {
  const ext = extensionOf(req.filename);
  const allowedTypes = ALLOWED.get(ext);

  if (!allowedTypes) {
    throw new ORPCError("BAD_REQUEST", {
      message: `That file type isn't supported. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`,
    });
  }

  // The browser's reported MIME type is advisory, so a mismatch is only rejected
  // when it is a *known* type that disagrees with the extension. Empty or
  // generic values (common on Windows and for .md) are allowed through.
  const claimed = (req.contentType || "").split(";")[0].trim().toLowerCase();
  const generic = !claimed || claimed === "application/octet-stream";
  if (!generic && !allowedTypes.includes(claimed)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That file's type doesn't match its extension.",
    });
  }

  if (!Number.isFinite(req.size) || req.size <= 0) {
    throw new ORPCError("BAD_REQUEST", { message: "That file looks empty." });
  }
  if (req.size > MAX_FILE_BYTES) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Files must be under ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))} MB.`,
    });
  }

  // Rolling 24 hours rather than a calendar day, so a quota can't be doubled by
  // uploading either side of midnight.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [used] = await db
    .select({
      files: sql<number>`count(*)`,
      bytes: sql<number>`coalesce(sum(${s.uploads.bytes}), 0)`,
    })
    .from(s.uploads)
    .where(and(eq(s.uploads.userId, userId), gte(s.uploads.createdAt, since)));

  const files = Number(used?.files ?? 0);
  const bytes = Number(used?.bytes ?? 0);

  if (files >= MAX_FILES_PER_DAY) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: `You've uploaded ${MAX_FILES_PER_DAY} files in the last 24 hours. Try again later.`,
    });
  }
  if (bytes + req.size > MAX_BYTES_PER_DAY) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "You've reached your upload limit for the last 24 hours. Try again later.",
    });
  }

  return { ext, files, bytes };
}

/** Current usage, so the UI can show a quota hint before a file is chosen. */
export async function uploadQuota(userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [used] = await db
    .select({
      files: sql<number>`count(*)`,
      bytes: sql<number>`coalesce(sum(${s.uploads.bytes}), 0)`,
    })
    .from(s.uploads)
    .where(and(eq(s.uploads.userId, userId), gte(s.uploads.createdAt, since)));

  return {
    filesUsed: Number(used?.files ?? 0),
    filesLimit: MAX_FILES_PER_DAY,
    bytesUsed: Number(used?.bytes ?? 0),
    bytesLimit: MAX_BYTES_PER_DAY,
    maxFileBytes: MAX_FILE_BYTES,
    allowedExtensions: ALLOWED_EXTENSIONS,
  };
}
