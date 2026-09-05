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

  // Check all constraints on events table
  const { rows } = await client.query(`
    SELECT con.conname, pg_get_constraintdef(con.oid) as def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'events' AND con.contype = 'c'
  `);
  console.log("Check constraints on events table:");
  for (const row of rows) {
    console.log(`  ${row.conname}: ${row.def}`);
  }

  // Try inserting a test row with PHASED
  try {
    await client.query("BEGIN");
    await client.query(`
      INSERT INTO public.events (
        organizer_id, title, description, category, city,
        venue_name, venue_address, starts_at, ends_at,
        fee_payer, pricing_mode, status
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        'TEST PHASED', 'test', 'CYPHER', 'KOLKATA',
        'Test', 'Test', NOW() + INTERVAL '30 days', NOW() + INTERVAL '30 days' + INTERVAL '4 hours',
        'BUYER', 'PHASED', 'PUBLISHED'
      )
    `);
    console.log("\n✅ PHASED insert succeeded!");
    await client.query("ROLLBACK");
  } catch (err) {
    console.log("\n❌ PHASED insert failed:", err.message);
    await client.query("ROLLBACK");
  }

  await client.end();
}

main().catch(console.error);
