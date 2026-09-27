-- =============================================================================
-- STEP 37 — refund-or-keep becomes an ORDER-level offer, not an event status
--
-- Postponed events are still live events: postpone_event no longer flips the
-- event to POSTPONED. Instead the refund/keep choice rides on
-- orders.refund_offered, set by any consumer-impacting change:
--   - postponement (postpone_event)
--   - date change via edit (updateEvent — set from the app layer)
--   - venue change to a DIFFERENT CITY (updateEvent)
-- A same-city venue change only notifies — no offer.
-- =============================================================================

alter table public.orders
  add column if not exists refund_offered       boolean not null default false,
  add column if not exists refund_offer_reason  text;

create index if not exists orders_refund_offered_idx
  on public.orders(refund_offered) where refund_offered = true;

-- ---------------------------------------------------------------------------
-- postpone_event v2 — keeps the event PUBLISHED (it's still live), updates the
-- dates, notifies ticket holders, and flags their CONFIRMED orders with the
-- refund/keep offer.
-- ---------------------------------------------------------------------------
create or replace function public.postpone_event(
  p_event_id uuid,
  p_new_starts_at timestamptz,
  p_new_ends_at timestamptz,
  p_reason text
)
returns table (notified_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organizer_id uuid;
  v_notified integer := 0;
  v_user_id uuid;
begin
  -- Verify caller is the event organizer
  select e.organizer_id into v_organizer_id
    from public.events e
    join public.organizers o on o.id = e.organizer_id
   where e.id = p_event_id and o.owner_id = auth.uid();
  if not found then
    if not public.is_current_user_admin() then
      raise exception 'Not authorised to postpone this event';
    end if;
  end if;

  -- Event stays live — only the dates move.
  update public.events
     set starts_at = p_new_starts_at, ends_at = p_new_ends_at
   where id = p_event_id;

  -- Flag the refund/keep offer on every confirmed order for this event.
  update public.orders
     set refund_offered = true,
         refund_offer_reason = p_reason
   where event_id = p_event_id
     and status = 'CONFIRMED';

  -- Notify all confirmed ticket holders
  for v_user_id in
    select distinct user_id from public.orders
     where event_id = p_event_id and status = 'CONFIRMED' and user_id is not null
  loop
    insert into public.event_notifications (event_id, user_id, type, message)
    values (p_event_id, v_user_id, 'POSTPONEMENT', p_reason);
    v_notified := v_notified + 1;
  end loop;

  return query select v_notified;
end;
$$;

revoke execute on function public.postpone_event(uuid, timestamptz, timestamptz, text) from public, anon;
grant  execute on function public.postpone_event(uuid, timestamptz, timestamptz, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- request_postponement_refund v3 — gate on the order-level offer (or a legacy
-- POSTPONED event) instead of requiring event.status = POSTPONED.
-- ---------------------------------------------------------------------------
create or replace function public.request_postponement_refund(
  p_event_id uuid,
  p_user_id  uuid
)
returns table(order_id uuid, refund_id uuid, amount_paise integer, razorpay_payment_id text, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_existing record;
  v_rid uuid;
begin
  if auth.role() = 'authenticated' and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorised to request a refund for this user';
  end if;

  select o.id, o.subtotal_paise, o.platform_fee_paise, o.tier_id, o.quantity,
         o.status, o.razorpay_payment_id as rzp_payment_id,
         o.refund_offered, o.refund_offer_reason
    into v_order
    from public.orders o
   where o.event_id = p_event_id
     and o.user_id = p_user_id
     and o.status in ('CONFIRMED', 'REFUND_REQUESTED')
   order by (o.status = 'CONFIRMED') desc
   limit 1
   for update of o;

  if not found then raise exception 'No confirmed order found for this event'; end if;

  -- In-flight refund already? Return it — idempotent, before the offer gate
  -- (the offer flag clears once a request lands).
  select r.id, r.amount_paise, r.razorpay_payment_id as rzp_id into v_existing
    from public.refunds r
   where r.order_id = v_order.id
     and r.status not in ('REJECTED','FAILED','COMPLETED')
   limit 1;
  if v_existing.id is not null then
    return query select v_order.id, v_existing.id, v_existing.amount_paise, v_existing.rzp_id, false;
    return;
  end if;

  -- Offer must be live — either flagged on the order or the event carries the
  -- legacy POSTPONED status.
  if not (v_order.refund_offered
          or exists (select 1 from public.events where id = p_event_id and status = 'POSTPONED')) then
    raise exception 'No refund offer is open for this order';
  end if;

  update public.orders o
     set status = 'REFUND_REQUESTED', refund_offered = false, refund_offer_reason = null
   where o.id = v_order.id;
  update public.tickets t set status = 'CANCELLED' where t.order_id = v_order.id;
  update public.ticket_tiers tt
     set quantity_sold = greatest(tt.quantity_sold - v_order.quantity, 0)
   where tt.id = v_order.tier_id;
  update public.events e
     set registrations_count = greatest(e.registrations_count - v_order.quantity, 0)
   where e.id = p_event_id;

  insert into public.refunds (
    order_id, event_id, user_id, amount_paise, platform_fee_paise,
    status, reason, refund_scope, razorpay_payment_id, initiated_at
  ) values (
    v_order.id, p_event_id, p_user_id, v_order.subtotal_paise,
    v_order.platform_fee_paise, 'PENDING',
    coalesce(v_order.refund_offer_reason, 'Refund requested after event change (ticket price only)'),
    'TICKET_PRICE', v_order.rzp_payment_id, now()
  ) returning id into v_rid;

  insert into public.event_notifications (event_id, user_id, type, message)
  values (p_event_id, p_user_id, 'REFUND_INITIATED',
          'Your refund of ₹' || (v_order.subtotal_paise / 100.0)::numeric(10,2)
          || ' (ticket price) is being processed.');

  perform public.offer_waitlist_next(v_order.tier_id);

  return query select v_order.id, v_rid, v_order.subtotal_paise, v_order.rzp_payment_id, true;
end;
$$;

revoke execute on function public.request_postponement_refund(uuid, uuid) from public, anon;
grant  execute on function public.request_postponement_refund(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- decline_refund_offer — the user chose "keep my ticket": clear the flag.
-- ---------------------------------------------------------------------------
create or replace function public.decline_refund_offer(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
     set refund_offered = false, refund_offer_reason = null
   where id = p_order_id
     and user_id = auth.uid()
     and refund_offered = true
     and status = 'CONFIRMED';
  return found;
end;
$$;

revoke execute on function public.decline_refund_offer(uuid) from public, anon;
grant  execute on function public.decline_refund_offer(uuid) to authenticated;

-- Backfill: orders on legacy POSTPONED events carry the offer so their
-- ticket cards still show the refund/keep choice.
update public.orders o
   set refund_offered = true,
       refund_offer_reason = 'Event rescheduled — you can keep your ticket or request a refund.'
  from public.events e
 where o.event_id = e.id
   and e.status = 'POSTPONED'
   and o.status = 'CONFIRMED'
   and o.refund_offered = false;
