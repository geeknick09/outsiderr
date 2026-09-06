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
  console.log("Enabling Supabase Realtime on key tables...");

  const tables = [
    "public.event_notifications",
    "public.ticket_tiers",
    "public.orders",
    "public.tickets",
  ];

  for (const table of tables) {
    try {
      await dbClient.query(`alter publication supabase_realtime add table ${table}`);
      console.log(`  ✓ ${table} added to supabase_realtime`);
    } catch (err) {
      // "already member of publication" is fine
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already a member") || msg.includes("already member")) {
        console.log(`  ✓ ${table} already in supabase_realtime`);
      } else {
        console.error(`  ✗ ${table}: ${msg}`);
      }
    }
  }

  // Verify
  const { rows } = await dbClient.query(`
    select schemaname, tablename
    from pg_publication_tables
    where pubname = 'supabase_realtime'
    order by tablename
  `);
  console.log("\nCurrent tables in supabase_realtime publication:");
  rows.forEach((r) => console.log(`  ${r.schemaname}.${r.tablename}`));

  await dbClient.end();
})();
