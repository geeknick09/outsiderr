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

  // Check current state
  const { rows: before } = await client.query("SELECT status, title FROM public.events WHERE id = $1", [eventId]);
  console.log("Before:", before[0]);

  // Check if there are any orders for this event
  const { rows: orders } = await client.query("SELECT id, status FROM public.orders WHERE event_id = $1", [eventId]);
  console.log("Orders:", orders);

  // Check if there are tickets
  const { rows: tickets } = await client.query("SELECT id, status FROM public.tickets WHERE event_id = $1", [eventId]);
  console.log("Tickets:", tickets);

  // Try calling cancel_event RPC directly
  try {
    const { data, error } = await client.query("SELECT cancel_event($1, $2, $3) as result", [eventId, "Admin test cancel", 20]);
    console.log("RPC result:", data);
  } catch (err) {
    console.error("RPC error:", err.message);
  }

  // Check after
  const { rows: after } = await client.query("SELECT status, title FROM public.events WHERE id = $1", [eventId]);
  console.log("After:", after[0]);

  await client.end();
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
