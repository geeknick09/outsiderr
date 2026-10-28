// End-to-end DB verification of the promoter organizer-referral program.
// Usage: node scripts/_test_org_referral.mjs
import pg from "pg";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";

const env = readFileSync(".env", "utf-8");
const pw = env.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1]?.trim();
const url = env.match(/^SUPABASE_DB_URL=(.+)$/m)?.[1]?.trim();
const cs = url || `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(pw)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
const q = (sql, p = []) => c.query(sql, p).then((r) => r.rows);

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

async function main() {
  await c.connect();
  await q("begin");
  try {
    // Fixture: promoter user + organizer user + events
    const [promUser] = await q(
      `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
       values ($1, $2, now(), '{}'::jsonb) returning id`,
      [randomUUID(), `ref.promoter.${Date.now()}@test.local`],
    );
    const [prom] = await q(
      `insert into public.promoters (user_id) values ($1) returning id`,
      [promUser.id],
    );
    const [orgUser] = await q(
      `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
       values ($1, $2, now(), '{}'::jsonb) returning id`,
      [randomUUID(), `ref.org.${Date.now()}@test.local`],
    );
    const [org] = await q(
      `insert into public.organizers (owner_id, name) values ($1, 'Ref Test Org') returning id`,
      [orgUser.id],
    );

    // 1. Attribution: live org link stamps the organizer
    const [link] = await q(
      `insert into public.promoter_links (promoter_id, event_id, slug, link_kind, expires_at)
       values ($1, null, 'testref1', 'ORGANIZER', now() + interval '30 days') returning id`,
      [prom.id],
    );
    const [attr] = await q(
      `select public.attribute_organizer_referral($1, 'testref1') as p`, [org.id],
    );
    check("attribution stamps referred_by", attr.p === prom.id);
    const [orgRow] = await q(`select referred_by_promoter_id, referred_at from public.organizers where id=$1`, [org.id]);
    check("organizer row stamped", orgRow.referred_by_promoter_id === prom.id && !!orgRow.referred_at);

    // 2. First-write-wins: a second promoter's link does not overwrite
    const [prom1b] = await q(
      `insert into public.promoters (user_id) values ($1) returning id`,
      [(await q(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), '{}'::jsonb) returning id`, [randomUUID(), `ref.prom1b.${Date.now()}@test.local`]))[0].id]);
    await q(`insert into public.promoter_links (promoter_id, event_id, slug, link_kind, expires_at)
             values ($1, null, 'testref2', 'ORGANIZER', now() + interval '30 days')`, [prom1b.id]);
    const [attr2] = await q(`select public.attribute_organizer_referral($1, 'testref2') as p`, [org.id]);
    check("first-write-wins (2nd call returns existing)", attr2.p === prom.id);

    // 3. Expired link does not attribute
    const [orgUser2] = await q(
      `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
       values ($1, $2, now(), '{}'::jsonb) returning id`, [randomUUID(), `ref.org2.${Date.now()}@test.local`]);
    const [org2] = await q(
      `insert into public.organizers (owner_id, name) values ($1, 'Expired Org') returning id`, [orgUser2.id]);
    const [prom2] = await q(
      `insert into public.promoters (user_id) values ($1) returning id`,
      [(await q(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), '{}'::jsonb) returning id`, [randomUUID(), `ref.prom2.${Date.now()}@test.local`]))[0].id]);
    await q(`insert into public.promoter_links (promoter_id, event_id, slug, link_kind, expires_at)
             values ($1, null, 'deadref', 'ORGANIZER', now() - interval '1 day')`, [prom2.id]);
    const [attrDead] = await q(`select public.attribute_organizer_referral($1, 'deadref') as p`, [org2.id]);
    check("expired link does not attribute", attrDead.p === null);
    const [lookupDead] = await q(`select public.org_referral_slug_lookup('deadref') as l`);
    check("expired link fails slug lookup", lookupDead.l === null);

    // 4. Self-referral blocked: promoter refers their own organizer account
    const [selfOrg] = await q(
      `insert into public.organizers (owner_id, name) values ($1, 'Self Org') returning id`, [promUser.id]);
    const [attrSelf] = await q(`select public.attribute_organizer_referral($1, 'testref1') as p`, [selfOrg.id]);
    check("self-referral blocked", attrSelf.p === null);

    // 5. Free event does NOT consume the window
    const [freeEv] = await q(
      `insert into public.events (organizer_id, title, city, category, venue_name, venue_address, description, starts_at, status)
       values ($1, 'Free Ev', 'MUMBAI', 'JAM_GIG', 'V', 'A', 'd', now() + interval '7 days', 'DRAFT') returning id`, [org.id]);
    await q(`insert into public.ticket_tiers (event_id, name, price_paise, quantity) values ($1, 'Free', 0, 50)`, [freeEv.id]);
    await q(`update public.events set status='PUBLISHED' where id=$1`, [freeEv.id]);
    const [freeCheck] = await q(`select referral_promoter_id from public.events where id=$1`, [freeEv.id]);
    const [cnt1] = await q(`select referral_events_count from public.organizers where id=$1`, [org.id]);
    check("free event not stamped, window not consumed", freeCheck.referral_promoter_id === null && cnt1.referral_events_count === 0);

    // 6. Paid events 1-5 stamp; event 6 does not
    const evIds = [];
    for (let i = 1; i <= 6; i++) {
      const [ev] = await q(
        `insert into public.events (organizer_id, title, city, category, venue_name, venue_address, description, starts_at, status)
         values ($1, $2, 'MUMBAI', 'JAM_GIG', 'V', 'A', 'd', now() + interval '7 days', 'DRAFT') returning id`, [org.id, `Paid Ev ${i}`]);
      await q(`insert into public.ticket_tiers (event_id, name, price_paise, quantity) values ($1, 'GA', 100000, 100)`, [ev.id]);
      await q(`update public.events set status='PUBLISHED' where id=$1`, [ev.id]);
      evIds.push(ev.id);
    }
    const stamped = await q(`select id, referral_promoter_id from public.events where id = any($1) order by title`, [evIds]);
    check("events 1-5 stamped", stamped.filter((e) => e.referral_promoter_id === prom.id).length === 5);
    check("event 6 outside window", stamped.filter((e) => e.referral_promoter_id === null).length === 1);
    const [cnt5] = await q(`select referral_events_count from public.organizers where id=$1`, [org.id]);
    check("counter = 5", cnt5.referral_events_count === 5);

    // 7. Confirmed order on stamped event mints ORG_REFERRAL earning = 10% of commission
    //    subtotal 100000, commission 5% = 5000 -> earning 500
    const [buyer] = await q(
      `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
       values ($1, $2, now(), '{}'::jsonb) returning id`, [randomUUID(), `ref.buyer.${Date.now()}@test.local`]);
    const [tier] = await q(`select id from public.ticket_tiers where event_id=$1`, [evIds[0]]);
    const [order] = await q(
      `insert into public.orders (event_id, tier_id, user_id, quantity, unit_price_paise, subtotal_paise,
         platform_fee_paise, commission_paise, convenience_fee_paise, organizer_payout_paise,
         total_paise, fee_payer, status)
       values ($1,$2,$3,1,100000,100000,7000,5000,2000,95000,102000,'BUYER','RESERVED') returning id`,
      [evIds[0], tier.id, buyer.id]);
    await q(`update public.orders set status='CONFIRMED' where id=$1`, [order.id]);
    const [earn] = await q(
      `select via, amount_paise, commission_bps, organizer_id, status from public.promoter_earnings
        where order_id=$1`, [order.id]);
    check("ORG_REFERRAL earning minted", earn?.via === "ORG_REFERRAL");
    check("earning = 10% of 5000 = 500", earn?.amount_paise === 500, `got ${earn?.amount_paise}`);
    check("commission_bps snapshot = 1000", earn?.commission_bps === 1000);
    check("organizer_id on earning", earn?.organizer_id === org.id);

    // 8. Order on event 6 (outside window) earns nothing
    const [tier6] = await q(`select id from public.ticket_tiers where event_id=$1`, [evIds[5]]);
    const [order6] = await q(
      `insert into public.orders (event_id, tier_id, user_id, quantity, unit_price_paise, subtotal_paise,
         platform_fee_paise, commission_paise, convenience_fee_paise, organizer_payout_paise,
         total_paise, fee_payer, status)
       values ($1,$2,$3,1,100000,100000,7000,5000,2000,95000,102000,'BUYER','RESERVED') returning id`,
      [evIds[5], tier6.id, buyer.id]);
    await q(`update public.orders set status='CONFIRMED' where id=$1`, [order6.id]);
    const [earn6] = await q(`select id from public.promoter_earnings where order_id=$1`, [order6.id]);
    check("no earning outside window", !earn6);

    // 9. Free order on stamped event (commission 0) earns nothing
    const [order0] = await q(
      `insert into public.orders (event_id, tier_id, user_id, quantity, unit_price_paise, subtotal_paise,
         platform_fee_paise, commission_paise, convenience_fee_paise, organizer_payout_paise,
         total_paise, fee_payer, status)
       values ($1,$2,$3,1,0,0,0,0,0,0,0,'BUYER','RESERVED') returning id`,
      [freeEv.id, (await q(`select id from public.ticket_tiers where event_id=$1`, [freeEv.id]))[0].id, buyer.id]);
    await q(`update public.orders set status='CONFIRMED' where id=$1`, [order0.id]);
    const [earn0] = await q(`select id from public.promoter_earnings where order_id=$1`, [order0.id]);
    check("zero-commission order earns nothing", !earn0);

    // 10. Refund claws back the referral earning
    const [refund] = await q(
      `insert into public.refunds (order_id, event_id, user_id, amount_paise, status) values ($1, $2, $3, 102000, 'COMPLETED') returning id`, [order.id, evIds[0], buyer.id]);
    const [afterRef] = await q(
      `select status, reversed_paise from public.promoter_earnings where order_id=$1`, [order.id]);
    check("refund fully reverses earning", afterRef?.status === "REVERSED" && afterRef?.reversed_paise === 500,
      `status=${afterRef?.status} reversed=${afterRef?.reversed_paise}`);

    // 11. Live link validates through the slug lookup
    const [lookupLive] = await q(`select public.org_referral_slug_lookup('testref1') as l`);
    check("live link resolves", lookupLive.l?.promoter_id === prom.id);

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    await q("rollback");
    await c.end();
  }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
