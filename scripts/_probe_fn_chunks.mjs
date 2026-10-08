// Dry-run each CREATE OR REPLACE FUNCTION block of fix_all.sql on its own (rolled back)
// and report the ones the live database rejects. Used to find statements that fail the
// whole-bundle apply. Usage: node scripts/_probe_fn_chunks.mjs
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "..", ".env"), "utf-8");
const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();
const dbUrl = envContent.match(/^SUPABASE_DB_URL=(.+)$/m)?.[1]?.trim();
const connectionString = dbUrl || `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

const lines = readFileSync(join(__dirname, "..", "supabase", "migrations", "fix_all.sql"), "utf-8").split("\n");
const starts = [];
lines.forEach((l, i) => { if (/^create or replace function /i.test(l)) starts.push(i); });
starts.push(lines.length);

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
const failures = [];
for (let k = 0; k < starts.length - 1; k++) {
  const chunk = lines.slice(starts[k], starts[k + 1]).join("\n");
  const name = lines[starts[k]].match(/function\s+([\w.]+)/i)?.[1] ?? `#${k}`;
  try {
    await client.query("begin");
    await client.query(chunk);
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  } finally {
    await client.query("rollback");
  }
}
await client.end();
console.log(failures.length ? failures.join("\n") : "every function block applies on its own");
