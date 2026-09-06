import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");
const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();

const dbClient = new pg.Client({
  connectionString: `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await dbClient.connect();

  // Check profiles columns
  const { rows: cols } = await dbClient.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'gender'
  `);

  if (cols.length === 0) {
    console.log("❌ gender column does NOT exist in profiles table!");
    console.log("   Run: alter table public.profiles add column if not exists gender text;");
  } else {
    console.log("✅ gender column exists:");
    console.log(`   ${cols[0].column_name}: ${cols[0].data_type}, nullable: ${cols[0].is_nullable}`);
  }

  // Check if the check constraint exists
  const { rows: constraints } = await dbClient.query(`
    SELECT con.conname, pg_get_constraintdef(con.oid) as def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'profiles' AND con.contype = 'c'
  `);
  console.log("\nCheck constraints on profiles:");
  for (const c of constraints) {
    console.log(`  ${c.conname}: ${c.def}`);
  }

  await dbClient.end();
})().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
