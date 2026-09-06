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

  // Get the test user's organizer
  const { rows: users } = await dbClient.query("SELECT id FROM auth.users WHERE email = 'official.outsiderr@gmail.com'");
  const userId = users[0].id;
  const { rows: orgs } = await dbClient.query("SELECT id FROM public.organizers WHERE owner_id = $1", [userId]);
  const orgId = orgs[0].id;

  // Create a phased event with phase 1 active RIGHT NOW
  const now = new Date();
  const phase1Open = new Date(now.getTime() - 5 * 60 * 1000); // 5 min ago
  const phase2Open = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
  const eventStart = new Date(now.getTime() + 24 * 60 * 60 * 1000); // tomorrow

  const { rows: eventRows } = await dbClient.query(`
    INSERT INTO public.events (
      id, organizer_id, title, category, city, starts_at, ends_at,
      venue_name, venue_address, description, pricing_mode, status,
      fee_payer, things_to_know, terms, created_at
    ) VALUES (
      gen_random_uuid(), $1, 'QA Phased Test — Active Now', 'CYPHER_BATTLE', 'KOLKATA',
      $2, $3, 'Test Venue', 'Test Address', 'Testing phased tickets with active phase',
      'PHASED', 'PUBLISHED', 'BUYER', ARRAY['Bring water']::text[], ARRAY['No refunds']::text[], now()
    ) RETURNING id
  `, [orgId, eventStart.toISOString(), new Date(eventStart.getTime() + 2 * 60 * 60 * 1000).toISOString()]);

  const eventId = eventRows[0].id;
  console.log("Created event:", eventId);

  // Phase 1 — active right now (opened 5 min ago, no close date, next phase opens in 1 hour)
  await dbClient.query(`
    INSERT INTO public.ticket_tiers (
      id, event_id, name, price_paise, quantity, quantity_sold, perks, sort_order,
      tier_type, phase_order, phase_opens_at, phase_closes_at
    ) VALUES (
      gen_random_uuid(), $1, 'Early Bird', 19900, 5, 0, ARRAY[]::text[], 0,
      'FLAT_PHASE', 1, $2, NULL
    )
  `, [eventId, phase1Open.toISOString()]);

  // Phase 2 — upcoming (opens in 1 hour)
  await dbClient.query(`
    INSERT INTO public.ticket_tiers (
      id, event_id, name, price_paise, quantity, quantity_sold, perks, sort_order,
      tier_type, phase_order, phase_opens_at, phase_closes_at
    ) VALUES (
      gen_random_uuid(), $1, 'Regular', 29900, 5, 0, ARRAY[]::text[], 1,
      'FLAT_PHASE', 2, $2, NULL
    )
  `, [eventId, phase2Open.toISOString()]);

  console.log("Phase 1 opens at:", phase1Open.toISOString(), "(5 min ago — ACTIVE)");
  console.log("Phase 2 opens at:", phase2Open.toISOString(), "(1 hour from now — UPCOMING)");
  console.log("Event URL: http://localhost:3000/events/" + eventId);

  await dbClient.end();
})();
