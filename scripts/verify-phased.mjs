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

  // 1. List all check constraints on events
  const { rows: constraints } = await client.query(`
    SELECT con.conname, pg_get_constraintdef(con.oid) as def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'events' AND con.contype = 'c'
  `);
  console.log("All check constraints on events table:");
  for (const row of constraints) {
    console.log(`  ${row.conname}: ${row.def}`);
  }

  // 2. Find an existing organizer to use
  const { rows: orgs } = await client.query("SELECT id, name FROM public.organizers LIMIT 1");
  if (orgs.length === 0) {
    console.log("\nNo organizers found — can't test insert. Creating a temp one...");
    const { rows: users } = await client.query("SELECT id FROM auth.users LIMIT 1");
    if (users.length === 0) {
      console.log("No users found either. Aborting.");
      await client.end();
      return;
    }
    const userId = users[0].id;
    const { rows: newOrg } = await client.query(`
      INSERT INTO public.organizers (owner_id, name, upi_id, verified)
      VALUES ($1, 'Test Org', 'test@upi', false)
      RETURNING id
    `, [userId]);
    orgs.push(newOrg[0]);
  }

  const orgId = orgs[0].id;
  console.log(`\nUsing organizer: ${orgs[0].name} (${orgId})`);

  // 3. Try inserting an event with PHASED pricing mode
  try {
    await client.query("BEGIN");
    const { rows: event } = await client.query(`
      INSERT INTO public.events (
        organizer_id, title, description, category, city,
        venue_name, venue_address, starts_at, ends_at,
        fee_payer, pricing_mode, status
      ) VALUES (
        $1, 'TEST PHASED EVENT', 'test description', 'CYPHER_BATTLE', 'KOLKATA',
        'Test Venue', 'Test Address', NOW() + INTERVAL '30 days', NOW() + INTERVAL '30 days' + INTERVAL '4 hours',
        'BUYER', 'PHASED', 'PUBLISHED'
      )
      RETURNING id, title, pricing_mode
    `, [orgId]);
    console.log("\n✅ PHASED event insert SUCCEEDED!");
    console.log(`   Event: ${event[0].title} | pricing_mode: ${event[0].pricing_mode}`);

    // 4. Try inserting ticket tiers with FLAT_PHASE type
    const eventId = event[0].id;
    const { rows: tiers } = await client.query(`
      INSERT INTO public.ticket_tiers (event_id, name, price_paise, quantity, tier_type, phase_order, sort_order)
      VALUES
        ($1, 'Early Bird', 50000, 50, 'FLAT_PHASE', 1, 0),
        ($1, 'Regular', 100000, 100, 'FLAT_PHASE', 2, 1)
      RETURNING id, name, tier_type
    `, [eventId]);
    console.log(`✅ FLAT_PHASE tiers insert SUCCEEDED!`);
    for (const t of tiers) console.log(`   Tier: ${t.name} | tier_type: ${t.tier_type}`);

    await client.query("ROLLBACK");
    console.log("\n(Rolled back — no test data left in DB)");
  } catch (err) {
    await client.query("ROLLBACK");
    console.log(`\n❌ Insert FAILED: ${err.message}`);
    console.log(`   Code: ${err.code}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
