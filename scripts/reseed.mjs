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

  // Clean up all transactional data
  await client.query("DELETE FROM public.tickets");
  await client.query("DELETE FROM public.refunds");
  await client.query("DELETE FROM public.event_notifications");
  await client.query("DELETE FROM public.hero_boosts");
  await client.query("DELETE FROM public.orders");
  await client.query("DELETE FROM public.club_members");
  await client.query("DELETE FROM public.waitlist");
  await client.query("DELETE FROM public.door_staff_orders");
  await client.query("DELETE FROM public.events WHERE title LIKE 'QA Test%'");
  await client.query("DELETE FROM public.clubs WHERE name LIKE 'QA Test%'");

  // Reset remaining events
  await client.query("UPDATE public.events SET status = 'PUBLISHED', registrations_count = 0, is_featured = false");
  await client.query("UPDATE public.ticket_tiers SET quantity_sold = 0");
  await client.query("UPDATE public.clubs SET member_count = 0, verified = true WHERE name = 'Mumbai Hip-Hop Crew'");

  // Update remaining events to future dates
  await client.query("UPDATE public.events SET starts_at = NOW() + INTERVAL '30 days', ends_at = NOW() + INTERVAL '30 days' + INTERVAL '4 hours' WHERE pricing_mode = 'FREE'");
  await client.query("UPDATE public.events SET starts_at = NOW() + INTERVAL '45 days', ends_at = NOW() + INTERVAL '45 days' + INTERVAL '4 hours' WHERE pricing_mode = 'PAID' OR pricing_mode = 'FLAT'");

  // Create seed events if none exist
  const { rows: existingEvents } = await client.query("SELECT id, title FROM public.events");
  console.log(`Found ${existingEvents.length} existing events`);

  if (existingEvents.length === 0) {
    console.log("Creating seed events...");
    const { rows: orgs } = await client.query("SELECT id FROM public.organizers LIMIT 1");
    const orgId = orgs[0].id;

    // Free event
    const { rows: freeEvent } = await client.query(`
      INSERT INTO public.events (organizer_id, title, description, category, city, venue_name, venue_address, starts_at, ends_at, pricing_mode, fee_payer, status, terms, things_to_know, tags, registrations_count, is_featured)
      VALUES ($1, 'Free Cypher Session - Mumbai', 'Open cypher for all hip-hop heads.', 'CYPHER_BATTLE', 'MUMBAI', 'Marine Drive', 'Marine Drive, Mumbai', NOW() + INTERVAL '30 days', NOW() + INTERVAL '30 days' + INTERVAL '4 hours', 'FREE', 'ORGANIZER', 'PUBLISHED', ARRAY['No refunds'], ARRAY['Bring water'], ARRAY['hip-hop'], 0, false)
      RETURNING id
    `, [orgId]);
    await client.query(`INSERT INTO public.ticket_tiers (event_id, name, price_paise, quantity, quantity_sold, tier_type) VALUES ($1, 'Entry', 0, 100, 0, 'FLAT')`, [freeEvent[0].id]);

    // Paid event
    const { rows: paidEvent } = await client.query(`
      INSERT INTO public.events (organizer_id, title, description, category, city, venue_name, venue_address, starts_at, ends_at, pricing_mode, fee_payer, status, terms, things_to_know, tags, registrations_count, is_featured)
      VALUES ($1, 'Underground Dance Battle - Delhi', '1v1 dance battle. Rs 500 entry.', 'CYPHER_BATTLE', 'DELHI', 'Connaught Place', 'Connaught Place, Delhi', NOW() + INTERVAL '45 days', NOW() + INTERVAL '45 days' + INTERVAL '4 hours', 'FLAT', 'BUYER', 'PUBLISHED', ARRAY['No refunds'], ARRAY['Bring water'], ARRAY['hip-hop'], 0, false)
      RETURNING id
    `, [orgId]);
    await client.query(`INSERT INTO public.ticket_tiers (event_id, name, price_paise, quantity, quantity_sold, tier_type) VALUES ($1, 'Entry', 50000, 20, 0, 'FLAT')`, [paidEvent[0].id]);
    console.log("✅ Seed events created");
  }

  // Create a sold-out event for waitlist testing
  const { rows: orgs2 } = await client.query("SELECT id FROM public.organizers LIMIT 1");
  const orgId2 = orgs2[0].id;
  const { rows: soldOutEvent } = await client.query(`
    INSERT INTO public.events (organizer_id, title, description, category, city, venue_name, venue_address, starts_at, ends_at, pricing_mode, fee_payer, status, terms, things_to_know, tags, registrations_count, is_featured)
    VALUES ($1, 'QA Test Sold Out Event', 'Sold out event for waitlist testing.', 'CYPHER_BATTLE', 'KOLKATA', 'Test Venue', 'Test Address', NOW() + INTERVAL '20 days', NOW() + INTERVAL '20 days' + INTERVAL '4 hours', 'FLAT', 'BUYER', 'PUBLISHED', ARRAY['No refunds'], ARRAY['Bring water'], ARRAY['hip-hop'], 0, false)
    RETURNING id
  `, [orgId2]);
  await client.query(`INSERT INTO public.ticket_tiers (event_id, name, price_paise, quantity, quantity_sold, tier_type) VALUES ($1, 'Entry', 50000, 5, 5, 'FLAT')`, [soldOutEvent[0].id]);
  console.log("✅ Sold-out event created for waitlist testing");

  // Create a pending (unverified) club for admin approval testing
  const { rows: pendingClub } = await client.query(`
    INSERT INTO public.clubs (owner_id, name, bio, type, city, membership_type, membership_fee_paise, terms, member_count, verified)
    VALUES ($1, 'QA Test Pending Club', 'Pending club for admin approval test.', 'CLUB', 'KOLKATA', 'FREE', 0, ARRAY['Be respectful'], 0, false)
    RETURNING id
  `, [orgId2]);
  console.log("✅ Pending club created for admin approval test");

  // Create a paid club for paid membership testing
  const { rows: paidClub } = await client.query(`
    INSERT INTO public.clubs (owner_id, name, bio, type, city, membership_type, membership_fee_paise, upi_id, terms, member_count, verified)
    VALUES ($1, 'QA Test Paid Club', 'Paid club for membership test.', 'CREW', 'MUMBAI', 'PAID', 50000, 'testorg@upi', ARRAY['Pay monthly'], 0, true)
    RETURNING id
  `, [orgId2]);
  console.log("✅ Paid club created for paid membership test");

  // Ensure non-admin user (nickjoe) is NOT an organizer
  const { rows: nickJoe } = await client.query("SELECT id FROM auth.users WHERE email = 'nickjoe@gmail.com'");
  if (nickJoe.length > 0) {
    await client.query("UPDATE public.profiles SET is_admin = false, is_organizer = false WHERE id = $1", [nickJoe[0].id]);
    console.log("✅ Ensured nickjoe@gmail.com is non-admin, non-organizer");
  }

  console.log("\n✅ Cleanup complete");
  const { rows: finalEvents } = await client.query("SELECT id, title, status, pricing_mode FROM public.events ORDER BY created_at");
  console.log("\nEvents:");
  finalEvents.forEach(e => console.log(`  ${e.title} (${e.status}, ${e.pricing_mode})`));

  const { rows: finalClubs } = await client.query("SELECT id, name, verified, membership_type FROM public.clubs ORDER BY created_at");
  console.log("\nClubs:");
  finalClubs.forEach(c => console.log(`  ${c.name} (verified=${c.verified}, ${c.membership_type})`));

  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
