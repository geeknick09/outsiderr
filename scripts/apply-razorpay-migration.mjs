import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");
const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();

if (!dbPassword) {
  console.error("SUPABASE_DB_PASSWORD not found in .env");
  process.exit(1);
}

const dbClient = new pg.Client({
  connectionString: `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await dbClient.connect();
  console.log("=== Applying Razorpay migration ===\n");

  // 1. Extend order_status enum with new values (must be done outside transaction for ALTER TYPE ADD VALUE)
  console.log("1. Extending order_status enum...");
  for (const val of ["REFUNDED", "RESERVED", "EXPIRED", "FAILED"]) {
    try {
      await dbClient.query(`alter type order_status add value if not exists '${val}'`);
      console.log(`   ✓ added '${val}'`);
    } catch (e) {
      // "enum label already exists" is expected and safe
      console.log(`   - '${val}' already exists (${e.message.split("\n")[0]})`);
    }
  }

  // 2. Add Razorpay columns to orders
  console.log("\n2. Adding Razorpay columns to orders...");
  const orderCols = [
    "razorpay_order_id text",
    "razorpay_payment_id text",
    "razorpay_signature text",
    "payment_method text",
    "reserved_at timestamptz",
    "reservation_expires_at timestamptz",
    "confirmed_at timestamptz",
    "invoice_number text",
  ];
  for (const col of orderCols) {
    const colName = col.split(" ")[0];
    await dbClient.query(`alter table public.orders add column if not exists ${col}`);
    console.log(`   ✓ orders.${colName}`);
  }

  // 3. Add quantity_reserved to ticket_tiers
  console.log("\n3. Adding quantity_reserved to ticket_tiers...");
  await dbClient.query(`alter table public.ticket_tiers add column if not exists quantity_reserved integer not null default 0`);
  console.log("   ✓ ticket_tiers.quantity_reserved");
  try {
    await dbClient.query(`alter table public.ticket_tiers add constraint ticket_tiers_not_overreserved check (quantity_sold + quantity_reserved <= quantity)`);
    console.log("   ✓ constraint ticket_tiers_not_overreserved");
  } catch (e) {
    console.log(`   - constraint already exists (${e.message.split("\n")[0]})`);
  }

  // 4. Unique indexes for Razorpay IDs
  console.log("\n4. Creating unique indexes...");
  await dbClient.query(`create unique index if not exists orders_razorpay_order_id_idx on public.orders(razorpay_order_id) where razorpay_order_id is not null`);
  console.log("   ✓ orders_razorpay_order_id_idx");
  await dbClient.query(`create unique index if not exists orders_razorpay_payment_id_idx on public.orders(razorpay_payment_id) where razorpay_payment_id is not null`);
  console.log("   ✓ orders_razorpay_payment_id_idx");
  await dbClient.query(`create index if not exists orders_reservation_expires_idx on public.orders(reservation_expires_at) where status = 'RESERVED'`);
  console.log("   ✓ orders_reservation_expires_idx");

  // 5. Add Razorpay columns to hero_boosts
  console.log("\n5. Adding Razorpay columns to hero_boosts...");
  await dbClient.query(`alter table public.hero_boosts add column if not exists razorpay_order_id text`);
  await dbClient.query(`alter table public.hero_boosts add column if not exists razorpay_payment_id text`);
  await dbClient.query(`create unique index if not exists hero_boosts_razorpay_order_idx on public.hero_boosts(razorpay_order_id) where razorpay_order_id is not null`);
  console.log("   ✓ hero_boosts.razorpay_order_id + razorpay_payment_id + unique index");

  // 6. Add Razorpay columns to refunds
  console.log("\n6. Adding Razorpay columns to refunds...");
  const refundCols = [
    "razorpay_refund_id text",
    "razorpay_payment_id text",
    "refund_type text default 'FULL' check (refund_type in ('FULL','PARTIAL'))",
    "initiated_by uuid references auth.users(id)",
    "gateway_fee_paise integer not null default 0",
  ];
  for (const col of refundCols) {
    const colName = col.split(" ")[0];
    await dbClient.query(`alter table public.refunds add column if not exists ${col}`);
    console.log(`   ✓ refunds.${colName}`);
  }

  // 7. Create new tables
  console.log("\n7. Creating new tables...");
  await dbClient.query(`
    create table if not exists public.webhook_events (
      id                  uuid        primary key default gen_random_uuid(),
      razorpay_event_id   text        not null unique,
      event_type          text        not null,
      payload             jsonb       not null,
      order_id            uuid        references public.orders(id),
      processed           boolean     not null default false,
      error_message       text,
      created_at          timestamptz not null default now(),
      processed_at        timestamptz
    )
  `);
  await dbClient.query(`create index if not exists webhook_events_razorpay_event_idx on public.webhook_events(razorpay_event_id)`);
  await dbClient.query(`create index if not exists webhook_events_order_idx on public.webhook_events(order_id)`);
  await dbClient.query(`create index if not exists webhook_events_unprocessed_idx on public.webhook_events(processed) where not processed`);
  console.log("   ✓ webhook_events");

  await dbClient.query(`
    create table if not exists public.payment_ledger (
      id                      uuid        primary key default gen_random_uuid(),
      order_id                uuid        references public.orders(id),
      event_id                uuid        references public.events(id),
      organizer_id            uuid        references public.organizers(id),
      type                    text        not null check (type in ('TICKET_SALE','BOOST_SALE','REFUND','PAYOUT','ADJUSTMENT')),
      gross_amount_paise      integer     not null,
      commission_paise        integer     not null default 0,
      convenience_fee_paise   integer     not null default 0,
      razorpay_fee_paise      integer     not null default 0,
      refund_amount_paise     integer     not null default 0,
      net_organizer_paise     integer     not null default 0,
      net_platform_paise      integer     not null default 0,
      razorpay_payment_id     text,
      razorpay_refund_id      text,
      notes                   text,
      created_at              timestamptz not null default now()
    )
  `);
  await dbClient.query(`create index if not exists ledger_event_idx on public.payment_ledger(event_id)`);
  await dbClient.query(`create index if not exists ledger_organizer_idx on public.payment_ledger(organizer_id)`);
  await dbClient.query(`create index if not exists ledger_order_idx on public.payment_ledger(order_id)`);
  await dbClient.query(`create index if not exists ledger_type_idx on public.payment_ledger(type)`);
  console.log("   ✓ payment_ledger");

  await dbClient.query(`
    create table if not exists public.payout_records (
      id                uuid        primary key default gen_random_uuid(),
      organizer_id      uuid        not null references public.organizers(id) on delete cascade,
      event_id          uuid        references public.events(id),
      amount_paise      integer     not null check (amount_paise > 0),
      status            text        not null default 'PENDING' check (status in ('PENDING','PROCESSING','COMPLETED','FAILED')),
      bank_reference    text,
      notes             text,
      initiated_by      uuid        references auth.users(id),
      initiated_at      timestamptz not null default now(),
      completed_at      timestamptz
    )
  `);
  await dbClient.query(`create index if not exists payout_organizer_idx on public.payout_records(organizer_id)`);
  await dbClient.query(`create index if not exists payout_event_idx on public.payout_records(event_id)`);
  await dbClient.query(`create index if not exists payout_status_idx on public.payout_records(status)`);
  console.log("   ✓ payout_records");

  // 8. Invoice number sequence
  console.log("\n8. Creating invoice_number_seq...");
  await dbClient.query(`create sequence if not exists invoice_number_seq start with 10001`);
  console.log("   ✓ invoice_number_seq");

  // 9. Enable RLS on new tables
  console.log("\n9. Enabling RLS on new tables...");
  await dbClient.query(`alter table public.webhook_events enable row level security`);
  await dbClient.query(`alter table public.payment_ledger enable row level security`);
  await dbClient.query(`alter table public.payout_records enable row level security`);
  console.log("   ✓ RLS enabled on webhook_events, payment_ledger, payout_records");

  // 10. RLS policies for new tables
  console.log("\n10. Adding RLS policies...");
  await dbClient.query(`drop policy if exists "admin read webhook events" on public.webhook_events`);
  await dbClient.query(`create policy "admin read webhook events" on public.webhook_events for select using (public.is_current_user_admin())`);
  await dbClient.query(`drop policy if exists "admin update webhook events" on public.webhook_events`);
  await dbClient.query(`create policy "admin update webhook events" on public.webhook_events for update using (public.is_current_user_admin())`);

  await dbClient.query(`drop policy if exists "admin read all ledger" on public.payment_ledger`);
  await dbClient.query(`create policy "admin read all ledger" on public.payment_ledger for select using (public.is_current_user_admin())`);
  await dbClient.query(`drop policy if exists "organizer read own ledger" on public.payment_ledger`);
  await dbClient.query(`create policy "organizer read own ledger" on public.payment_ledger for select using (organizer_id is not null and exists (select 1 from public.organizers o where o.id = payment_ledger.organizer_id and o.owner_id = auth.uid()))`);

  await dbClient.query(`drop policy if exists "admin read all payouts" on public.payout_records`);
  await dbClient.query(`create policy "admin read all payouts" on public.payout_records for select using (public.is_current_user_admin())`);
  await dbClient.query(`drop policy if exists "admin insert payouts" on public.payout_records`);
  await dbClient.query(`create policy "admin insert payouts" on public.payout_records for insert with check (public.is_current_user_admin())`);
  await dbClient.query(`drop policy if exists "admin update payouts" on public.payout_records`);
  await dbClient.query(`create policy "admin update payouts" on public.payout_records for update using (public.is_current_user_admin())`);
  await dbClient.query(`drop policy if exists "organizer read own payouts" on public.payout_records`);
  await dbClient.query(`create policy "organizer read own payouts" on public.payout_records for select using (exists (select 1 from public.organizers o where o.id = payout_records.organizer_id and o.owner_id = auth.uid()))`);
  console.log("   ✓ all RLS policies created");

  // 11. Create new RPCs
  console.log("\n11. Creating new RPCs...");
  await dbClient.query(`
    create or replace function public.create_reserved_order(
      p_event_id              uuid,
      p_tier_id               uuid,
      p_quantity              integer,
      p_unit_price_paise      integer,
      p_subtotal_paise        integer,
      p_platform_fee_paise    integer,
      p_commission_paise      integer,
      p_convenience_fee_paise integer,
      p_organizer_payout_paise integer,
      p_total_paise           integer,
      p_fee_payer             text,
      p_buyer_name            text default null,
      p_buyer_phone           text default null,
      p_buyer_email           text default null,
      p_buyer_gender          text default null
    )
    returns public.orders
    language plpgsql
    security definer
    set search_path = public
    as $$
    declare
      v_order   public.orders;
      v_tier    public.ticket_tiers;
      v_event   public.events;
      v_existing_count integer;
    begin
      select * into v_tier from public.ticket_tiers where id = p_tier_id for update;
      if not found then raise exception 'Ticket tier not found'; end if;
      if v_tier.price_paise = 0 then raise exception 'Use the free order flow for free tickets'; end if;
      if v_tier.quantity - v_tier.quantity_sold - v_tier.quantity_reserved < p_quantity then
        raise exception 'Not enough tickets available';
      end if;
      select * into v_event from public.events where id = p_event_id;
      if not found then raise exception 'Event not found'; end if;
      select count(*) into v_existing_count
      from public.orders
      where event_id = p_event_id and user_id = auth.uid()
        and status in ('CONFIRMED', 'RESERVED', 'PENDING_VERIFICATION');
      if v_existing_count > 0 then
        raise exception 'You already have an active booking for this event';
      end if;
      update public.ticket_tiers
         set quantity_reserved = quantity_reserved + p_quantity
       where id = p_tier_id;
      insert into public.orders (
        event_id, tier_id, user_id, quantity,
        unit_price_paise, subtotal_paise, platform_fee_paise,
        commission_paise, convenience_fee_paise, organizer_payout_paise,
        total_paise, fee_payer, status,
        buyer_name, buyer_phone, buyer_email, buyer_gender,
        reserved_at, reservation_expires_at
      ) values (
        p_event_id, p_tier_id, auth.uid(), p_quantity,
        p_unit_price_paise, p_subtotal_paise, p_platform_fee_paise,
        p_commission_paise, p_convenience_fee_paise, p_organizer_payout_paise,
        p_total_paise, p_fee_payer::fee_payer, 'RESERVED',
        p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender,
        now(), now() + interval '15 minutes'
      )
      returning * into v_order;
      return v_order;
    end;
    $$;
  `);
  console.log("   ✓ create_reserved_order");

  await dbClient.query(`
    create or replace function public.confirm_razorpay_order(
      p_order_id            uuid,
      p_razorpay_payment_id text,
      p_razorpay_signature  text,
      p_payment_method      text default null
    )
    returns setof public.tickets
    language plpgsql
    security definer
    set search_path = public
    as $$
    declare
      v_order    public.orders;
      v_tier     public.ticket_tiers;
      v_invoice  text;
    begin
      select * into v_order from public.orders where id = p_order_id for update;
      if not found then raise exception 'Order not found'; end if;
      if v_order.status = 'CONFIRMED' then
        return query select * from public.tickets where order_id = p_order_id;
        return;
      end if;
      if v_order.status <> 'RESERVED' then
        raise exception 'Order is %, cannot confirm', v_order.status;
      end if;
      select * into v_tier from public.ticket_tiers where id = v_order.tier_id for update;
      update public.ticket_tiers
         set quantity_reserved = greatest(quantity_reserved - v_order.quantity, 0),
             quantity_sold = quantity_sold + v_order.quantity
       where id = v_order.tier_id;
      v_invoice := 'OUT-' || to_char(now(), 'YYYYMM') || '-' || nextval('invoice_number_seq');
      update public.orders
         set status = 'CONFIRMED',
             razorpay_payment_id = p_razorpay_payment_id,
             razorpay_signature = p_razorpay_signature,
             payment_method = p_payment_method,
             confirmed_at = now(),
             invoice_number = v_invoice
       where id = p_order_id;
      update public.events
         set registrations_count = registrations_count + v_order.quantity
       where id = v_order.event_id;
      return query
        insert into public.tickets (order_id, event_id, tier_id, user_id, qr_hash)
        select
          v_order.id, v_order.event_id, v_order.tier_id, v_order.user_id,
          encode(sha256((v_order.id::text || ':' || g::text || ':' || gen_random_uuid()::text)::bytea), 'hex')
        from generate_series(1, v_order.quantity) g
        returning *;
    end;
    $$;
  `);
  console.log("   ✓ confirm_razorpay_order");

  await dbClient.query(`
    create or replace function public.fail_razorpay_order(p_order_id uuid)
    returns void
    language plpgsql
    security definer
    set search_path = public
    as $$
    declare v_order public.orders;
    begin
      select * into v_order from public.orders where id = p_order_id for update;
      if not found then return; end if;
      if v_order.status <> 'RESERVED' then return; end if;
      update public.orders set status = 'FAILED' where id = p_order_id;
      update public.ticket_tiers
         set quantity_reserved = greatest(quantity_reserved - v_order.quantity, 0)
       where id = v_order.tier_id;
    end;
    $$;
  `);
  console.log("   ✓ fail_razorpay_order");

  await dbClient.query(`
    create or replace function public.expire_reserved_orders()
    returns integer
    language plpgsql
    security definer
    set search_path = public
    as $$
    declare
      v_count integer := 0;
      v_order record;
    begin
      for v_order in
        select id, tier_id, quantity
          from public.orders
         where status = 'RESERVED' and reservation_expires_at < now()
         for update skip locked
      loop
        update public.orders set status = 'EXPIRED' where id = v_order.id;
        update public.ticket_tiers
           set quantity_reserved = greatest(quantity_reserved - v_order.quantity, 0)
         where id = v_order.tier_id;
        v_count := v_count + 1;
      end loop;
      return v_count;
    end;
    $$;
  `);
  console.log("   ✓ expire_reserved_orders");

  await dbClient.query(`
    create or replace function public.set_razorpay_order_id(
      p_order_id          uuid,
      p_razorpay_order_id text
    )
    returns void
    language plpgsql
    security definer
    set search_path = public
    as $$
    begin
      update public.orders
         set razorpay_order_id = p_razorpay_order_id
       where id = p_order_id and status = 'RESERVED';
    end;
    $$;
  `);
  console.log("   ✓ set_razorpay_order_id");

  // 12. Update cancel_event to handle RESERVED orders
  console.log("\n12. Updating cancel_event RPC...");
  await dbClient.query(`
    create or replace function public.cancel_event(
      p_event_id uuid,
      p_reason text,
      p_cancellation_charge_percent integer default 20
    )
    returns table (
      refund_count integer,
      total_refund_paise bigint,
      total_platform_fee_paise bigint,
      cancellation_charge_paise bigint,
      organizer_owes_paise bigint
    )
    language plpgsql
    security definer
    set search_path = public
    as $$
    declare
      v_organizer_id uuid;
      v_order record;
      v_refund_count integer := 0;
      v_total_refund bigint := 0;
      v_total_fee bigint := 0;
      v_cancel_charge bigint;
    begin
      select e.organizer_id into v_organizer_id
        from public.events e
        join public.organizers o on o.id = e.organizer_id
       where e.id = p_event_id and o.owner_id = auth.uid();
      if not found then
        if not public.is_current_user_admin() then
          raise exception 'Not authorised to cancel this event';
        end if;
        select e.organizer_id into v_organizer_id from public.events e where e.id = p_event_id;
        if not found then raise exception 'Event not found'; end if;
      end if;

      update public.events set status = 'CANCELLATION_REQUESTED'
       where id = p_event_id and organizer_id = v_organizer_id;

      for v_order in
        select id, tier_id, quantity
          from public.orders
         where event_id = p_event_id and status = 'RESERVED'
      loop
        update public.orders set status = 'CANCELLED' where id = v_order.id;
        update public.ticket_tiers
           set quantity_reserved = greatest(quantity_reserved - v_order.quantity, 0)
         where id = v_order.tier_id;
      end loop;

      for v_order in
        select id, user_id, total_paise, platform_fee_paise
          from public.orders
         where event_id = p_event_id and status = 'CONFIRMED'
      loop
        update public.orders set status = 'REFUNDED' where id = v_order.id;
        update public.tickets set status = 'CANCELLED' where order_id = v_order.id;
        insert into public.refunds (order_id, event_id, user_id, amount_paise, platform_fee_paise, status, reason, initiated_at)
        values (v_order.id, p_event_id, v_order.user_id, v_order.total_paise, v_order.platform_fee_paise, 'PENDING', p_reason, now());
        insert into public.event_notifications (event_id, user_id, type, message)
        values (p_event_id, v_order.user_id, 'CANCELLATION', p_reason || ' You will receive a full refund.');
        v_refund_count := v_refund_count + 1;
        v_total_refund := v_total_refund + v_order.total_paise;
        v_total_fee := v_total_fee + v_order.platform_fee_paise;
      end loop;

      update public.events set status = 'CANCELLED'
       where id = p_event_id and organizer_id = v_organizer_id;

      update public.hero_boosts
         set status = 'CANCELLED', cancelled_at = now(), updated_at = now()
       where event_id = p_event_id and status = 'ACTIVE';

      v_cancel_charge := round(v_total_refund * p_cancellation_charge_percent / 100);

      return query select
        v_refund_count,
        v_total_refund,
        v_total_fee,
        v_cancel_charge,
        v_total_refund + v_total_fee + v_cancel_charge;
    end;
    $$;
  `);
  console.log("   ✓ cancel_event updated (now releases RESERVED inventory)");

  // 13. Add realtime publication for new tables
  console.log("\n13. Adding new tables to realtime publication...");
  try {
    await dbClient.query(`alter publication supabase_realtime add table public.webhook_events`);
    console.log("   ✓ webhook_events");
  } catch (e) {
    console.log(`   - webhook_events already in publication (${e.message.split("\n")[0]})`);
  }
  try {
    await dbClient.query(`alter publication supabase_realtime add table public.payout_records`);
    console.log("   ✓ payout_records");
  } catch (e) {
    console.log(`   - payout_records already in publication (${e.message.split("\n")[0]})`);
  }

  // Verify
  console.log("\n=== Verification ===");
  const { rows: enumRows } = await dbClient.query(`select enumlabel from pg_enum where enumtypid = (select oid from pg_type where typname = 'order_status') order by enumsortorder`);
  console.log("order_status values:", enumRows.map(r => r.enumlabel).join(", "));

  const { rows: orderColRows } = await dbClient.query(`select column_name from information_schema.columns where table_name = 'orders' and column_name like 'razorpay%' or column_name in ('payment_method','reserved_at','reservation_expires_at','confirmed_at','invoice_number') order by column_name`);
  console.log("orders Razorpay columns:", orderColRows.map(r => r.column_name).join(", "));

  const { rows: tierColRows } = await dbClient.query(`select column_name from information_schema.columns where table_name = 'ticket_tiers' and column_name = 'quantity_reserved'`);
  console.log("ticket_tiers.quantity_reserved:", tierColRows.length > 0 ? "exists" : "MISSING");

  const { rows: tableRows } = await dbClient.query(`select table_name from information_schema.tables where table_schema = 'public' and table_name in ('webhook_events','payment_ledger','payout_records') order by table_name`);
  console.log("new tables:", tableRows.map(r => r.table_name).join(", "));

  const { rows: rpcRows } = await dbClient.query(`select routine_name from information_schema.routines where routine_schema = 'public' and routine_name in ('create_reserved_order','confirm_razorpay_order','fail_razorpay_order','expire_reserved_orders','set_razorpay_order_id') order by routine_name`);
  console.log("new RPCs:", rpcRows.map(r => r.routine_name).join(", "));

  const { rows: seqRows } = await dbClient.query(`select sequence_name from information_schema.sequences where sequence_schema = 'public' and sequence_name = 'invoice_number_seq'`);
  console.log("invoice_number_seq:", seqRows.length > 0 ? "exists" : "MISSING");

  console.log("\n=== Razorpay migration complete ===");
  await dbClient.end();
  process.exit(0);
})().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
