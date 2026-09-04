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

  // Get organizer ID
  const { rows: orgs } = await client.query("SELECT id FROM public.organizers LIMIT 1");
  const orgId = orgs[0].id;

  // Create a QA test event directly
  const { rows: events } = await client.query(`
    INSERT INTO public.events (
      organizer_id, title, description, category, city, venue_name, venue_address,
      starts_at, ends_at, pricing_mode, fee_payer, status, terms, things_to_know,
      tags, registrations_count, is_featured
    ) VALUES (
      $1, 'QA Test Event — Battle Night', 'Test description', 'CYPHER_BATTLE', 'KOLKATA',
      'Test Venue', '123 Test St', NOW() + INTERVAL '30 days', NOW() + INTERVAL '30 days' + INTERVAL '4 hours',
      'FLAT', 'BUYER', 'PUBLISHED', ARRAY['No refunds'], ARRAY['Bring water'],
      ARRAY['hip-hop'], 0, false
    ) RETURNING id
  `, [orgId]);

  const eventId = events[0].id;
  console.log("Created QA test event:", eventId);

  // Create a tier
  await client.query(`
    INSERT INTO public.ticket_tiers (event_id, name, price_paise, quantity, quantity_sold, tier_type)
    VALUES ($1, 'Entry', 30000, 50, 0, 'FLAT')
  `, [eventId]);
  console.log("Created tier");

  // Check all events
  const { rows: allEvents } = await client.query("SELECT id, title, status FROM public.events ORDER BY created_at");
  console.log("All events:");
  allEvents.forEach(e => console.log(`  ${e.title} (${e.status})`));

  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
