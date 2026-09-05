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
  console.log("Dropping old constraint and adding new one...");

  await client.query("alter table public.events drop constraint if exists events_pricing_model_check");
  console.log("  Old constraint dropped");

  await client.query("alter table public.events add constraint events_pricing_model_check check (pricing_mode in ('FREE','FLAT','PAID','PHASED'))");
  console.log("  New constraint added (FREE, FLAT, PAID, PHASED)");

  // Verify
  const { rows } = await client.query(`
    SELECT con.conname, pg_get_constraintdef(con.oid) as def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'events' AND con.conname = 'events_pricing_model_check'
  `);
  console.log("\nVerification:", rows[0]?.def);

  await client.end();
  console.log("\n✅ Done. PHASED pricing mode is now allowed.");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
