// Applies ONLY the Phase 0 create_walkin_order block of fix_all.sql to the live DB,
// in one transaction. The full bundle does not currently apply in one shot (see
// docs/memory.md, 2026-10-09); this keeps the walk-in fix deployable on its own.
// Usage: node scripts/_apply_phase0_walkin.mjs
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "..", ".env"), "utf-8");
const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();
const dbUrl = envContent.match(/^SUPABASE_DB_URL=(.+)$/m)?.[1]?.trim();
const connectionString = dbUrl || `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

const full = readFileSync(join(__dirname, "..", "supabase", "migrations", "fix_all.sql"), "utf-8");
const marker = "-- Phase 0 (box-office redesign): counter walk-in sales.";
const at = full.indexOf(marker);
if (at < 0) throw new Error("Phase 0 block marker not found in fix_all.sql");
const block = full.slice(at);

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  await client.query(block);
  await client.query("commit");
  console.log("applied create_walkin_order (Phase 0) to the live database");
} catch (err) {
  await client.query("rollback");
  console.error("NOT applied:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
