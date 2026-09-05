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

  // Get enum values for event_category
  const { rows: enums } = await client.query(`
    SELECT t.typname, e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname IN ('event_category', 'city', 'fee_payer')
    ORDER BY t.typname, e.enumsortorder
  `);
  console.log("Enum values:");
  for (const row of enums) {
    console.log(`  ${row.typname}: ${row.enumlabel}`);
  }

  // Get column types for events
  const { rows: cols } = await client.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name = 'events' AND table_schema = 'public'
    AND column_name IN ('category', 'city', 'fee_payer', 'pricing_mode', 'status')
    ORDER BY column_name
  `);
  console.log("\nColumn types:");
  for (const row of cols) {
    console.log(`  ${row.column_name}: ${row.data_type} (${row.udt_name})`);
  }

  await client.end();
}

main().catch(console.error);
