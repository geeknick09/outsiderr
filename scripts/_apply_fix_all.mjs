// Apply fix_all.sql to the live Supabase database via direct pg connection.
// Usage: node scripts/_apply_fix_all.mjs
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");

const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();
const dbUrl = envContent.match(/^SUPABASE_DB_URL=(.+)$/m)?.[1]?.trim();

if (!dbPassword && !dbUrl) {
  console.error("Missing SUPABASE_DB_PASSWORD or SUPABASE_DB_URL in .env");
  process.exit(1);
}

const connectionString = dbUrl || `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

const sqlPath = join(__dirname, "..", "supabase", "migrations", "fix_all.sql");
const sql = readFileSync(sqlPath, "utf-8");

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connected to database. Applying fix_all.sql...\n");

  try {
    await client.query(sql);
    console.log("✅ fix_all.sql applied successfully!\n");
  } catch (err) {
    // Some statements may fail if they already exist — that's OK with idempotent SQL
    // But if it's a real error, show it
    console.error("❌ Error applying fix_all.sql:");
    console.error(err.message);
    if (err.where) console.error("At:", err.where);
    // Don't exit — some statements may have succeeded
  }

  // Verify key changes
  console.log("Verifying migration...\n");

  const checks = [
    {
      name: "orders.idempotency_key column",
      query: "SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='idempotency_key'",
    },
    {
      name: "scanner_pins.pin_hash column",
      query: "SELECT column_name FROM information_schema.columns WHERE table_name='scanner_pins' AND column_name='pin_hash'",
    },
    {
      name: "box_office_pins.pin_hash column",
      query: "SELECT column_name FROM information_schema.columns WHERE table_name='box_office_pins' AND column_name='pin_hash'",
    },
    {
      name: "backups storage bucket",
      query: "SELECT id FROM storage.buckets WHERE id='backups'",
    },
    {
      name: "create_walkin_order RPC exists",
      query: "SELECT proname FROM pg_proc WHERE proname='create_walkin_order'",
    },
    {
      name: "verify_scanner_pin RPC exists",
      query: "SELECT proname FROM pg_proc WHERE proname='verify_scanner_pin'",
    },
    {
      name: "verify_box_office_pin RPC exists",
      query: "SELECT proname FROM pg_proc WHERE proname='verify_box_office_pin'",
    },
    {
      name: "check_in_ticket RPC exists",
      query: "SELECT proname FROM pg_proc WHERE proname='check_in_ticket'",
    },
    {
      name: "cancel_event RPC exists",
      query: "SELECT proname FROM pg_proc WHERE proname='cancel_event'",
    },
    {
      name: "confirm_razorpay_order RPC exists",
      query: "SELECT proname FROM pg_proc WHERE proname='confirm_razorpay_order'",
    },
  ];

  let allPassed = true;
  for (const check of checks) {
    try {
      const { rows } = await client.query(check.query);
      const passed = rows.length > 0;
      const icon = passed ? "✅" : "❌";
      console.log(`${icon} ${check.name}: ${passed ? "OK" : "MISSING"}`);
      if (!passed) allPassed = false;
    } catch (err) {
      console.log(`⚠️  ${check.name}: ${err.message}`);
      allPassed = false;
    }
  }

  // Check unique indexes
  console.log("\nChecking indexes...\n");
  const indexChecks = [
    {
      name: "orders.idempotency_key unique index",
      query: "SELECT indexname FROM pg_indexes WHERE tablename='orders' AND indexname LIKE '%idempotency%'",
    },
    {
      name: "scanner_pins.pin_hash unique index",
      query: "SELECT indexname FROM pg_indexes WHERE tablename='scanner_pins' AND indexname LIKE '%pin_hash%'",
    },
    {
      name: "box_office_pins.pin_hash unique index",
      query: "SELECT indexname FROM pg_indexes WHERE tablename='box_office_pins' AND indexname LIKE '%pin_hash%'",
    },
  ];

  for (const check of indexChecks) {
    try {
      const { rows } = await client.query(check.query);
      const passed = rows.length > 0;
      const icon = passed ? "✅" : "❌";
      console.log(`${icon} ${check.name}: ${passed ? rows.map(r => r.indexname).join(", ") : "MISSING"}`);
      if (!passed) allPassed = false;
    } catch (err) {
      console.log(`⚠️  ${check.name}: ${err.message}`);
    }
  }

  console.log(`\n${allPassed ? "✅ All checks passed!" : "⚠️  Some checks failed — review above"}`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
