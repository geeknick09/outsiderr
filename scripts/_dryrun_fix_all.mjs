// Runs the whole fix_all.sql bundle in ONE transaction on the live DB.
// Default: dry run (rolls back). With --apply: commits if it succeeds.
// Usage: node scripts/_dryrun_fix_all.mjs [--apply]
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "..", ".env"), "utf-8");
const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();
const dbUrl = envContent.match(/^SUPABASE_DB_URL=(.+)$/m)?.[1]?.trim();
const connectionString = dbUrl || `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
const apply = process.argv.includes("--apply");

const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "fix_all.sql"), "utf-8");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  await client.query(sql);
  if (apply) {
    await client.query("commit");
    console.log("fix_all.sql APPLIED in one transaction");
  } else {
    await client.query("rollback");
    console.log("dry run OK - whole bundle applies in one transaction (rolled back)");
  }
} catch (err) {
  await client.query("rollback");
  console.error("FAILED - nothing applied:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
