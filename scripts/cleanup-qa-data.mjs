/**
 * Clean up old QA test data to prevent double-booking issues.
 */
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
  console.log("Cleaning up old QA test data...");

  // Get QA test event IDs
  const { rows: events } = await dbClient.query(
    "SELECT id FROM public.events WHERE title LIKE 'QA%' OR title LIKE 'QA Critical Flow%'"
  );
  console.log(`Found ${events.length} QA test events`);

  for (const e of events) {
    await dbClient.query("DELETE FROM public.tickets WHERE event_id = $1", [e.id]);
    await dbClient.query("DELETE FROM public.waitlist WHERE tier_id IN (SELECT id FROM public.ticket_tiers WHERE event_id = $1)", [e.id]);
    await dbClient.query("DELETE FROM public.orders WHERE event_id = $1", [e.id]);
    await dbClient.query("DELETE FROM public.hero_boosts WHERE event_id = $1", [e.id]);
    await dbClient.query("DELETE FROM public.ticket_tiers WHERE event_id = $1", [e.id]);
    await dbClient.query("DELETE FROM public.event_notifications WHERE event_id = $1", [e.id]);
    await dbClient.query("DELETE FROM public.events WHERE id = $1", [e.id]);
    console.log(`  Deleted event ${e.id}`);
  }

  // Also clean up any orphaned orders for user1
  const { rows: userRows } = await dbClient.query("SELECT id FROM auth.users WHERE email = 'user1@gmail.com'");
  if (userRows.length > 0) {
    const userId = userRows[0].id;
    const { rows: userOrders } = await dbClient.query("SELECT id FROM public.orders WHERE user_id = $1", [userId]);
    console.log(`\nUser1 has ${userOrders.length} orders`);
    for (const o of userOrders) {
      await dbClient.query("DELETE FROM public.tickets WHERE order_id = $1", [o.id]);
      await dbClient.query("DELETE FROM public.orders WHERE id = $1", [o.id]);
    }
  }

  console.log("\n✅ Cleanup complete");
  await dbClient.end();
}
main().catch(console.error);
