-- ================================================================
-- STEP 49: Per-event staff roles — door scan / box-office sell / manager.
-- Checkboxes in the staff forms map to can_scan, can_sell, is_manager on
-- staff_event_assignments. Enforcement lives inside the RPCs below.
-- Run this once in the Supabase SQL editor.
-- ================================================================

alter table public.staff_event_assignments
  add column if not exists can_scan   boolean not null default true,
  add column if not exists can_sell   boolean not null default true,
  add column if not exists is_manager boolean not null default false;

-- Assignment upsert with role flags (6-arg signature replaces the old 3-arg).
drop function if exists public.staff_set_assignment(uuid, uuid, boolean);
create or replace function public.staff_set_assignment(
  p_staff_id uuid,
  p_event_id uuid,
  p_active   boolean,
  p_can_scan   boolean default true,
  p_can_sell   boolean default true,
  p_is_manager boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
  v_org   uuid;
  v_event_org uuid;
begin
  select owner_type, organizer_id into v_owner, v_org from public.staff_members where id = p_staff_id;
  if not found then raise exception 'Staff member not found'; end if;
  select organizer_id into v_event_org from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if v_owner = 'ORGANIZER' and v_org <> v_event_org then
    raise exception 'This staff member can only be assigned to your own events';
  end if;
  insert into public.staff_event_assignments (staff_id, event_id, is_active, can_scan, can_sell, is_manager)
  values (p_staff_id, p_event_id, p_active, p_can_scan, p_can_sell, p_is_manager)
  on conflict (staff_id, event_id) do update set
    is_active  = excluded.is_active,
    can_scan   = excluded.can_scan,
    can_sell   = excluded.can_sell,
    is_manager = excluded.is_manager;
end;
$$;

revoke execute on function public.staff_set_assignment(uuid, uuid, boolean, boolean, boolean, boolean) from public, anon, authenticated;
grant  execute on function public.staff_set_assignment(uuid, uuid, boolean, boolean, boolean, boolean) to service_role;

-- ---- Enforcement: door scan requires can_scan or manager -------------------
create or replace function public.staff_door_session(p_session_token text, p_event_id uuid)
returns table (
  token text, event_id uuid, staff_name text, event_title text,
  organizer_name text, starts_at timestamptz, ends_at timestamptz,
  valid_count integer, checked_in_count integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff  record;
  v_token  text;
  v_event  public.events;
begin
  select s.id, s.name into v_staff
    from public.staff_members s
    join public.staff_sessions ss on ss.staff_id = s.id
   where ss.token_hash = encode(extensions.digest(p_session_token, 'sha256'), 'hex')
     and ss.expires_at > now() and s.is_active = true;
  if not found then raise exception 'Your session has ended. Please sign in again.'; end if;

  if not exists (
    select 1 from public.staff_event_assignments a
     where a.staff_id = v_staff.id and a.event_id = p_event_id and a.is_active = true
       and (a.can_scan or a.is_manager)
  ) then
    raise exception 'You are not assigned to this event';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.scanner_sessions (scanner_pin_id, staff_member_id, event_id, staff_name, token_hash, expires_at)
  values (null, v_staff.id, p_event_id, v_staff.name,
          encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '12 hours');

  return query
    select v_token, v_event.id, v_staff.name, v_event.title,
           coalesce((select o.name from public.organizers o where o.id = v_event.organizer_id), 'Organizer'),
           v_event.starts_at, v_event.ends_at,
           (select count(*)::int from public.tickets t where t.event_id = v_event.id and t.status = 'VALID'),
           (select count(*)::int from public.tickets t where t.event_id = v_event.id and t.status = 'USED');
end;
$$;

revoke execute on function public.staff_door_session(text, uuid) from public, anon, authenticated;
grant execute on function public.staff_door_session(text, uuid) to service_role;

-- ---- Enforcement: counter sales require can_sell or manager ------------------
create or replace function public.create_counter_cash_sale(
  p_staff_id        uuid,
  p_event_id        uuid,
  p_tier_id         uuid,
  p_buyer_name      text,
  p_buyer_phone     text,
  p_buyer_email     text,
  p_mode            text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok    boolean;
  v_res   jsonb;
  v_order uuid;
begin
  if not exists (
    select 1 from public.staff_members s
      join public.staff_event_assignments a on a.staff_id = s.id
     where s.id = p_staff_id and s.is_active and a.event_id = p_event_id and a.is_active
       and (a.can_sell or a.is_manager)
  ) then
    raise exception 'You are not assigned to this event';
  end if;

  v_res := public.create_walkin_order(p_event_id, p_buyer_name, p_buyer_phone, p_tier_id,
                                      nullif(p_buyer_email, ''), 0, p_mode, p_idempotency_key);
  v_order := (v_res->>'orderId')::uuid;

  update public.orders
     set sold_by_staff_id = p_staff_id, sold_at = coalesce(sold_at, now()), sale_channel = 'COUNTER_CASH'
   where id = v_order and sale_channel is null;
  update public.payment_ledger
     set notes = 'Box office cash sale'
   where order_id = v_order and notes = 'Box office sale';

  return v_res;
end;
$$;

create or replace function public.create_counter_reserved_order(
  p_staff_id        uuid,
  p_event_id        uuid,
  p_tier_id         uuid,
  p_buyer_name      text,
  p_buyer_phone     text,
  p_buyer_email     text default null,
  p_buyer_gender    text default null,
  p_idempotency_key text default null
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order        public.orders;
  v_tier         public.ticket_tiers;
  v_event        public.events;
  v_subtotal     integer;
  v_commission   integer;
  v_convenience  integer;
  v_gateway      integer;
  v_gateway_bps  integer;
  v_ttl_min      integer;
  v_platform_fee integer;
  v_total        integer;
  v_payout       integer;
  v_fee_payer    public.fee_payer;
begin
  -- Staff must be active, assigned to this event, and hold counter/manager rights.
  if not exists (
    select 1 from public.staff_members s
      join public.staff_event_assignments a on a.staff_id = s.id
     where s.id = p_staff_id and s.is_active and a.event_id = p_event_id and a.is_active
       and (a.can_sell or a.is_manager)
  ) then
    raise exception 'You are not assigned to this event';
  end if;

  -- Idempotency replay: same key + staff member -> same order back.
  if p_idempotency_key is not null then
    select * into v_order from public.orders
     where idempotency_key = p_idempotency_key and sold_by_staff_id = p_staff_id;
    if found then
      if v_order.status in ('RESERVED', 'CONFIRMED') then return v_order; end if;
      p_idempotency_key := null;
    end if;
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if v_event.status not in ('PUBLISHED', 'POSTPONED') then
    raise exception 'This event is not open for sales';
  end if;

  select * into v_tier from public.ticket_tiers where id = p_tier_id for update;
  if not found then raise exception 'Ticket tier not found'; end if;
  if v_tier.event_id <> p_event_id then raise exception 'Ticket tier does not belong to this event'; end if;
  if v_tier.price_paise = 0 then raise exception 'Free tickets do not need a Razorpay payment'; end if;
  if v_tier.quantity - v_tier.quantity_sold - coalesce(v_tier.quantity_reserved, 0) < 1 then
    raise exception 'Sold out for this ticket tier';
  end if;

  v_gateway_bps := public._setting_int('gateway_fee_bps', 236);
  v_ttl_min     := public._setting_int('reservation_ttl_minutes', 15);
  v_subtotal    := v_tier.price_paise;
  v_commission  := case when coalesce(v_event.commission_enabled, true)
                        then round(v_subtotal * coalesce(v_event.commission_bps, 1000) / 10000.0)
                        else 0 end;
  v_convenience := case when coalesce(v_event.convenience_fee_enabled, true)
                        then round(v_subtotal * coalesce(v_event.convenience_fee_bps, 200) / 10000.0)
                        else 0 end;
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
     set quantity_reserved = quantity_reserved + 1
   where id = p_tier_id;

  insert into public.orders (
    event_id, tier_id, user_id, quantity,
    unit_price_paise, subtotal_paise, platform_fee_paise,
    commission_paise, convenience_fee_paise, gateway_fee_paise, organizer_payout_paise,
    total_paise, fee_payer, status, order_source,
    buyer_name, buyer_phone, buyer_email, buyer_gender,
    is_box_office, sold_by_staff_id, sold_at, sale_channel,
    reserved_at, reservation_expires_at, idempotency_key
  ) values (
    p_event_id, p_tier_id, null, 1,
    v_tier.price_paise, v_subtotal, v_platform_fee,
    v_commission, v_convenience, v_gateway, v_payout,
    v_total, v_fee_payer, 'RESERVED', 'BOX_OFFICE',
    p_buyer_name, p_buyer_phone, nullif(p_buyer_email, ''), p_buyer_gender,
    true, p_staff_id, now(), 'COUNTER_RAZORPAY',
    now(), now() + make_interval(mins => v_ttl_min),
    p_idempotency_key
  )
  returning * into v_order;

  insert into public.payment_intents (
    kind, ref_id, user_id, amount_paise, idempotency_key, expires_at
  ) values (
    'TICKET_ORDER', v_order.id, null, v_order.total_paise,
    p_idempotency_key, v_order.reservation_expires_at
  );

  return v_order;
end;
$$;
