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
  const eventId = "ac814e20-ca36-4b8b-a094-ada141354d3b";

  // Check for foreign key constraints
  const { rows: constraints } = await client.query(`
    SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE ccu.table_name = 'events' AND tc.constraint_type = 'FOREIGN KEY'
  `);
  console.log("Foreign keys referencing events:");
  constraints.forEach(c => console.log(`  ${c.table_name}.${c.column_name}`));

  // Check what references this event
  const { rows: orders } = await client.query("SELECT count(*) as cnt FROM public.orders WHERE event_id = $1", [eventId]);
  console.log("Orders:", orders[0].cnt);

  const { rows: tickets } = await client.query("SELECT count(*) as cnt FROM public.tickets WHERE event_id = $1", [eventId]);
  console.log("Tickets:", tickets[0].cnt);

  const { rows: tiers } = await client.query("SELECT count(*) as cnt FROM public.ticket_tiers WHERE event_id = $1", [eventId]);
  console.log("Tiers:", tiers[0].cnt);

  const { rows: notifs } = await client.query("SELECT count(*) as cnt FROM public.event_notifications WHERE event_id = $1", [eventId]);
  console.log("Notifications:", notifs[0].cnt);

  const { rows: refunds } = await client.query("SELECT count(*) as cnt FROM public.refunds WHERE event_id = $1", [eventId]);
  console.log("Refunds:", refunds[0].cnt);

  // Try deleting directly (as superuser)
  try {
    await client.query("DELETE FROM public.events WHERE id = $1", [eventId]);
    console.log("✅ Direct delete succeeded");
  } catch (err) {
    console.error("❌ Direct delete failed:", err.message);
  }

  await client.end();
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
