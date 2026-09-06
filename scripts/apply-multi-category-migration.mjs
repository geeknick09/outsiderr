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
  console.log("Applying multi-category migration...");

  // Add HIP_HOP_PARTY to enum
  await dbClient.query(`alter type event_category add value if not exists 'HIP_HOP_PARTY'`);
  console.log("  ✓ HIP_HOP_PARTY enum added");

  // Add categories column
  await dbClient.query(`alter table public.events add column if not exists categories text[] not null default '{}'`);
  console.log("  ✓ categories column added");

  // Backfill
  const { rowCount } = await dbClient.query(`update public.events set categories = array[category::text] where array_length(categories, 1) is null or array_length(categories, 1) = 0`);
  console.log(`  ✓ Backfilled ${rowCount} events with categories = [category]`);

  // Verify
  const { rows } = await dbClient.query(`select id, title, category, categories from public.events limit 5`);
  rows.forEach(r => console.log(`    ${r.title}: category=${r.category}, categories=[${r.categories?.join(",")}]`));

  console.log("Done!");
  await dbClient.end();
})();
