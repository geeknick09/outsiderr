// End-to-end box-office flow against the real database.
// Everything runs inside ONE transaction that is rolled back at the end, so no rows persist.
// Requires SUPABASE_DB_PASSWORD (or SUPABASE_DB_URL) in .env; skipped otherwise.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID, createHash } from "crypto";

function readEnv(): Record<string, string> {
  const path = join(process.cwd(), ".env");
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = readEnv();
const connectionString =
  env.SUPABASE_DB_URL ||
  (env.SUPABASE_DB_PASSWORD
    ? `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`
    : "");

describe.skipIf(!connectionString)("box office - end to end on the database", () => {
  let client: pg.Client;
  const s: Record<string, any> = {};
  const q = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows;

  beforeAll(async () => {
    client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query("begin");

    // Two live events from different organizers, each with a paid tier that has room.
    const rows = await q(`
      select e.id, e.title, e.organizer_id, t.id as tier_id, t.price_paise
        from public.events e
        join public.ticket_tiers t on t.event_id = e.id
       where e.status::text in ('PUBLISHED','POSTPONED') and t.price_paise > 0
         and t.quantity - t.quantity_sold - coalesce(t.quantity_reserved,0) >= 5
       order by e.created_at desc limit 40`);
    s.evA = rows[0];
    s.evB = rows.find((r) => r.organizer_id !== s.evA?.organizer_id);
    s.skip = !s.evA || !s.evB;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  const need = (name: string) => {
    if (s.skip) throw new Error(`no two live events from different organizers with seats (needed for ${name})`);
  };

  it("walk-in sale is priced from the tier and writes exactly one ledger row", async () => {
    need("walk-in");
    const key = randomUUID();
    const [res] = await q(
      `select public.create_walkin_order($1,'E2E Buyer','9000000001',$2,null,0,'WALKIN_QR',$3) as j`,
      [s.evA.id, s.evA.tier_id, key],
    );
    s.walkinA = res.j;
    s.walkinKey = key;
    const [ev] = await q(`select commission_enabled, commission_bps, convenience_fee_enabled, convenience_fee_bps, fee_payer::text as fee_payer from public.events where id=$1`, [s.evA.id]);
    const [gwRow] = await q(`select public._setting_int('gateway_fee_bps', 236) as gw`);
    const sub = Number(s.evA.price_paise);
    const comm = ev.commission_enabled ? Math.round((sub * Number(ev.commission_bps)) / 10000) : 0;
    const conv = ev.convenience_fee_enabled ? Math.round((sub * Number(ev.convenience_fee_bps)) / 10000) : 0;
    const gw = Math.round(((sub + conv) * Number(gwRow.gw)) / (10000 - Number(gwRow.gw)));
    const total = ev.fee_payer === "ORGANIZER" ? sub : sub + conv + gw;
    const payout = ev.fee_payer === "ORGANIZER" ? sub - comm - conv - gw : sub - comm;
    expect(s.walkinA.totalPaise).toBe(total);
    expect(s.walkinA.payoutPaise).toBe(payout);
    const [l] = await q(`select count(*)::int as n, max(razorpay_fee_paise) as rzp, max(net_organizer_paise) as org, max(net_platform_paise) as plat from public.payment_ledger where order_id=$1`, [s.walkinA.orderId]);
    expect(l.n).toBe(1);
    expect(Number(l.rzp)).toBe(0);
    expect(Number(l.org) + Number(l.plat)).toBe(total);
  });

  it("repeating the same sale key does not create a second ticket", async () => {
    const [again] = await q(
      `select public.create_walkin_order($1,'E2E Buyer','9000000001',$2,null,0,'WALKIN_QR',$3) as j`,
      [s.evA.id, s.evA.tier_id, s.walkinKey],
    );
    expect(again.j.orderId).toBe(s.walkinA.orderId);
  });

  it("a walk-in with no tier is refused (client amount is never trusted)", async () => {
    await client.query("savepoint no_tier");
    await expect(
      q(`select public.create_walkin_order($1,'X','9000000002',null,null,500,'WALKIN_PREEVENT',$2)`, [s.evA.id, randomUUID()]),
    ).rejects.toThrow(/Select a ticket tier/);
    await client.query("rollback to savepoint no_tier");
  });

  it("registers a staff member and issues a PIN that is stored hashed", async () => {
    s.phone = "8" + String(Date.now()).slice(-9);
    const [reg] = await q(`select * from public.staff_register('ADMIN', null, 'E2E Counter', 'e2e@example.com', $1, null)`, [s.phone]);
    s.staffId = reg.staff_id;
    s.pin = reg.pin;
    expect(reg.pin).toMatch(/^\d{6}$/);
    const [row] = await q(`select pin_hash from public.staff_members where id=$1`, [s.staffId]);
    expect(row.pin_hash).not.toBe(s.pin);
    expect(row.pin_hash.startsWith("$2")).toBe(true);
  });

  it("staff sign in with the right PIN only", async () => {
    const [ok] = await q(`select * from public.staff_login_session($1,$2)`, [s.phone, s.pin]);
    expect(ok.token).toMatch(/^[0-9a-f]{64}$/);
    s.token = ok.token;
    const wrong = await q(`select * from public.staff_login_session($1,'000000')`, [s.phone]);
    expect(wrong.length).toBe(0);
    const [who] = await q(`select * from public.staff_session_staff($1)`, [s.token]);
    expect(who.staff_id).toBe(s.staffId);
  });

  it("unassigned staff cannot sell at an event", async () => {
    await client.query("savepoint unassigned");
    await expect(
      q(`select public.create_counter_cash_sale($1,$2,$3,'Walk Up','9000000003',null,'WALKIN_QR',$4)`,
        [s.staffId, s.evA.id, s.evA.tier_id, randomUUID()]),
    ).rejects.toThrow(/not assigned/);
    await client.query("rollback to savepoint unassigned");
  });

  it("assigned staff sell for cash, attributed to them, and the cash shows as outstanding", async () => {
    await q(`select public.staff_set_assignment($1,$2,true)`, [s.staffId, s.evA.id]);
    const [sale] = await q(
      `select public.create_counter_cash_sale($1,$2,$3,'Counter Buyer','9000000004',null,'WALKIN_QR',$4) as j`,
      [s.staffId, s.evA.id, s.evA.tier_id, randomUUID()],
    );
    s.counterOrder = sale.j.orderId;
    s.counterTicketQr = (await q(`select qr_hash from public.tickets where id=$1`, [sale.j.ticketId]))[0].qr_hash;
    const [o] = await q(`select sold_by_staff_id, sale_channel, total_paise from public.orders where id=$1`, [s.counterOrder]);
    expect(o.sold_by_staff_id).toBe(s.staffId);
    expect(o.sale_channel).toBe("COUNTER_CASH");
    const [out] = await q(`select * from public.staff_cash_outstanding($1,$2)`, [s.staffId, s.evA.id]);
    expect(Number(out.amount_paise)).toBe(Number(o.total_paise));
  });

  it("organizer confirms the cash handover once; the amount is computed by the server", async () => {
    const [h] = await q(`select public.confirm_cash_handover($1,$2,null) as amount`, [s.staffId, s.evA.id]);
    const [out] = await q(`select * from public.staff_cash_outstanding($1,$2)`, [s.staffId, s.evA.id]);
    expect(Number(out.amount_paise)).toBe(0);
    expect(Number(h.amount)).toBeGreaterThan(0);
    await client.query("savepoint again");
    await expect(q(`select public.confirm_cash_handover($1,$2,null)`, [s.staffId, s.evA.id])).rejects.toThrow(/No cash is outstanding/);
    await client.query("rollback to savepoint again");
  });

  it("a counter Razorpay sale reserves, confirms through the shared dispatcher, and abandons cleanly", async () => {
    // Staff is already assigned to evA from the cash sale test.
    const saleKey = randomUUID();
    const [o] = await q(
      `select * from public.create_counter_reserved_order($1,$2,$3,'Card Buyer','9000000008',null,null,$4)`,
      [s.staffId, s.evA.id, s.evA.tier_id, saleKey],
    );
    expect(o.status).toBe("RESERVED");
    expect(o.user_id).toBeNull();
    expect(o.sale_channel).toBe("COUNTER_RAZORPAY");
    expect(o.sold_by_staff_id).toBe(s.staffId);
    expect(o.order_source).toBe("BOX_OFFICE");
    expect(o.reservation_expires_at).not.toBeNull();

    // Same pricing as online: subtotal + convenience + gateway gross-up
    // (mirrors the RPC's own math, including the fee-enabled flags).
    const [ev] = await q(
      `select commission_enabled, commission_bps, convenience_fee_enabled, convenience_fee_bps, fee_payer
         from public.events where id=$1`,
      [s.evA.id],
    );
    const sub = s.evA.price_paise;
    const comm = ev.commission_enabled !== false ? Math.round((sub * Number(ev.commission_bps ?? 1000)) / 10000) : 0;
    const conv = ev.convenience_fee_enabled !== false ? Math.round((sub * Number(ev.convenience_fee_bps ?? 200)) / 10000) : 0;
    const gw = Math.round(((sub + conv) * 236) / (10000 - 236));
    const expectedTotal = (ev.fee_payer ?? "BUYER") === "ORGANIZER" ? sub : sub + conv + gw;
    expect(o.subtotal_paise).toBe(sub);
    expect(o.commission_paise).toBe(comm);
    expect(o.total_paise).toBe(expectedTotal);

    const [intent] = await q(`select * from public.payment_intents where ref_id=$1 and kind='TICKET_ORDER'`, [o.id]);
    expect(intent.user_id).toBeNull();
    expect(intent.amount_paise).toBe(o.total_paise);
    expect(intent.status).toBe("CREATED");

    // Replay with the same key returns the same order - no double reservation.
    const [replay] = await q(
      `select * from public.create_counter_reserved_order($1,$2,$3,'Card Buyer','9000000008',null,null,$4)`,
      [s.staffId, s.evA.id, s.evA.tier_id, saleKey],
    );
    expect(replay.id).toBe(o.id);

    // Simulate the gateway capture (what verifyCounterRazorpaySale / the webhook call).
    await q(`select public.attach_razorpay_order($1,$2)`, [intent.id, "order_E2Ectr"]);
    const [applied] = await q(`select public.apply_captured_payment('order_E2Ectr','pay_E2Ectr',$1,'INR','card',250,45,'sig')`, [o.total_paise]);
    expect(applied.apply_captured_payment).toMatch(/^APPLIED/);

    const [confirmed] = await q(`select status, payment_method from public.orders where id=$1`, [o.id]);
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.payment_method).toBe("card");
    const [ticket] = await q(`select id, status, user_id from public.tickets where order_id=$1`, [o.id]);
    expect(ticket.status).toBe("VALID");
    expect(ticket.user_id).toBeNull();
    const [ledger] = await q(`select razorpay_fee_paise, gross_amount_paise from public.payment_ledger where order_id=$1`, [o.id]);
    expect(ledger.gross_amount_paise).toBe(sub);
    expect(ledger.razorpay_fee_paise).toBe(250); // actual gateway fee, not the estimate

    // Second delivery of the same payment is a no-op.
    const [again] = await q(`select public.apply_captured_payment('order_E2Ectr','pay_E2Ectr',$1,'INR','card',250,45,'sig')`, [o.total_paise]);
    expect(again.apply_captured_payment).toBe("ALREADY_PAID");
    const [{ n: ledgerRows }] = await q(`select count(*)::int as n from public.payment_ledger where order_id=$1`, [o.id]);
    expect(ledgerRows).toBe(1);

    // A dismissed checkout releases the reserved seat.
    const [o2] = await q(
      `select * from public.create_counter_reserved_order($1,$2,$3,'Abandon','9000000009',null,null,$4)`,
      [s.staffId, s.evA.id, s.evA.tier_id, randomUUID()],
    );
    const [i2] = await q(`select * from public.payment_intents where ref_id=$1`, [o2.id]);
    await q(`select public.attach_razorpay_order($1,$2)`, [i2.id, "order_E2Ectr2"]);
    const [ab] = await q(`select public.abandon_payment('order_E2Ectr2')`, []);
    expect(ab.abandon_payment).toMatch(/^ABANDONED/);
    const [dead] = await q(`select status from public.orders where id=$1`, [o2.id]);
    expect(dead.status).toBe("FAILED");
    const [{ n: held }] = await q(
      `select coalesce(quantity_reserved,0)::int as n from public.ticket_tiers where id=$1`,
      [s.evA.tier_id],
    );
    const [{ n: live }] = await q(
      `select coalesce(sum(quantity),0)::int as n from public.orders where tier_id=$1 and status='RESERVED'`,
      [s.evA.tier_id],
    );
    expect(held).toBe(live);
  });

  it("unassigned staff cannot start a counter Razorpay sale either", async () => {
    const [reg] = await q(`select * from public.staff_register('ADMIN', null, 'No Access', null, $1, null)`, ["6" + String(Date.now()).slice(-9)]);
    await client.query("savepoint rzp_unassigned");
    await expect(
      q(`select * from public.create_counter_reserved_order($1,$2,$3,'X','9000000010',null,null,$4)`,
        [reg.staff_id, s.evA.id, s.evA.tier_id, randomUUID()]),
    ).rejects.toThrow(/not assigned/);
    await client.query("rollback to savepoint rzp_unassigned");
  });

  it("organizer staff cannot be assigned to another organizer's event", async () => {
    const orgOwner = s.evA.organizer_id;
    const [reg] = await q(`select * from public.staff_register('ORGANIZER', $1, 'Org Staff', null, $2, null)`, [orgOwner, "7" + String(Date.now()).slice(-9)]);
    await client.query("savepoint cross_org");
    await expect(q(`select public.staff_set_assignment($1,$2,true)`, [reg.staff_id, s.evB.id])).rejects.toThrow(/own events/);
    await client.query("rollback to savepoint cross_org");
    await q(`select public.staff_set_assignment($1,$2,true)`, [reg.staff_id, s.evA.id]);
  });

  it("a door PIN opens only its own event", async () => {
    const pinCode = "424242";
    const hash = createHash("sha256").update(`${s.evA.id}:${pinCode}`).digest("hex");
    await q(`insert into public.scanner_pins (event_id, organizer_id, pin_code, pin_hash, staff_name) values ($1,$2,$3,$4,'E2E Door')`,
      [s.evA.id, s.evA.organizer_id, pinCode, hash]);
    const [door] = await q(`select * from public.scanner_login_session($1,$2)`, [s.evA.id, pinCode]);
    expect(door.event_id).toBe(s.evA.id);
    s.door = door.token;
    expect((await q(`select * from public.scanner_login_session($1,'000000')`, [s.evA.id])).length).toBe(0);
    expect((await q(`select public.scanner_session_event($1) as e`, [s.door]))[0].e).toBe(s.evA.id);
  });

  it("a valid ticket scans VALID once, then ALREADY_USED", async () => {
    const [first] = await q(`select * from public.check_in_ticket_by_token($1,$2,$3)`, [s.walkinA.qr ?? (await qrOf(s.walkinA.ticketId)), s.door, randomUUID()]);
    expect(first.outcome).toBe("VALID");
    s.usedQr = await qrOf(s.walkinA.ticketId);
    const [again] = await q(`select * from public.check_in_ticket_by_token($1,$2,$3)`, [s.usedQr, s.door, randomUUID()]);
    expect(again.outcome).toBe("ALREADY_USED");
  });

  it("a replayed scan id returns the original outcome without a second log row", async () => {
    const scanId = randomUUID();
    const counterQr = await qrOf(s.walkinA.ticketId);
    // ticket is already USED from the previous test, so first call is ALREADY_USED
    const [a] = await q(`select * from public.check_in_ticket_by_token($1,$2,$3)`, [counterQr, s.door, scanId]);
    const [b] = await q(`select * from public.check_in_ticket_by_token($1,$2,$3)`, [counterQr, s.door, scanId]);
    expect(b.outcome).toBe(a.outcome);
    const [{ n }] = await q(`select count(*)::int as n from public.scan_log where client_scan_id=$1`, [scanId]);
    expect(n).toBe(1);
  });

  it("an offline scan of a ticket already used elsewhere is a DUPLICATE_CONFLICT", async () => {
    const [res] = await q(`select * from public.check_in_ticket_by_token($1,$2,$3,'OFFLINE_SYNC')`, [s.usedQr, s.door, randomUUID()]);
    expect(res.outcome).toBe("DUPLICATE_CONFLICT");
  });

  it("a ticket for another event is WRONG_EVENT and names the real event", async () => {
    const [w] = await q(
      `select public.create_walkin_order($1,'Other Event','9000000005',$2,null,0,'WALKIN_QR',$3) as j`,
      [s.evB.id, s.evB.tier_id, randomUUID()],
    );
    const qr = await qrOf(w.j.ticketId);
    const [res] = await q(`select * from public.check_in_ticket_by_token($1,$2,$3)`, [qr, s.door, randomUUID()]);
    expect(res.outcome).toBe("WRONG_EVENT");
    expect(res.event_title).toBe(s.evB.title);
  });

  it("a cancelled ticket is CANCELLED at the door", async () => {
    const [w] = await q(
      `select public.create_walkin_order($1,'Cancelled','9000000006',$2,null,0,'WALKIN_QR',$3) as j`,
      [s.evA.id, s.evA.tier_id, randomUUID()],
    );
    await q(`update public.tickets set status='CANCELLED' where id=$1`, [w.j.ticketId]);
    const [res] = await q(`select * from public.check_in_ticket_by_token($1,$2,$3)`, [await qrOf(w.j.ticketId), s.door, randomUUID()]);
    expect(res.outcome).toBe("CANCELLED");
  });

  it("an unknown ticket is INVALID", async () => {
    const [res] = await q(`select * from public.check_in_ticket_by_token($1,$2,$3)`, ["no-such-ticket", s.door, randomUUID()]);
    expect(res.outcome).toBe("INVALID");
  });

  it("an expired door session is refused", async () => {
    await q(`update public.scanner_sessions set expires_at = now() - interval '1 minute' where token_hash = encode(extensions.digest($1,'sha256'),'hex')`, [s.door]);
    await client.query("savepoint expired");
    await expect(q(`select * from public.check_in_ticket_by_token($1,$2,$3)`, [s.usedQr, s.door, randomUUID()])).rejects.toThrow(/session expired/);
    await client.query("rollback to savepoint expired");
  });

  it("every attempt is logged, attributed to the door PIN holder", async () => {
    const [{ n }] = await q(`select count(*)::int as n from public.scan_log where event_id=$1 and actor_name='E2E Door'`, [s.evA.id]);
    expect(n).toBeGreaterThanOrEqual(5);
  });

  it("a sold-out tier refuses a counter sale", async () => {
    await q(`update public.ticket_tiers set quantity = quantity_sold + coalesce(quantity_reserved,0) where id=$1`, [s.evA.tier_id]);
    await client.query("savepoint soldout");
    await expect(
      q(`select public.create_walkin_order($1,'Late','9000000007',$2,null,0,'WALKIN_QR',$3)`, [s.evA.id, s.evA.tier_id, randomUUID()]),
    ).rejects.toThrow(/Sold out/);
    await client.query("rollback to savepoint soldout");
  });

  async function qrOf(ticketId: string): Promise<string> {
    return (await q(`select qr_hash from public.tickets where id=$1`, [ticketId]))[0].qr_hash;
  }
});
