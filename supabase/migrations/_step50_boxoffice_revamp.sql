-- ================================================================
-- STEP 50: Box-office revamp + door-scanner guestlist check-in.
--  - orders.payment_reference: staff-recorded UPI UTR / proof note
--  - tickets.checked_in_by_staff_id: which staff member checked a guest in
--  - create_counter_sale(): one order + N tickets (cash / manual UPI),
--    qty capped by events.max_tickets_per_user, fee math in DB
--  - staff_check_in_guest(): irreversible guestlist check-in for door staff
-- Run this once in the Supabase SQL editor.
-- ================================================================

alter table public.orders  add column if not exists payment_reference text;
alter table public.tickets add column if not exists checked_in_by_staff_id uuid references public.staff_members(id);

-- One counter sale -> one order + N tickets. payment_mode: 'CASH' | 'UPI'
-- (manual confirm at the counter - no gateway fee either way).
create or replace function public.create_counter_sale(
  p_staff_id        uuid,
  p_event_id        uuid,
  p_tier_id         uuid,
  p_buyer_name      text,
  p_buyer_phone     text,
  p_buyer_email     text   default null,
  p_payment_mode    text   default 'CASH',
  p_quantity        integer default 1,
  p_idempotency_key text   default null,
  p_payment_ref     text   default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event        public.events;
  v_tier         public.ticket_tiers;
  v_order        public.orders;
  v_ticket       uuid;
  v_ticket_ids   uuid[] := '{}';
  v_existing     public.orders;
  v_subtotal     integer;
  v_commission   integer;
  v_convenience  integer;
  v_gst          integer;
  v_platform_fee integer;
  v_total        integer;
  v_payout       integer;
  v_fee_payer    public.fee_payer;
  i              integer;
begin
  if p_payment_mode not in ('CASH','UPI') then raise exception 'Invalid payment mode'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be at least 1'; end if;

  -- Staff must be active + hold counter/manager rights for this event.
  if not exists (
    select 1 from public.staff_members s
      join public.staff_event_assignments a on a.staff_id = s.id
     where s.id = p_staff_id and s.is_active and a.event_id = p_event_id and a.is_active
       and (a.can_sell or a.is_manager)
  ) then
    raise exception 'You are not assigned to this event';
  end if;

  -- Idempotency replay.
  if p_idempotency_key is not null then
    select * into v_existing from public.orders
      where idempotency_key = p_idempotency_key and sold_by_staff_id = p_staff_id;
    if v_existing.id is not null then
      select array_agg(id) into v_ticket_ids from public.tickets where order_id = v_existing.id;
      return jsonb_build_object('orderId', v_existing.id, 'ticketIds', v_ticket_ids,
        'totalPaise', v_existing.total_paise, 'quantity', v_existing.quantity);
    end if;
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if v_event.status not in ('PUBLISHED','POSTPONED') then
    raise exception 'This event is not open for sales';
  end if;
  if p_quantity > v_event.max_tickets_per_user then
    raise exception 'Max % tickets per order', v_event.max_tickets_per_user;
  end if;

  select * into v_tier from public.ticket_tiers where id = p_tier_id for update;
  if not found or v_tier.event_id <> p_event_id then raise exception 'Ticket tier not found'; end if;
  if v_tier.quantity - v_tier.quantity_sold - coalesce(v_tier.quantity_reserved, 0) < p_quantity then
    raise exception 'Not enough tickets left for this tier';
  end if;

  -- Money: no gateway fee at the counter (cash/UPI collected directly).
  v_subtotal    := v_tier.price_paise * p_quantity;
  v_commission  := case when coalesce(v_event.commission_enabled, true)
                        then round(v_subtotal * coalesce(v_event.commission_bps, 1000) / 10000.0)
                        else 0 end;
  v_convenience := case when coalesce(v_event.convenience_fee_enabled, true)
                        then round(v_subtotal * coalesce(v_event.convenience_fee_bps, 200) / 10000.0)
                        else 0 end;
  v_gst         := round((v_commission + v_convenience) * 0.18);
  v_platform_fee := v_commission + v_convenience + v_gst;
  v_fee_payer   := coalesce(v_event.fee_payer, 'BUYER');
  if v_fee_payer = 'ORGANIZER' then
    v_total  := v_subtotal;
    v_payout := v_subtotal - v_platform_fee;
  else
    v_total  := v_subtotal + v_convenience + v_gst;
    v_payout := v_subtotal - v_commission;
  end if;

  update public.ticket_tiers set quantity_sold = quantity_sold + p_quantity where id = p_tier_id;

  insert into public.orders (
    event_id, tier_id, user_id, quantity,
    unit_price_paise, subtotal_paise, platform_fee_paise,
    commission_paise, convenience_fee_paise, gateway_fee_paise, organizer_payout_paise,
    total_paise, fee_payer, status, order_source,
    buyer_name, buyer_phone, buyer_email,
    is_box_office, sold_by_staff_id, sold_at, sale_channel,
    payment_reference, idempotency_key
  ) values (
    p_event_id, p_tier_id, null, p_quantity,
    v_tier.price_paise, v_subtotal, v_platform_fee,
    v_commission, v_convenience, 0, v_payout,
    v_total, v_fee_payer, 'CONFIRMED', 'BOX_OFFICE',
    p_buyer_name, p_buyer_phone, nullif(p_buyer_email, ''),
    true, p_staff_id, now(),
    case when p_payment_mode = 'UPI' then 'COUNTER_UPI' else 'COUNTER_CASH' end,
    nullif(btrim(coalesce(p_payment_ref, '')), ''),
    p_idempotency_key
  )
  returning * into v_order;

  for i in 1..p_quantity loop
    insert into public.tickets (event_id, order_id, tier_id, qr_hash, status)
    values (p_event_id, v_order.id, p_tier_id, encode(gen_random_uuid()::text::bytea, 'hex'), 'VALID')
    returning id into v_ticket;
    v_ticket_ids := v_ticket_ids || v_ticket;
  end loop;

  return jsonb_build_object('orderId', v_order.id, 'ticketIds', v_ticket_ids,
    'totalPaise', v_total, 'quantity', p_quantity, 'subtotalPaise', v_subtotal,
    'commissionPaise', v_commission, 'conveniencePaise', v_convenience,
    'gstPaise', v_gst, 'payoutPaise', v_payout);
end;
$$;

revoke execute on function public.create_counter_sale(uuid, uuid, uuid, text, text, text, text, integer, text, text) from public, anon, authenticated;
grant  execute on function public.create_counter_sale(uuid, uuid, uuid, text, text, text, text, integer, text, text) to service_role;

-- Irreversible guestlist check-in for door staff (guestlist tickets are
-- orders.order_source='GUESTLIST'; USED is terminal - can't uncheck).
create or replace function public.staff_check_in_guest(
  p_staff_id uuid,
  p_event_id uuid,
  p_ticket_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.staff_members s
      join public.staff_event_assignments a on a.staff_id = s.id
     where s.id = p_staff_id and s.is_active and a.event_id = p_event_id and a.is_active
       and (a.can_scan or a.is_manager)
  ) then
    raise exception 'You are not assigned to this event';
  end if;

  update public.tickets t
     set status = 'USED', checked_in_at = now(), checked_in_by_staff_id = p_staff_id
   from public.orders o
   where t.id = p_ticket_id and o.id = t.order_id
     and o.event_id = p_event_id and o.order_source = 'GUESTLIST'
     and t.status = 'VALID';
  if not found then raise exception 'Ticket not found or already checked in'; end if;
end;
$$;

revoke execute on function public.staff_check_in_guest(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function public.staff_check_in_guest(uuid, uuid, uuid) to service_role;
