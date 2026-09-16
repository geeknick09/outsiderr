import { gzipSync } from "zlib";

import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

/**
 * Application-level database backup.
 *
 * Exports critical tables as JSON via the Supabase service-role client,
 * compresses with gzip, and uploads to a private Supabase Storage bucket.
 *
 * This is NOT a true pg_dump — it does not capture schema, indexes, RLS
 * policies, RPCs, or triggers. It captures the DATA in the critical tables.
 * For schema, rely on `supabase/schema.sql` (version-controlled).
 *
 * Restore: parse the JSON and upsert rows back via the service client,
 * or use it as a reference to rebuild from `schema.sql` + data.
 *
 * Retention: keeps the last 7 daily backups and 4 weekly backups.
 * Older backups are deleted automatically.
 */

const BACKUP_BUCKET = "backups";

/**
 * Tables to export, in dependency order (parents before children).
 * Excludes volatile/log tables that don't need backup:
 * - webhook_events (transient, processed events)
 * - push_subscriptions (regenerable from user sessions)
 * - event_notifications (transient)
 */
const BACKUP_TABLES = [
  "profiles",
  "organizers",
  "events",
  "ticket_tiers",
  "orders",
  "tickets",
  "waitlist",
  "refunds",
  "platform_settings",
  "admin_change_log",
  "legal_pages",
  "event_terms_acceptances",
  "event_staff",
  "scanner_pins",
  "box_office_pins",
  "boosts",
  "boost_slot_prices",
  "hero_boosts",
  "payment_ledger",
  "payout_records",
  "clubs",
  "club_members",
  "door_staff_orders",
] as const;

export interface BackupResult {
  success: boolean;
  tableCount: number;
  totalRows: number;
  sizeBytes: number;
  backupKey: string | null;
  error?: string;
  duration: number;
}

/**
 * Export all critical tables as a single JSON object.
 * Each table is keyed by name, value is an array of rows.
 */
async function exportTables(): Promise<{
  data: Record<string, unknown[]>;
  totalRows: number;
  tableCount: number;
}> {
  const supabase = createServiceClient();
  const data: Record<string, unknown[]> = {};
  let totalRows = 0;

  for (const table of BACKUP_TABLES) {
    // Fetch all rows in pages of 1000 to avoid timeout on large tables
    const allRows: unknown[] = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data: rows, error } = await supabase
        .from(table)
        .select("*")
        .range(from, from + pageSize - 1);

      if (error) {
        logger.error({ table, error: error.message }, "backup: failed to export table");
        // Continue with other tables — partial backup is better than none
        break;
      }

      if (!rows || rows.length === 0) {
        break;
      }

      allRows.push(...rows);
      totalRows += rows.length;

      if (rows.length < pageSize) {
        break; // Last page
      }
      from += pageSize;
    }

    data[table] = allRows;
    logger.info({ table, rows: allRows.length }, "backup: table exported");
  }

  return { data, totalRows, tableCount: Object.keys(data).length };
}

/**
 * Ensure the private "backups" storage bucket exists.
 * Creates it if missing. Bucket is PRIVATE — only service-role can read.
 */
async function ensureBackupBucket(): Promise<void> {
  const supabase = createServiceClient();
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets ?? []).some((b) => b.id === BACKUP_BUCKET);

  if (!exists) {
    const { error } = await supabase.storage.createBucket(BACKUP_BUCKET, {
      public: false,
      fileSizeLimit: 100 * 1024 * 1024, // 100MB per file
    });
    if (error) {
      logger.error({ error: error.message }, "backup: failed to create bucket");
      throw new Error(`Failed to create backup bucket: ${error.message}`);
    }
    logger.info({ bucket: BACKUP_BUCKET }, "backup: bucket created");
  }
}

/**
 * Run a full database backup and upload to Supabase Storage.
 *
 * @param type - "daily" or "weekly" (controls retention policy)
 * @returns BackupResult with metadata
 */
export async function runBackup(type: "daily" | "weekly" = "daily"): Promise<BackupResult> {
  const start = Date.now();
  logger.info({ type }, "backup: starting");

  try {
    await ensureBackupBucket();

    const { data, totalRows, tableCount } = await exportTables();

    // Build the backup object with metadata
    const backup = {
      metadata: {
        version: 1,
        type,
        createdAt: new Date().toISOString(),
        tableCount,
        totalRows,
      },
      tables: data,
    };

    // Serialize and compress
    const jsonBytes = Buffer.from(JSON.stringify(backup), "utf-8");
    const compressed = gzipSync(jsonBytes);
    const sizeBytes = compressed.length;

    // Upload to storage with date-stamped filename
    const dateStr = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    const backupKey = `${type}/${dateStr}.json.gz`;

    const supabase = createServiceClient();
    const { error: uploadError } = await supabase.storage
      .from(BACKUP_BUCKET)
      .upload(backupKey, compressed, {
        contentType: "application/gzip",
        upsert: false,
      });

    if (uploadError) {
      logger.error({ error: uploadError.message, backupKey }, "backup: upload failed");
      return {
        success: false,
        tableCount,
        totalRows,
        sizeBytes,
        backupKey: null,
        error: uploadError.message,
        duration: Date.now() - start,
      };
    }

    logger.info({ backupKey, sizeBytes, totalRows, tableCount }, "backup: uploaded");

    // Apply retention policy
    await applyRetentionPolicy(type);

    return {
      success: true,
      tableCount,
      totalRows,
      sizeBytes,
      backupKey,
      duration: Date.now() - start,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.error({ error, type }, "backup: failed");
    return {
      success: false,
      tableCount: 0,
      totalRows: 0,
      sizeBytes: 0,
      backupKey: null,
      error,
      duration: Date.now() - start,
    };
  }
}

/**
 * Delete old backups beyond the retention window.
 * - Daily: keep last 7
 * - Weekly: keep last 4
 */
async function applyRetentionPolicy(type: "daily" | "weekly"): Promise<void> {
  const keepCount = type === "daily" ? 7 : 4;
  const supabase = createServiceClient();

  const { data: files, error } = await supabase.storage
    .from(BACKUP_BUCKET)
    .list(type, {
      sortBy: { column: "name", order: "desc" }, // newest first
    });

  if (error || !files) {
    logger.warn({ type, error: error?.message }, "backup: failed to list old backups");
    return;
  }

  // Files beyond the keep count are candidates for deletion
  const toDelete = files.slice(keepCount);
  if (toDelete.length === 0) return;

  const paths = toDelete.map((f) => `${type}/${f.name}`);
  const { error: delError } = await supabase.storage.from(BACKUP_BUCKET).remove(paths);

  if (delError) {
    logger.warn({ type, error: delError.message, count: toDelete.length }, "backup: failed to delete old backups");
  } else {
    logger.info({ type, deleted: toDelete.length, kept: keepCount }, "backup: retention applied");
  }
}

/**
 * List all available backups in storage.
 */
export async function listBackups(type?: "daily" | "weekly"): Promise<
  Array<{ name: string; size: number; type: string; createdAt: string }>
> {
  const supabase = createServiceClient();
  const types = type ? [type] : ["daily", "weekly"];
  const results: Array<{ name: string; size: number; type: string; createdAt: string }> = [];

  for (const t of types) {
    const { data: files } = await supabase.storage.from(BACKUP_BUCKET).list(t);
    for (const f of files ?? []) {
      results.push({
        name: `${t}/${f.name}`,
        size: f.metadata?.size ?? 0,
        type: t,
        createdAt: f.created_at ?? "",
      });
    }
  }

  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Download a backup file from storage.
 * Returns the raw gzip buffer — caller must gunzip and parse JSON.
 */
export async function downloadBackup(path: string): Promise<Buffer | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(BACKUP_BUCKET).download(path);

  if (error || !data) {
    logger.error({ path, error: error?.message }, "backup: download failed");
    return null;
  }

  // Convert Blob to Buffer
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
