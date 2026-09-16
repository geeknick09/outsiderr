// Restore a database backup from Supabase Storage.
//
// Usage:
//   node scripts/_restore_backup.mjs <backup-path>
//
// Example:
//   node scripts/_restore_backup.mjs daily/2026-09-15-02-00-00.json.gz
//
// This downloads the backup, decompresses it, and upserts rows back
// into the database using the service-role client.
//
// WARNING: This overwrites current data. Use with caution.
// Always test on a staging database first.
import { gunzipSync } from "zlib";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const backupPath = process.argv[2];
if (!backupPath) {
  console.error("Usage: node scripts/_restore_backup.mjs <backup-path>");
  console.error("Example: node scripts/_restore_backup.mjs daily/2026-09-15-02-00-00.json.gz");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

async function main() {
  console.log(`Downloading backup: ${backupPath}...`);

  const { data, error } = await supabase.storage.from("backups").download(backupPath);
  if (error || !data) {
    console.error("Failed to download backup:", error?.message ?? "no data");
    process.exit(1);
  }

  console.log("Decompressing...");
  const compressed = Buffer.from(await data.arrayBuffer());
  const decompressed = gunzipSync(compressed);
  const backup = JSON.parse(decompressed.toString("utf-8"));

  console.log(`\nBackup metadata:`);
  console.log(`  Created: ${backup.metadata.createdAt}`);
  console.log(`  Tables: ${backup.metadata.tableCount}`);
  console.log(`  Total rows: ${backup.metadata.totalRows}`);
  console.log(`  Type: ${backup.metadata.type}`);

  console.log("\nTables in backup:");
  for (const [table, rows] of Object.entries(backup.tables)) {
    console.log(`  ${table}: ${rows.length} rows`);
  }

  console.log("\n⚠️  This will OVERWRITE current data in these tables.");
  console.log("Press Ctrl+C to cancel, or wait 5 seconds...");

  await new Promise((r) => setTimeout(r, 5000));

  // Restore in reverse dependency order (children before parents)
  // to avoid FK constraint violations during upsert.
  const tableOrder = [
    "door_staff_orders",
    "club_members",
    "clubs",
    "payout_records",
    "payment_ledger",
    "hero_boosts",
    "boost_slot_prices",
    "boosts",
    "box_office_pins",
    "scanner_pins",
    "event_staff",
    "event_terms_acceptances",
    "legal_pages",
    "admin_change_log",
    "platform_settings",
    "refunds",
    "waitlist",
    "tickets",
    "orders",
    "ticket_tiers",
    "events",
    "organizers",
    "profiles",
  ];

  for (const table of tableOrder) {
    const rows = backup.tables[table];
    if (!rows || rows.length === 0) {
      console.log(`  ${table}: skipped (no rows)`);
      continue;
    }

    console.log(`  ${table}: upserting ${rows.length} rows...`);

    // Upsert in batches of 500 to avoid payload limits
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
      if (error) {
        console.error(`    Error upserting ${table} rows ${i}-${i + batch.length}: ${error.message}`);
        // Continue with next batch — partial restore is better than none
      }
    }
  }

  console.log("\n✓ Restore complete.");
  console.log("\nNOTE: Sequences (auto-increment IDs) may need to be reset.");
  console.log("Run this in the Supabase SQL Editor if you encounter issues:");
  console.log("  SELECT setval('invoice_number_seq', (SELECT MAX(id) FROM orders));");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
