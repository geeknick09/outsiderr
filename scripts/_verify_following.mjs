// Rolled-back live check: auto-follow on purchase + follower launch notify.
import pg from "pg";
import { readFileSync } from "node:fs";
const env = readFileSync(".env", "utf-8");
const dbUrl = env.match(/^SUPABASE_DB_URL=(.+)$/m)?.[1]?.trim();
const dbPass = env.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1]?.trim();
const connectionString = dbUrl ||
  `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPass)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await db.connect();
const ok = (n, c) => console.log(c ? `  ✓ ${n}` : `  ✗ FAIL ${n}`);
await db.query("BEGIN");
try {
  const { rows: [ev] } = await db.query(`
    select e.id, e.organizer_id, e.title, e.city, o.owner_id
      from events e join organizers o on o.id = e.organizer_id
     where e.status in ('PUBLISHED','POSTPONED') limit 1`);
  const { rows: [buyer] } = await db.query(`
    select id from auth.users where id is distinct from $1 limit 1`, [ev.owner_id]);
  const { rows: [tier] } = await db.query(`
    insert into ticket_tiers (event_id, name, price_paise, quantity)
    values ($1, '__ff_test_tier', 10000, 100)
    on conflict do nothing returning id`, [ev.id]);
  const { rows: [t] } = await db.query(
    `select id from ticket_tiers where event_id=$1 limit 1`, [ev.id]);
  const tierId = t.id;

  // 1) Buyer purchases → CONFIRMED order → auto-follow.
  const { rows: [ord] } = await db.query(`
    insert into orders (event_id, tier_id, user_id, quantity, unit_price_paise, subtotal_paise, platform_fee_paise, total_paise, fee_payer, status, order_source)
    values ($1, $3, $2, 1, 10000, 10000, 1200, 11200, 'BUYER', 'CONFIRMED', 'ONLINE') returning id`, [ev.id, buyer.id, tierId]);
  const { rows: [follow] } = await db.query(`
    select 1 from organizer_follows where organizer_id=$1 and follower_id=$2`,
    [ev.organizer_id, buyer.id]);
  ok("purchase auto-follows organizer", !!follow);

  // 2) Idempotent: second order doesn't duplicate.
  await db.query(`insert into orders (event_id, tier_id, user_id, quantity, unit_price_paise, subtotal_paise, platform_fee_paise, total_paise, fee_payer, status, order_source)
                values ($1, $3, $2, 1, 10000, 10000, 1200, 11200, 'BUYER', 'CONFIRMED', 'ONLINE')`, [ev.id, buyer.id, tierId]);
  const { rows: [{ n }] } = await db.query(`
    select count(*)::int n from organizer_follows where organizer_id=$1 and follower_id=$2`,
    [ev.organizer_id, buyer.id]);
  ok("no duplicate follow on 2nd purchase", n === 1);

  // 3) Owner buying own ticket does NOT self-follow.
  const { rows: [ownOrd] } = await db.query(`
    insert into orders (event_id, tier_id, user_id, quantity, unit_price_paise, subtotal_paise, platform_fee_paise, total_paise, fee_payer, status, order_source)
    values ($1, $3, $2, 1, 10000, 10000, 1200, 11200, 'BUYER', 'CONFIRMED', 'ONLINE') returning id`, [ev.id, ev.owner_id, tierId]);
  const { rows: [selfFollow] } = await db.query(`
    select 1 from organizer_follows where organizer_id=$1 and follower_id=$2`,
    [ev.organizer_id, ev.owner_id]);
  ok("owner can't self-follow", !selfFollow);

  // 4) Publish → follower gets NEW_EVENT notification once.
  const { rows: [ev2] } = await db.query(`
    insert into events (organizer_id, title, status, starts_at, city, category, venue_name, venue_address, description)
    select $1, 'Follower notify test', 'DRAFT', now()+interval '30 days', city, category, 'Venue', 'Addr', 'test'
      from events where id = $2
    returning id`, [ev.organizer_id, ev.id]);
  // Emulate the organizer owner's JWT so is_event_manager() passes.
  await db.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: ev.owner_id, role: "authenticated" })]);
  await db.query(`select set_event_status($1, 'PUBLISHED')`, [ev2.id]);
  await db.query(`select set_config('request.jwt.claims', '', true)`);
  const { rows: notifs } = await db.query(`
    select 1 from event_notifications where event_id=$1 and user_id=$2 and type='NEW_EVENT'`,
    [ev2.id, buyer.id]);
  ok("follower got NEW_EVENT on publish", notifs.length === 1);

  // 5) Second publish doesn't re-notify.
  await db.query(`update events set status='DRAFT' where id=$1`, [ev2.id]);
  await db.query(`select notify_event_followers($1)`, [ev2.id]);
  const { rows: [{ n2 }] } = await db.query(`
    select count(*)::int n2 from event_notifications where event_id=$1 and type='NEW_EVENT'`,
    [ev2.id]);
  ok("no double notification on republish", n2 === 1);

  // 6) Guest/counter order (user_id NULL) never follows.
  await db.query(`insert into orders (event_id, tier_id, user_id, quantity, unit_price_paise, subtotal_paise, platform_fee_paise, total_paise, fee_payer, status, order_source)
                values ($1, $2, null, 1, 10000, 10000, 1200, 11200, 'BUYER', 'CONFIRMED', 'BOX_OFFICE')`, [ev.id, tierId]);
  const { rows: [{ n3 }] } = await db.query(`
    select count(*)::int n3 from organizer_follows where organizer_id=$1`, [ev.organizer_id]);
  ok("guest order adds no follow", n3 === 1);

  await db.query("ROLLBACK");
  console.log("\nAll rolled back — live data untouched.");
} catch (e) {
  await db.query("ROLLBACK");
  console.error("FAILED:", e.message);
  process.exit(1);
}
await db.end();
