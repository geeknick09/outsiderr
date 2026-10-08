/**
 * "Build a following" — auto-follow on purchase + follower launch notification.
 * Runs against the live database inside a single rolled-back transaction.
 * Mirrors the pattern in box-office.db.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { readFileSync } from "node:fs";

const env = readFileSync(".env", "utf-8");
const readEnv = (key: string) => env.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim();
const connectionString =
  readEnv("SUPABASE_DB_URL") ||
  (readEnv("SUPABASE_DB_PASSWORD")
    ? `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(readEnv("SUPABASE_DB_PASSWORD")!)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`
    : "");

describe.skipIf(!connectionString)("build a following - end to end on the database", () => {
  let client: pg.Client;
  const s: Record<string, any> = {};
  const q = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows;

  beforeAll(async () => {
    client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query("begin");

    // A live event with a paid tier + its organizer owner.
    const rows = await q(`
      select e.id, e.organizer_id, e.city, e.category, t.id as tier_id,
             o.owner_id
        from public.events e
        join public.ticket_tiers t on t.event_id = e.id
        join public.organizers o on o.id = e.organizer_id
       where e.status::text in ('PUBLISHED','POSTPONED') and t.price_paise > 0
       order by e.created_at desc limit 1`);
    s.ev = rows[0];
    s.skip = !s.ev;
    if (s.skip) return;
    const [buyer] = await q(
      `select id from auth.users where id is distinct from $1 limit 1`,
      [s.ev.owner_id],
    );
    s.buyer = buyer?.id;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  const mkOrder = (userId: string | null, status = "CONFIRMED") =>
    q(
      `insert into public.orders
         (event_id, tier_id, user_id, quantity, unit_price_paise, subtotal_paise,
          platform_fee_paise, total_paise, fee_payer, status, order_source)
       values ($1,$2,$3,1,10000,10000,1200,11200,'BUYER',$4,'ONLINE') returning id`,
      [s.ev.id, s.ev.tier_id, userId, status],
    );

  it("a confirmed purchase auto-follows the organizer", async () => {
    if (s.skip) throw new Error("no live event");
    await q(`delete from public.organizer_follows where organizer_id=$1 and follower_id=$2`,
      [s.ev.organizer_id, s.buyer]);
    await mkOrder(s.buyer);
    const [f] = await q(
      `select 1 from public.organizer_follows where organizer_id=$1 and follower_id=$2`,
      [s.ev.organizer_id, s.buyer],
    );
    expect(!!f).toBe(true);
  });

  it("a second purchase does not duplicate the follow", async () => {
    if (s.skip) throw new Error("no live event");
    await mkOrder(s.buyer);
    const [r] = await q(
      `select count(*)::int as n from public.organizer_follows
        where organizer_id=$1 and follower_id=$2`,
      [s.ev.organizer_id, s.buyer],
    );
    expect(r.n).toBe(1);
  });

  it("the organizer buying their own ticket does not self-follow", async () => {
    if (s.skip) throw new Error("no live event");
    await mkOrder(s.ev.owner_id);
    const [f] = await q(
      `select 1 from public.organizer_follows where organizer_id=$1 and follower_id=$2`,
      [s.ev.organizer_id, s.ev.owner_id],
    );
    expect(!!f).toBe(false);
  });

  it("an order that flips to CONFIRMED via UPDATE also follows (approve path)", async () => {
    if (s.skip) throw new Error("no live event");
    const [other] = await q(
      `select id from auth.users where id not in ($1,$2) limit 1`,
      [s.ev.owner_id, s.buyer],
    );
    await q(`delete from public.organizer_follows where organizer_id=$1 and follower_id=$2`,
      [s.ev.organizer_id, other.id]);
    const [ord] = await mkOrder(other.id, "RESERVED");
    const [f0] = await q(
      `select 1 from public.organizer_follows where organizer_id=$1 and follower_id=$2`,
      [s.ev.organizer_id, other.id],
    );
    expect(!!f0).toBe(false);
    await q(`update public.orders set status='CONFIRMED' where id=$1`, [ord.id]);
    const [f1] = await q(
      `select 1 from public.organizer_follows where organizer_id=$1 and follower_id=$2`,
      [s.ev.organizer_id, other.id],
    );
    expect(!!f1).toBe(true);
  });

  it("first publish notifies followers once", async () => {
    if (s.skip) throw new Error("no live event");
    // Draft a new event for the same organizer (buyer is already a follower).
    const [ev2] = await q(
      `insert into public.events
         (organizer_id, title, status, starts_at, city, category, venue_name, venue_address, description)
       select $1,'__ff_draft','DRAFT',now()+interval '30 days',city,category,'V','A','t'
         from public.events where id=$2 returning id`,
      [s.ev.organizer_id, s.ev.id],
    );
    s.ev2 = ev2.id;
    // Emulate the owner's JWT for the manager check inside set_event_status.
    await q(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: s.ev.owner_id, role: "authenticated" }),
    ]);
    await q(`select public.set_event_status($1, 'PUBLISHED')`, [s.ev2]);
    await q(`select set_config('request.jwt.claims', '', true)`);
    const rows = await q(
      `select count(*)::int as n from public.event_notifications
        where event_id=$1 and user_id=$2 and type='NEW_EVENT'`,
      [s.ev2, s.buyer],
    );
    expect(rows[0].n).toBe(1);
  });

  it("re-publishing does not re-notify", async () => {
    if (s.skip) throw new Error("no live event");
    const countNotifs = async () =>
      (await q(
        `select count(*)::int as n from public.event_notifications
          where event_id=$1 and type='NEW_EVENT'`,
        [s.ev2],
      ))[0].n;
    const before = await countNotifs();
    await q(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: s.ev.owner_id, role: "authenticated" }),
    ]);
    await q(`select public.set_event_status($1, 'DRAFT')`, [s.ev2]);
    await q(`select public.set_event_status($1, 'PUBLISHED')`, [s.ev2]);
    await q(`select set_config('request.jwt.claims', '', true)`);
    expect(await countNotifs()).toBe(before);
  });

  it("guest orders (no user) never create follows", async () => {
    if (s.skip) throw new Error("no live event");
    const [before] = await q(
      `select count(*)::int as n from public.organizer_follows where organizer_id=$1`,
      [s.ev.organizer_id],
    );
    await q(
      `insert into public.orders
         (event_id, tier_id, user_id, quantity, unit_price_paise, subtotal_paise,
          platform_fee_paise, total_paise, fee_payer, status, order_source)
       values ($1,$2,null,1,10000,10000,0,10000,'BUYER','CONFIRMED','BOX_OFFICE')`,
      [s.ev.id, s.ev.tier_id],
    );
    const [after] = await q(
      `select count(*)::int as n from public.organizer_follows where organizer_id=$1`,
      [s.ev.organizer_id],
    );
    expect(after.n).toBe(before.n);
  });
});
