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

async function main() {
  await dbClient.connect();
  const { rows } = await dbClient.query(`
    SELECT p.proname, pg_get_function_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname IN ('check_in_ticket', 'create_paid_order', 'create_free_order')
    ORDER BY p.proname
  `);
  for (const r of rows) console.log(`${r.proname}(${r.args})`);

  // Also check a ticket's status
  const { rows: tickets } = await dbClient.query(`
    SELECT t.id, t.qr_hash, t.status, t.event_id, e.title
    FROM public.tickets t
    JOIN public.events e ON e.id = t.event_id
    ORDER BY t.created_at DESC LIMIT 5
  `);
  console.log("\nRecent tickets:");
  for (const t of tickets) console.log(`  ${t.title} | status=${t.status} | hash=${t.qr_hash?.substring(0,20)}...`);

  await dbClient.end();
}
main().catch(console.error);
