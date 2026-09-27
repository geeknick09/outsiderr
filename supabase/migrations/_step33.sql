-- ============================================================================
-- STEP 33 · Money model + payment_intents router
-- ============================================================================
-- Gateway fee (gross-up so Razorpay's ~2.36% cut is covered), per-order
-- idempotency, unified payment_intents table routing every payable kind
-- through one table + one webhook dispatcher. All money computed server-side.

-- 1. orders: gateway fee + REFUND_REQUESTED status + order_source values
alter table public.orders add column if not exists gateway_fee_paise integer not null default 0;

do $$ begin alter type public.order_status add value if not exists 'REFUND_REQUESTED'; exception when others then null; end $$;

alter table public.orders drop constraint if exists orders_order_source_check;
alter table public.orders add constraint orders_order_source_check
  check (order_source = any (array['ONLINE','WALKIN_PREEVENT','WALKIN_QR','WALKIN_INSTANT','BOX_OFFICE','MANUAL_UPI']));

-- Backfill legacy manual-UPI rows (no razorpay order, not box office)
update public.orders
   set order_source = 'MANUAL_UPI'
 where razorpay_order_id is null
   and status in ('CONFIRMED','PENDING_VERIFICATION','REJECTED')
   and not coalesce(is_box_office, false)
   and order_source <> 'MANUAL_UPI';

-- 2. Platform settings (jsonb values)
insert into public.platform_settings (key, value, description) values
  ('gateway_fee_bps', '236'::jsonb, 'Payment gateway fee in basis points charged to the buyer (bundled into the convenience fee line). Default 2.36%.'),
  ('reservation_ttl_minutes', '15'::jsonb, 'Minutes a paid-order reservation holds inventory before expiry.'),
  ('refund_fees_on_cancellation', 'false'::jsonb, 'When true, event-cancellation refunds include convenience + gateway fees (BookMyShow model keeps them when false).')
on conflict (key) do nothing;

-- 3. payment_intents — one router for every payable thing
create table if not exists public.payment_intents (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('TICKET_ORDER','HERO_BOOST','SLOT_BOOST','DOOR_STAFF','CLUB_MEMBERSHIP')),
  ref_id              uuid not null,
  user_id             uuid not null references auth.users(id) on delete cascade,
  amount_paise        integer not null check (amount_paise > 0),
  currency            text not null default 'INR',
  razorpay_order_id   text unique,
  razorpay_payment_id text unique,
  status              text not null default 'CREATED'
                      check (status in ('CREATED','PAID','FAILED','EXPIRED','MISMATCH')),
  razorpay_fee_paise  integer,
  razorpay_tax_paise  integer,
  payment_method      text,
  idempotency_key     text unique,
  expires_at          timestamptz not null,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- At most one live intent per (kind, ref)
create unique index if not exists payment_intents_active_ref_idx
  on public.payment_intents(kind, ref_id) where status in ('CREATED','PAID');
create index if not exists payment_intents_expiry_idx
  on public.payment_intents(status, expires_at) where status = 'CREATED';
create index if not exists payment_intents_user_idx on public.payment_intents(user_id);

alter table public.payment_intents enable row level security;

drop policy if exists "intent owner reads" on public.payment_intents;
create policy "intent owner reads" on public.payment_intents
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "admin reads intents" on public.payment_intents;
create policy "admin reads intents" on public.payment_intents
  for select to authenticated using (public.is_current_user_admin());

revoke insert, update, delete on public.payment_intents from anon, authenticated;
grant insert, update, delete on public.payment_intents to service_role;

-- Helper: read an integer platform setting inside RPCs (jsonb value)
create or replace function public._setting_int(p_key text, p_default integer)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select (value #>> '{}')::integer
       from public.platform_settings where key = p_key),
    p_default
  );
$$;

-- 4. create_reserved_order v2 — idempotency key + gateway fee + intent row.
--    Money is fully server-derived; the old signature (with client-passed
--    amounts) is dropped.
drop function if exists public.create_reserved_order(uuid, uuid, integer, integer, integer, integer, integer, integer, integer, integer, text, text, text, text, text);

create or replace function public.create_reserved_order(
  p_event_id         uuid,
  p_tier_id          uuid,
  p_quantity         integer,
  p_idempotency_key  text default null,
  p_buyer_name       text default null,
  p_buyer_phone      text default null,
  p_buyer_email      text default null,
  p_buyer_gender     text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order    public.orders;
  v_tier     public.ticket_tiers;
  v_event    public.events;
  v_existing_count integer;
  v_subtotal integer;
  v_commission integer;
  v_convenience integer;
  v_gateway  integer;
  v_gateway_bps integer;
  v_ttl_min  integer;
  v_platform_fee integer;
  v_total    integer;
  v_payout   integer;
  v_fee_payer public.fee_payer;
begin
  if auth.uid() is null then raise exception 'Sign in to book tickets'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be at least 1'; end if;

  -- Idempotency replay: same key → same order back (safe double-click/retry)
  if p_idempotency_key is not null then
    select * into v_order from public.orders
     where idempotency_key = p_idempotency_key and user_id = auth.uid();
    if found then
      if v_order.status = 'RESERVED' then return v_order; end if;
      if v_order.status = 'CONFIRMED' then raise exception 'You already have an active booking for this event'; end if;
      -- FAILED/EXPIRED/CANCELLED with same key → fall through to a fresh order
      -- (key already consumed, so clear it to avoid unique collisions)
      p_idempotency_key := null;
    end if;
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if v_event.status not in ('PUBLISHED', 'POSTPONED') then
    raise exception 'This event is not open for booking';
  end if;
  if (case when coalesce(v_event.allow_booking_during_event, false)
           then coalesce(v_event.ends_at, v_event.starts_at)
           else v_event.starts_at end) <= now() then
    raise exception 'Online booking is closed for this event';
  end if;

  select * into v_tier from public.ticket_tiers where id = p_tier_id for update;
  if not found then raise exception 'Ticket tier not found'; end if;
  if v_tier.event_id <> p_event_id then raise exception 'Ticket tier does not belong to this event'; end if;
  if v_tier.price_paise = 0 then raise exception 'Use the free order flow for free tickets'; end if;
  if v_tier.quantity - v_tier.quantity_sold - coalesce(v_tier.quantity_reserved, 0) < p_quantity then
    raise exception 'Not enough tickets available';
  end if;

  select count(*) into v_existing_count
    from public.orders
   where event_id = p_event_id and user_id = auth.uid()
     and status in ('CONFIRMED','RESERVED','PENDING_VERIFICATION','REFUND_REQUESTED');
  if v_existing_count > 0 then
    raise exception 'You already have an active booking for this event';
  end if;

  -- Money: fully server-derived.
  v_gateway_bps := public._setting_int('gateway_fee_bps', 236);
  v_ttl_min     := public._setting_int('reservation_ttl_minutes', 15);
  v_subtotal    := v_tier.price_paise * p_quantity;
  v_commission  := case when coalesce(v_event.commission_enabled, true)
                        then round(v_subtotal * coalesce(v_event.commission_bps, 1000) / 10000.0)
                        else 0 end;
  v_convenience := case when coalesce(v_event.convenience_fee_enabled, true)
                        then round(v_subtotal * coalesce(v_event.convenience_fee_bps, 200) / 10000.0)
                        else 0 end;
  -- Gross-up: gateway fee on (subtotal + convenience + gateway) covers
  -- Razorpay's cut of the collected total.
  v_gateway     := round((v_subtotal + v_convenience) * v_gateway_bps / (10000.0 - v_gateway_bps));
  v_platform_fee := v_commission + v_convenience;
  v_fee_payer   := coalesce(v_event.fee_payer, 'BUYER');

  if v_fee_payer = 'ORGANIZER' then
    v_total  := v_subtotal;
    v_payout := v_subtotal - v_commission - v_convenience - v_gateway;
  else
    v_total  := v_subtotal + v_convenience + v_gateway;
    v_payout := v_subtotal - v_commission;
  end if;

  update public.ticket_tiers
     set quantity_reserved = quantity_reserved + p_quantity
   where id = p_tier_id;

  insert into public.orders (
    event_id, tier_id, user_id, quantity,
    unit_price_paise, subtotal_paise, platform_fee_paise,
    commission_paise, convenience_fee_paise, gateway_fee_paise, organizer_payout_paise,
    total_paise, fee_payer, status, order_source,
    buyer_name, buyer_phone, buyer_email, buyer_gender,
    reserved_at, reservation_expires_at, idempotency_key
  ) values (
    p_event_id, p_tier_id, auth.uid(), p_quantity,
    v_tier.price_paise, v_subtotal, v_platform_fee,
    v_commission, v_convenience, v_gateway, v_payout,
    v_total, v_fee_payer, 'RESERVED', 'ONLINE',
    p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender,
    now(), now() + make_interval(mins => v_ttl_min),
    p_idempotency_key
  )
  returning * into v_order;

  insert into public.payment_intents (
    kind, ref_id, user_id, amount_paise, idempotency_key, expires_at
  ) values (
    'TICKET_ORDER', v_order.id, v_order.user_id, v_order.total_paise,
    p_idempotency_key, v_order.reservation_expires_at
  );

  return v_order;
end;
$$;

revoke execute on function public.create_reserved_order(uuid, uuid, integer, text, text, text, text, text) from public, anon;
grant  execute on function public.create_reserved_order(uuid, uuid, integer, text, text, text, text, text) to authenticated;

-- 5. create_payment_intent — non-order payables (boost/door-staff/club).
--    Amount + ownership validated server-side per kind.
create or replace function public.create_payment_intent(
  p_kind            text,
  p_ref_id          uuid,
  p_idempotency_key text default null
)
returns public.payment_intents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent  public.payment_intents;
  v_amount  integer;
  v_owner   uuid;
  v_ttl_min integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  v_ttl_min := public._setting_int('reservation_ttl_minutes', 15);

  -- Idempotency replay
  if p_idempotency_key is not null then
    select * into v_intent from public.payment_intents
     where idempotency_key = p_idempotency_key and user_id = auth.uid();
    if found then
      if v_intent.status = 'CREATED' and v_intent.expires_at > now() then return v_intent; end if;
      if v_intent.status = 'PAID' then raise exception 'This payment was already completed'; end if;
      p_idempotency_key := null;
    end if;
  end if;

  -- Reuse a live intent for the same ref (unique index enforces one anyway)
  select * into v_intent from public.payment_intents
   where kind = p_kind and ref_id = p_ref_id and status in ('CREATED','PAID');
  if found then
    if v_intent.status = 'PAID' then raise exception 'This payment was already completed'; end if;
    if v_intent.user_id <> auth.uid() then raise exception 'Not authorized'; end if;
    if v_intent.expires_at > now() then return v_intent; end if;
  end if;

  -- Resolve amount + ownership per kind
  if p_kind = 'HERO_BOOST' then
    select hb.amount_paise, o.owner_id into v_amount, v_owner
      from public.hero_boosts hb
      join public.organizers o on o.id = hb.organizer_id
     where hb.id = p_ref_id and hb.status = 'PENDING';
    if not found or v_owner <> auth.uid() then raise exception 'Not authorized'; end if;

  elsif p_kind = 'SLOT_BOOST' then
    select bsp.price_paise, o.owner_id into v_amount, v_owner
      from public.boosts b
      join public.organizers o on o.id = b.organizer_id
      join public.boost_slot_prices bsp on bsp.slot = b.slot
     where b.id = p_ref_id and b.status = 'PENDING';
    if not found or v_owner <> auth.uid() then raise exception 'Not authorized'; end if;

  elsif p_kind = 'DOOR_STAFF' then
    select d.service_amount_paise, o.owner_id into v_amount, v_owner
      from public.door_staff_orders d
      join public.organizers o on o.id = d.organizer_id
     where d.id = p_ref_id and d.payment_status <> 'PAID';
    if not found or v_owner <> auth.uid() then raise exception 'Not authorized'; end if;

  elsif p_kind = 'CLUB_MEMBERSHIP' then
    select cl.membership_fee_paise, cm.user_id into v_amount, v_owner
      from public.club_members cm
      join public.clubs cl on cl.id = cm.club_id
     where cm.id = p_ref_id and cm.status = 'PENDING';
    if not found or v_owner <> auth.uid() then raise exception 'Not authorized'; end if;
    if v_amount is null or v_amount <= 0 then raise exception 'This club is free — no payment needed'; end if;

  else
    raise exception 'Unknown payment kind: %', p_kind;
  end if;

  if v_amount is null or v_amount <= 0 then raise exception 'Invalid amount'; end if;

  insert into public.payment_intents (kind, ref_id, user_id, amount_paise, idempotency_key, expires_at)
  values (p_kind, p_ref_id, auth.uid(), v_amount, p_idempotency_key,
          now() + make_interval(mins => v_ttl_min))
  returning * into v_intent;

  return v_intent;
end;
$$;

revoke execute on function public.create_payment_intent(text, uuid, text) from public, anon;
grant  execute on function public.create_payment_intent(text, uuid, text) to authenticated;

-- 6. attach_razorpay_order — links the gateway order to the intent (and to
--    orders.razorpay_order_id for TICKET_ORDER). Service-only.
create or replace function public.attach_razorpay_order(
  p_intent_id         uuid,
  p_razorpay_order_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.payment_intents;
begin
  select * into v_intent from public.payment_intents where id = p_intent_id for update;
  if not found then raise exception 'Payment intent not found'; end if;
  if v_intent.status <> 'CREATED' then raise exception 'Intent is %, cannot attach', v_intent.status; end if;

  update public.payment_intents
     set razorpay_order_id = p_razorpay_order_id, updated_at = now()
   where id = p_intent_id;

  if v_intent.kind = 'TICKET_ORDER' then
    update public.orders
       set razorpay_order_id = p_razorpay_order_id
     where id = v_intent.ref_id;
  elsif v_intent.kind = 'HERO_BOOST' then
    update public.hero_boosts set razorpay_order_id = p_razorpay_order_id where id = v_intent.ref_id;
  end if;
end;
$$;

revoke execute on function public.attach_razorpay_order(uuid, text) from public, anon, authenticated;
grant  execute on function public.attach_razorpay_order(uuid, text) to service_role;

-- payment_intents participates in realtime for the checkout status page
do $$
begin
  alter publication supabase_realtime add table public.payment_intents;
exception when duplicate_object then null;
end $$;