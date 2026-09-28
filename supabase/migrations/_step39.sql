-- =============================================================================
-- STEP 39 — per-event max tickets per user
--
-- events.max_tickets_per_user (1–10, default 5) caps the TOTAL tickets one
-- account can hold for an event across all orders and tiers. Replaces the
-- flat "one active order" guard — a user can place multiple orders until the
-- cap is reached. Each ticket still mints its own QR.
-- =============================================================================

alter table public.events
  add column if not exists max_tickets_per_user integer not null default 5;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_max_tickets_per_user_check') then
    alter table public.events
      add constraint events_max_tickets_per_user_check
      check (max_tickets_per_user between 1 and 10);
  end if;
end $$;

-- Orders can now carry up to 10 tickets (the event cap enforces the real limit).
alter table public.orders drop constraint if exists orders_quantity_check;
alter table public.orders add constraint orders_quantity_check
  check (quantity >= 1 and quantity <= 10);

-- Column grant so organizers can set it on create/edit.
grant update (max_tickets_per_user) on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- create_reserved_order — cap = sum(quantity) of the user's active orders on
-- the event + this order must fit. (8-arg live signature.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_reserved_order(p_event_id uuid, p_tier_id uuid, p_quantity integer, p_idempotency_key text DEFAULT NULL::text, p_buyer_name text DEFAULT NULL::text, p_buyer_phone text DEFAULT NULL::text, p_buyer_email text DEFAULT NULL::text, p_buyer_gender text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order    public.orders;
  v_tier     public.ticket_tiers;
  v_event    public.events;
  v_existing_count integer;
  v_cap      integer;
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
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then raise exception 'Quantity must be between 1 and 10'; end if;

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

  v_cap := greatest(1, least(coalesce(v_event.max_tickets_per_user, 5), 10));
  select coalesce(sum(quantity), 0) into v_existing_count
    from public.orders
   where event_id = p_event_id and user_id = auth.uid()
     and status in ('CONFIRMED','RESERVED','PENDING_VERIFICATION','REFUND_REQUESTED');
  if v_existing_count + p_quantity > v_cap then
    raise exception 'You can book at most % ticket(s) for this event (you already hold %)', v_cap, v_existing_count;
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
$function$


-- ---------------------------------------------------------------------------
-- create_free_order — same cap for free RSVPs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_free_order(p_event_id uuid, p_tier_id uuid, p_quantity integer, p_buyer_name text DEFAULT NULL::text, p_buyer_phone text DEFAULT NULL::text, p_buyer_email text DEFAULT NULL::text, p_buyer_gender text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order   public.orders;
  v_tier    public.ticket_tiers;
  v_event   public.events;
  v_booked  integer;
  v_cap     integer;
begin
  if auth.uid() is null then raise exception 'Sign in to RSVP'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Quantity must be between 1 and 10';
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
  if v_tier.price_paise <> 0 then raise exception 'This function is for free tickets only'; end if;
  if v_tier.quantity - v_tier.quantity_sold - coalesce(v_tier.quantity_reserved, 0) < p_quantity then
    raise exception 'Not enough tickets left';
  end if;

  v_cap := greatest(1, least(coalesce(v_event.max_tickets_per_user, 5), 10));
  select coalesce(sum(quantity), 0) into v_booked
    from public.orders
   where event_id = p_event_id and user_id = auth.uid()
     and status in ('CONFIRMED', 'PENDING_VERIFICATION', 'RESERVED');
  if v_booked + p_quantity > v_cap then
    raise exception 'You can book at most % ticket(s) for this event (you already hold %)', v_cap, v_booked;
  end if;

  insert into public.orders (
    event_id, tier_id, user_id, quantity,
    unit_price_paise, subtotal_paise, platform_fee_paise, total_paise,
    fee_payer, status, buyer_name, buyer_phone, buyer_email, buyer_gender
  ) values (
    p_event_id, p_tier_id, auth.uid(), p_quantity,
    0, 0, 0, 0,
    v_event.fee_payer, 'CONFIRMED', p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender
  )
  returning * into v_order;

  insert into public.tickets (order_id, event_id, tier_id, user_id, qr_hash)
  select
    v_order.id,
    p_event_id,
    p_tier_id,
    auth.uid(),
    encode(
      sha256((v_order.id::text || ':' || g::text || ':' || gen_random_uuid()::text)::bytea),
      'hex'
    )
  from generate_series(1, p_quantity) g;

  update public.ticket_tiers
     set quantity_sold = quantity_sold + p_quantity
   where id = p_tier_id;

  update public.events
     set registrations_count = registrations_count + p_quantity
   where id = p_event_id;

  delete from public.waitlist
   where tier_id = p_tier_id and user_id = auth.uid();

  return v_order;
end;
$function$


-- ---------------------------------------------------------------------------
-- join_waitlist — block only when the user has already hit the ticket cap.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_waitlist(p_event_id uuid, p_tier_id uuid)
 RETURNS waitlist
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_entry public.waitlist;
  v_pos   integer;
  v_cap   integer;
  v_booked integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to join the waitlist';
  end if;
  perform 1 from public.ticket_tiers where id = p_tier_id for update;
  if not found then raise exception 'Ticket tier not found'; end if;
  if not exists (select 1 from public.ticket_tiers where id = p_tier_id and event_id = p_event_id) then
    raise exception 'Ticket tier does not belong to this event';
  end if;
  if not exists (select 1 from public.events where id = p_event_id and waitlist_enabled) then
    raise exception 'Waitlist is not enabled for this event';
  end if;

  select greatest(1, least(coalesce(e.max_tickets_per_user, 5), 10)) into v_cap
    from public.events e where e.id = p_event_id;
  select coalesce(sum(quantity), 0) into v_booked
    from public.orders
   where event_id = p_event_id and user_id = auth.uid()
     and status in ('CONFIRMED', 'PENDING_VERIFICATION', 'RESERVED');
  if v_booked >= v_cap then
    raise exception 'You already have a ticket for this event';
  end if;

  select * into v_entry from public.waitlist where tier_id = p_tier_id and user_id = auth.uid();
  if found then return v_entry; end if;
  select coalesce(max(position), 0) + 1 into v_pos from public.waitlist where tier_id = p_tier_id;
  insert into public.waitlist (event_id, tier_id, user_id, position)
  values (p_event_id, p_tier_id, auth.uid(), v_pos)
  on conflict (tier_id, user_id) do nothing
  returning * into v_entry;
  if v_entry.id is null then
    select * into v_entry from public.waitlist where tier_id = p_tier_id and user_id = auth.uid();
  end if;
  return v_entry;
end;
$function$

