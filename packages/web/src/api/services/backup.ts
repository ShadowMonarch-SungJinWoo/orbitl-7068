import { gzipSync } from "node:zlib";
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getTableName, type Table } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

/**
 * Nightly database backups.
 *
 * Turso keeps its own replicas, but that protects against hardware failure, not
 * against us: a bad migration or a buggy delete is replicated faithfully. These
 * dumps are the thing that makes a mistake recoverable, so they go to the Tigris
 * bucket the app already uses — no new vendor, no new credential.
 *
 * Format is plain gzipped JSON rather than SQL: it restores into any store,
 * survives schema drift, and can be read by hand in an emergency.
 */

const PREFIX = "backups/";
/** Old dumps are pruned so backups cannot grow into a surprise storage bill. */
export const RETENTION_DAYS = 30;

/**
 * Every table in the schema. Listed explicitly rather than reflected so that a
 * new table is a deliberate decision to back up, and a rename fails the
 * typecheck instead of silently dropping data from the dump.
 */
const TABLES: Table[] = [
  schema.subjects,
  schema.topics,
  schema.topicLinks,
  schema.notes,
  schema.flashcards,
  schema.quizzes,
  schema.quizAttempts,
  schema.assignments,
  schema.studySessions,
  schema.gameProfiles,
  schema.xpEvents,
  schema.achievements,
  schema.coachMessages,
  schema.studyGroups,
  schema.groupMembers,
  schema.groupMessages,
  schema.noteComments,
  schema.reviews,
  schema.reviewVotes,
  schema.contentReports,
  schema.uploads,
  schema.aiSpend,
  // Deliberately excluded: rate_limits (ephemeral), error_logs and job_runs
  // (operational noise, not user data worth restoring).
];

export interface BackupResult {
  key: string;
  bytes: number;
  tables: number;
  rows: number;
  durationMs: number;
  pruned: number;
}

/** Runs a full dump and uploads it. Throws on failure so the job records an error. */
export async function runBackup(): Promise<BackupResult> {
  const startedAt = Date.now();
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not configured");

  const { s3 } = await import("../lib/s3");

  const data: Record<string, unknown[]> = {};
  let rows = 0;
  for (const table of TABLES) {
    const name = getTableName(table);
    const result = await db.select().from(table);
    data[name] = result;
    rows += result.length;
  }

  const payload = {
    format: "orbitl.backup.v1",
    createdAt: new Date().toISOString(),
    tables: Object.keys(data).length,
    rows,
    data,
  };

  // Dates serialise to ISO strings, which is what a restore expects to parse.
  const gz = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { level: 9 });
  const key = `${PREFIX}${new Date().toISOString().slice(0, 10)}.json.gz`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: gz,
      ContentType: "application/gzip",
      ContentEncoding: "gzip",
    }),
  );

  const pruned = await pruneBackups();

  return { key, bytes: gz.byteLength, tables: Object.keys(data).length, rows, durationMs: Date.now() - startedAt, pruned };
}

/** Deletes dumps older than the retention window. Never throws. */
export async function pruneBackups(): Promise<number> {
  try {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) return 0;
    const { s3 } = await import("../lib/s3");

    const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX }));
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const stale = (listed.Contents ?? []).filter((o) => (o.LastModified?.getTime() ?? Date.now()) < cutoff && o.Key);
    if (!stale.length) return 0;

    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: stale.map((o) => ({ Key: o.Key as string })) },
      }),
    );
    return stale.length;
  } catch (err) {
    console.error("[backup] prune failed:", err);
    return 0;
  }
}

export interface BackupListItem {
  key: string;
  size: number;
  lastModified: string | null;
}

/** Existing dumps, newest first — shown on the admin dashboard. */
export async function listBackups(limit = 40): Promise<BackupListItem[]> {
  try {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) return [];
    const { s3 } = await import("../lib/s3");
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX }));
    return (listed.Contents ?? [])
      .filter((o) => o.Key)
      .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
      .slice(0, limit)
      .map((o) => ({
        key: o.Key as string,
        size: o.Size ?? 0,
        lastModified: o.LastModified?.toISOString() ?? null,
      }));
  } catch (err) {
    console.error("[backup] list failed:", err);
    return [];
  }
}

/**
 * Short-lived download link for one dump. Backups contain every user's data, so
 * the URL expires quickly and is only ever handed to an admin.
 */
export async function backupDownloadUrl(key: string): Promise<string> {
  if (!key.startsWith(PREFIX)) throw new Error("Not a backup key");
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not configured");
  const { s3 } = await import("../lib/s3");
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 300 });
}
