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
  console.log("Connected. Cleaning up test data...");

  await client.query("DELETE FROM public.tickets");
  await client.query("DELETE FROM public.refunds");
  await client.query("DELETE FROM public.event_notifications");
  await client.query("DELETE FROM public.hero_boosts");
  await client.query("DELETE FROM public.orders");
  await client.query("DELETE FROM public.club_members");
  await client.query("DELETE FROM public.events WHERE title LIKE 'QA Test%'");

  // Reset remaining events to PUBLISHED and reset counts
  await client.query("UPDATE public.events SET status = 'PUBLISHED', registrations_count = 0, is_featured = false");
  await client.query("UPDATE public.ticket_tiers SET quantity_sold = 0");
  await client.query("UPDATE public.clubs SET member_count = 0");

  // Update remaining events to future dates
  await client.query("UPDATE public.events SET starts_at = NOW() + INTERVAL '30 days', ends_at = NOW() + INTERVAL '30 days' + INTERVAL '4 hours' WHERE pricing_mode = 'FREE'");
  await client.query("UPDATE public.events SET starts_at = NOW() + INTERVAL '45 days', ends_at = NOW() + INTERVAL '45 days' + INTERVAL '4 hours' WHERE pricing_mode = 'PAID'");

  // Check if seed events exist, create them if not
  const { rows: existingEvents } = await client.query("SELECT id, title FROM public.events");
  console.log(`Found ${existingEvents.length} existing events`);

  if (existingEvents.length === 0) {
    console.log("Creating seed events...");

    // Get organizer ID
    const { rows: orgs } = await client.query("SELECT id FROM public.organizers LIMIT 1");
    const orgId = orgs[0].id;

    // Create free event
    const { rows: freeEvent } = await client.query(`
      INSERT INTO public.events (
        organizer_id, title, description, category, city, venue_name, venue_address,
        starts_at, ends_at, pricing_mode, fee_payer, status, terms, things_to_know,
        tags, registrations_count, is_featured
      ) VALUES (
        $1, 'Free Cypher Session - Mumbai', 'Open cypher for all hip-hop heads.', 'CYPHER_BATTLE', 'MUMBAI',
        'Marine Drive', 'Marine Drive, Mumbai', NOW() + INTERVAL '30 days', NOW() + INTERVAL '30 days' + INTERVAL '4 hours',
        'FREE', 'ORGANIZER', 'PUBLISHED', ARRAY['No refunds'], ARRAY['Bring water'],
        ARRAY['hip-hop'], 0, false
      ) RETURNING id
    `, [orgId]);
    await client.query(`
      INSERT INTO public.ticket_tiers (event_id, name, price_paise, quantity, quantity_sold, tier_type)
      VALUES ($1, 'Entry', 0, 100, 0, 'FLAT')
    `, [freeEvent[0].id]);

    // Create paid event
    const { rows: paidEvent } = await client.query(`
      INSERT INTO public.events (
        organizer_id, title, description, category, city, venue_name, venue_address,
        starts_at, ends_at, pricing_mode, fee_payer, status, terms, things_to_know,
        tags, registrations_count, is_featured
      ) VALUES (
        $1, 'Underground Dance Battle - Delhi', '1v1 dance battle. Rs 500 entry.', 'CYPHER_BATTLE', 'DELHI',
        'Connaught Place', 'Connaught Place, Delhi', NOW() + INTERVAL '45 days', NOW() + INTERVAL '45 days' + INTERVAL '4 hours',
        'FLAT', 'BUYER', 'PUBLISHED', ARRAY['No refunds'], ARRAY['Bring water'],
        ARRAY['hip-hop'], 0, false
      ) RETURNING id
    `, [orgId]);
    await client.query(`
      INSERT INTO public.ticket_tiers (event_id, name, price_paise, quantity, quantity_sold, tier_type)
      VALUES ($1, 'Entry', 50000, 20, 0, 'FLAT')
    `, [paidEvent[0].id]);

    console.log("✅ Seed events created");
  }

  console.log("✅ Cleanup complete");
  const { rows: finalEvents } = await client.query("SELECT id, title, status, pricing_mode FROM public.events");
  finalEvents.forEach(e => console.log(`  ${e.title} (${e.status}, ${e.pricing_mode})`));

  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
