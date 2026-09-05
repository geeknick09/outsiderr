import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");
const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();

const client = new pg.Client({
  connectionString: `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  // Drop BOTH old constraints
  await client.query("alter table public.events drop constraint if exists events_pricing_mode_check");
  console.log("Dropped events_pricing_mode_check");
  await client.query("alter table public.events drop constraint if exists events_pricing_model_check");
  console.log("Dropped events_pricing_model_check");

  // Add single new constraint
  await client.query("alter table public.events add constraint events_pricing_mode_check check (pricing_mode in ('FREE','FLAT','PAID','PHASED'))");
  console.log("Added events_pricing_mode_check (FREE, FLAT, PAID, PHASED)");

  // Verify
  const { rows } = await client.query(`
    SELECT con.conname, pg_get_constraintdef(con.oid) as def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'events' AND con.contype = 'c'
  `);
  console.log("\nConstraints on events:");
  for (const row of rows) console.log(`  ${row.conname}: ${row.def}`);

  await client.end();
  console.log("\n✅ Done.");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
