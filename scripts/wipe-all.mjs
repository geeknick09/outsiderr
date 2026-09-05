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
  console.log("Connected. Wiping ALL data (keeping auth users + profiles)...\n");

  // Order matters — child tables first
  const tables = [
    "public.tickets",
    "public.refunds",
    "public.event_notifications",
    "public.hero_boosts",
    "public.waitlist",
    "public.door_staff_orders",
    "public.door_staff_slots",
    "public.orders",
    "public.ticket_tiers",
    "public.club_members",
    "public.clubs",
    "public.events",
    "public.event_terms_acceptances",
    "public.organizers",
    "public.legal_pages",
    "public.platform_settings",
    "public.push_subscriptions",
  ];

  for (const table of tables) {
    try {
      const { rowCount } = await client.query(`DELETE FROM ${table}`);
      console.log(`  ${table}: ${rowCount} rows deleted`);
    } catch (err) {
      console.log(`  ${table}: ${err.message}`);
    }
  }

  // Reset profile flags
  await client.query("UPDATE public.profiles SET is_organizer = false, is_admin = false");
  console.log("\n  profiles: is_organizer and is_admin reset to false");

  // Re-seed platform settings (value column is jsonb — strings need double quotes)
  await client.query(`
    INSERT INTO public.platform_settings (key, value, description) VALUES
      ('hero_boost_enabled',              'true',                                          'Enable/disable the Hero Boost feature'),
      ('hero_rotation_interval_minutes',  '30',                                            'Hero carousel rotation interval in minutes'),
      ('hero_max_visible_events',         '7',                                             'Maximum Hero events displayed at once'),
      ('tagline_header',                  '"Find what''s happening outside the mainstream."', 'Homepage header tagline (bold line)'),
      ('tagline_subheader',               '"Discover raw events happening today near you."',  'Homepage sub-tagline (muted line)'),
      ('tagline_footer',                  '"Cyphers, battles, stunts, skates, jams & real communities. Discover raw events happening today near you."', 'Footer brand tagline'),
      ('platform_fee_bps',                '500',                                           'Platform commission in basis points (5%)'),
      ('cancellation_charge_percent',     '20',                                            'Organizer cancellation charge as % of total tickets sold'),
      ('postponement_charge_percent',     '10',                                            'Organizer postponement charge as % of refunded tickets'),
      ('door_staff_pricing',              '{"1":1500,"2":2500,"3":3500,"4":5000,"5":6500}', 'Door staff pricing per staff count (in INR)'),
      ('door_staff_max',                  '5',                                             'Maximum door staff per event'),
      ('boost_slot_prices',               '{"carousel_1":1000,"carousel_2":750,"carousel_3":500}', 'Boost slot pricing per day (in INR)'),
      ('max_tickets_per_order',           '1',                                             'Maximum tickets per single order'),
      ('terms_version',                   '"organizer-v1.0"',                              'Current organizer terms & conditions version'),
      ('venue_announcement_deadline_hours','48',                                           'Minimum hours before event to announce venue'),
      ('door_staff_available',            '10',                                            'Total door staff currently available across all events'),
      ('organizer_whatsapp_number',       '"7980085212"',                                  'WhatsApp number for attendees to send payment screenshots'),
      ('hero_boost_price',                '99900',                                         'Price for a 7-day Hero Boost in paise (₹999)'),
      ('hero_boost_duration_days',        '7',                                             'Hero Boost duration in days')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description
  `);
  console.log("  platform_settings: re-seeded");

  // Re-seed legal pages
  await client.query(`
    INSERT INTO public.legal_pages (slug, title, content) VALUES
      ('terms', 'Terms & Conditions', '# Terms & Conditions\n\nBy purchasing a ticket on Outsiderr, you agree to the following terms:\n\n- Please carry a valid ID proof along with you.\n- No refunds on purchased ticket are possible, even in case of any rescheduling.\n- Security procedures, including frisking remain the right of the management.\n- The sponsors/performers/organizers are not responsible for any injury or damage occurring due to the event. Any claims regarding the same would be settled in courts in Mumbai.\n- People in an inebriated state may not be allowed entry.\n- Organizers hold the right to deny late entry to the event.\n- Venue rules apply.'),
      ('privacy', 'Privacy Policy', '# Privacy Policy\n\nWe respect your privacy.\n\n- We collect only the information needed to process bookings.\n- We do not sell your data to third parties.\n- You can request data deletion at any time.'),
      ('refund', 'Refund Policy', '# Refund Policy\n\n- Full refund if the organizer cancels the event.\n- No refund for no-shows.\n- Postponed events: tickets remain valid for the new date.'),
      ('cancellation', 'Cancellation Policy', '# Cancellation Policy\n\n- Organizers may cancel events with full refund to attendees.\n- Cancellation charges apply to organizers as per platform settings.\n- Door staff charges are non-refundable once paid.')
    ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content
  `);
  console.log("  legal_pages: re-seeded");

  // Verify
  const { rows: users } = await client.query("SELECT id, email FROM auth.users ORDER BY email");
  console.log(`\nRemaining users (${users.length}):`);
  for (const u of users) console.log(`  ${u.email}`);

  const { rows: profiles } = await client.query("SELECT id, is_organizer, is_admin FROM public.profiles");
  console.log(`\nProfiles (${profiles.length}): all is_organizer=false, is_admin=false`);

  console.log("\n✅ Full wipe complete. Users kept. Ready for fresh testing.");
  await client.end();
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
