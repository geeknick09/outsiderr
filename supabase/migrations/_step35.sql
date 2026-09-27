-- ============================================================================
-- STEP 35 · Refund pipeline (BMS model — durable, worker-driven)
-- ============================================================================
-- REQUESTED ─approve→ PENDING ─worker claims→ INITIATING ─Razorpay→ INITIATED
-- ─refund.processed→ COMPLETED · INITIATING/INITIATED ─fail→ FAILED ─retry→ PENDING
-- · REQUESTED ─reject→ REJECTED. Auto flows (cancel/postpone/late capture)
-- insert directly as PENDING. Legacy manual-UPI orders → MANUAL_SETTLED.
-- Refund amount defaults to ticket price (subtotal); convenience + gateway
-- fees are non-refundable unless admin approves a FULL refund.

-- 1. refund_status values + refund columns
-- (enum values are added in _step35a.sql — they must commit before the
--  pending-index WHERE clause below can reference INITIATING.)

alter table public.refunds alter column order_id drop not null;
alter table public.refunds add column if not exists intent_id uuid references public.payment_intents(id);
alter table public.refunds add column if not exists refund_scope text check (refund_scope in ('TICKET_PRICE','FULL','CUSTOM'));
alter table public.refunds add column if not exists requested_by uuid references auth.users(id);
alter table public.refunds add column if not exists approved_by uuid references auth.users(id);
alter table public.refunds add column if not exists approved_at timestamptz;
alter table public.refunds add column if not exists rejected_reason text;
alter table public.refunds add column if not exists claimed_at timestamptz;
alter table public.refunds add column if not exists attempts integer not null default 0;
alter table public.refunds add column if not exists last_error text;
alter table public.refunds add column if not exists receipt text unique default gen_random_uuid()::text;

create index if not exists refunds_pending_idx
  on public.refunds(status, claimed_at) where status in ('PENDING','INITIATING');
create index if not exists refunds_order_idx on public.refunds(order_id);
create index if not exists refunds_intent_idx on public.refunds(intent_id);
create index if not exists refunds_rzp_refund_idx on public.refunds(razorpay_refund_id)
  where razorpay_refund_id is not null;

-- 2. Over-refund guard: Σ active refunds per order ≤ order total;
--    intent-bound refunds ≤ intent amount.
create or replace function public._refunds_check_overrefund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sum bigint;
  v_cap bigint;
begin
  if new.status in ('REJECTED','FAILED') then return new; end if;
  if new.order_id is not null then
    select coalesce(sum(amount_paise),0) into v_sum
      from public.refunds
     where order_id = new.order_id and id <> new.id
       and status not in ('REJECTED','FAILED');
    select total_paise into v_cap from public.orders where id = new.order_id;
  elsif new.intent_id is not null then
    select coalesce(sum(amount_paise),0) into v_sum
      from public.refunds
     where intent_id = new.intent_id and id <> new.id
       and status not in ('REJECTED','FAILED');
    select amount_paise into v_cap from public.payment_intents where id = new.intent_id;
  else
    return new;
  end if;
  if v_sum + new.amount_paise > coalesce(v_cap, 0) then
    raise exception 'Refund total would exceed the paid amount';
  end if;
  return new;
end;
$$;

drop trigger if exists refunds_no_overrefund on public.refunds;
create trigger refunds_no_overrefund
  before insert or update of amount_paise, status, order_id, intent_id
  on public.refunds for each row execute function public._refunds_check_overrefund();

-- 3. request_refund — organizer (event manager) or admin requests a refund on
--    a CONFIRMED order. Goes to REQUESTED → admin review queue.
create or replace function public.request_refund(
  p_order_id uuid,
  p_reason   text
)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  public.orders;
  v_refund public.refunds;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'Please give a reason (at least 10 characters)';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status <> 'CONFIRMED' then
    raise exception 'Only confirmed orders can be refunded';
  end if;
  if not public.is_current_user_admin()
     and not public.is_event_staff(v_order.event_id) then
    raise exception 'Not authorised';
  end if;
  if exists (select 1 from public.refunds
              where order_id = v_order.id
                and status not in ('REJECTED','FAILED','COMPLETED')) then
    raise exception 'A refund is already in progress for this order';
  end if;

  insert into public.refunds (
    order_id, event_id, user_id, amount_paise, platform_fee_paise,
    status, reason, refund_scope, requested_by, initiated_at
  ) values (
    v_order.id, v_order.event_id, v_order.user_id,
    v_order.subtotal_paise, v_order.platform_fee_paise,
    'REQUESTED', trim(p_reason), 'TICKET_PRICE', auth.uid(), now()
  ) returning * into v_refund;

  insert into public.event_notifications (event_id, user_id, type, message)
  select null, p.id, 'REFUND_REQUESTED',
         'Refund requested on order ' || substring(v_order.id::text from 1 for 8)
         || ' — ticket price ₹' || (v_order.subtotal_paise / 100.0)::numeric(10,2)
    from public.profiles p where p.is_admin = true;

  return v_refund;
end;
$$;

revoke execute on function public.request_refund(uuid, text) from public, anon;
grant  execute on function public.request_refund(uuid, text) to authenticated;

-- 4. approve_refund — admin: REQUESTED → PENDING with the chosen scope.
create or replace function public.approve_refund(
  p_refund_id     uuid,
  p_scope         text default 'TICKET_PRICE',
  p_custom_amount integer default null,
  p_note          text default null
)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund public.refunds;
  v_order  public.orders;
  v_amount integer;
begin
  if not public.is_current_user_admin() then raise exception 'Admins only'; end if;
  if p_scope not in ('TICKET_PRICE','FULL','CUSTOM') then raise exception 'Invalid scope'; end if;

  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then raise exception 'Refund not found'; end if;
  if v_refund.status <> 'REQUESTED' then
    raise exception 'Refund is %, cannot approve', v_refund.status;
  end if;

  if v_refund.order_id is not null then
    select * into v_order from public.orders where id = v_refund.order_id for update;
  end if;

  v_amount := case p_scope
    when 'TICKET_PRICE' then coalesce(v_order.subtotal_paise, v_refund.amount_paise)
    when 'FULL'         then coalesce(v_order.total_paise, v_refund.amount_paise)
    else p_custom_amount
  end;
  if v_amount is null or v_amount <= 0 then raise exception 'Invalid refund amount'; end if;

  update public.refunds
     set status = 'PENDING',
         refund_scope = p_scope,
         amount_paise = v_amount,
         approved_by = auth.uid(),
         approved_at = now(),
         rejected_reason = null
   where id = v_refund.id
   returning * into v_refund;

  if v_order.id is not null then
    update public.orders set status = 'REFUND_REQUESTED' where id = v_order.id;
    if p_scope in ('TICKET_PRICE','FULL') then
      update public.tickets set status = 'CANCELLED' where order_id = v_order.id;
      update public.ticket_tiers
         set quantity_sold = greatest(quantity_sold - v_order.quantity, 0)
       where id = v_order.tier_id;
      update public.events
         set registrations_count = greatest(registrations_count - v_order.quantity, 0)
       where id = v_order.event_id;
      perform public.offer_waitlist_next(v_order.tier_id);
    end if;
    insert into public.event_notifications (event_id, user_id, type, message)
    values (v_order.event_id, v_order.user_id, 'REFUND_APPROVED',
            'Your refund of ₹' || (v_amount / 100.0)::numeric(10,2) || ' was approved and is being processed.');
    insert into public.event_notifications (event_id, user_id, type, message)
    select v_order.event_id, o.owner_id, 'REFUND_APPROVED',
           'A refund was approved on order ' || substring(v_order.id::text from 1 for 8) || '.'
      from public.events e join public.organizers o on o.id = e.organizer_id
     where e.id = v_order.event_id;
  end if;

  return v_refund;
end;
$$;

revoke execute on function public.approve_refund(uuid, text, integer, text) from public, anon;
grant  execute on function public.approve_refund(uuid, text, integer, text) to authenticated, service_role;

-- 5. reject_refund — admin: REQUESTED → REJECTED; order stays CONFIRMED.
create or replace function public.reject_refund(
  p_refund_id uuid,
  p_reason    text default null
)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund public.refunds;
begin
  if not public.is_current_user_admin() then raise exception 'Admins only'; end if;
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then raise exception 'Refund not found'; end if;
  if v_refund.status <> 'REQUESTED' then
    raise exception 'Refund is %, cannot reject', v_refund.status;
  end if;

  update public.refunds
     set status = 'REJECTED', rejected_reason = p_reason
   where id = v_refund.id
   returning * into v_refund;

  -- Notify the requesting organizer
  insert into public.event_notifications (event_id, user_id, type, message)
  select v_refund.event_id, o.owner_id, 'REFUND_REJECTED',
         'A refund request on order ' || substring(v_refund.order_id::text from 1 for 8)
         || ' was rejected.' || coalesce(' ' || p_reason, '')
    from public.events e join public.organizers o on o.id = e.organizer_id
   where e.id = v_refund.event_id;

  return v_refund;
end;
$$;

revoke execute on function public.reject_refund(uuid, text) from public, anon;
grant  execute on function public.reject_refund(uuid, text) to authenticated, service_role;

-- 6. claim_pending_refunds — worker pulls work; stale INITIATING (>10 min)
--    is re-claimed. SKIP LOCKED = concurrent workers can't double-take a row.
create or replace function public.claim_pending_refunds(p_limit integer default 20)
returns setof public.refunds
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.refunds
       set status = 'INITIATING',
           claimed_at = now(),
           attempts = attempts + 1
     where id in (
       select id from public.refunds
        where status = 'PENDING'
           or (status = 'INITIATING' and claimed_at < now() - interval '10 minutes')
        order by initiated_at
        limit p_limit
        for update skip locked
     )
    returning *;
end;
$$;

revoke execute on function public.claim_pending_refunds(integer) from public, anon, authenticated;
grant  execute on function public.claim_pending_refunds(integer) to service_role;

-- 7. complete_refund_initiation — Razorpay accepted → INITIATED (+ REFUND
--    ledger row, once); API failure → back to PENDING (retry) or FAILED (≥5).
create or replace function public.complete_refund_initiation(
  p_refund_id           uuid,
  p_razorpay_refund_id  text,
  p_ok                  boolean,
  p_error               text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund public.refunds;
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then raise exception 'Refund not found'; end if;
  if v_refund.status <> 'INITIATING' then return; end if;

  if p_ok then
    update public.refunds
       set status = 'INITIATED',
           razorpay_refund_id = p_razorpay_refund_id,
           last_error = null
     where id = v_refund.id;
    insert into public.payment_ledger (
      order_id, event_id, organizer_id, type, gross_amount_paise,
      net_platform_paise, razorpay_payment_id, notes
    )
    select v_refund.order_id, v_refund.event_id, e.organizer_id, 'REFUND',
           -v_refund.amount_paise, -v_refund.amount_paise,
           'refund_' || p_razorpay_refund_id,
           'Refund initiated via Razorpay'
      from public.events e where e.id = v_refund.event_id
    on conflict (razorpay_payment_id) where razorpay_payment_id is not null do nothing;
  else
    update public.refunds
       set status = case when attempts >= 5 then 'FAILED' else 'PENDING' end,
           last_error = p_error,
           claimed_at = null
     where id = v_refund.id;
    if v_refund.attempts >= 5 then
      insert into public.event_notifications (event_id, user_id, type, message)
      select null, p.id, 'PAYMENT_ALERT',
             'Refund ' || v_refund.id::text || ' failed after 5 attempts: '
             || coalesce(p_error, 'unknown')
        from public.profiles p where p.is_admin = true;
    end if;
  end if;
end;
$$;

revoke execute on function public.complete_refund_initiation(uuid, text, boolean, text) from public, anon, authenticated;
grant  execute on function public.complete_refund_initiation(uuid, text, boolean, text) to service_role;

-- 8. finalize_refund — webhook/reconcile: Razorpay reports terminal state.
create or replace function public.finalize_refund(
  p_razorpay_refund_id text,
  p_status             text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund public.refunds;
begin
  select * into v_refund from public.refunds
   where razorpay_refund_id = p_razorpay_refund_id for update;
  if not found then return 'NOT_FOUND'; end if;
  if v_refund.status in ('COMPLETED','FAILED') then return 'ALREADY_FINAL'; end if;

  if p_status = 'processed' or p_status = 'COMPLETED' then
    update public.refunds
       set status = 'COMPLETED', completed_at = now()
     where id = v_refund.id;
    if v_refund.order_id is not null then
      update public.orders set status = 'REFUNDED'
       where id = v_refund.order_id and status in ('CONFIRMED','REFUND_REQUESTED');
      insert into public.event_notifications (event_id, user_id, type, message)
      values (v_refund.event_id, v_refund.user_id, 'REFUND_COMPLETED',
              'Your refund of ₹' || (v_refund.amount_paise / 100.0)::numeric(10,2)
              || ' is complete. It may take a few days to reflect in your account.');
    end if;
    return 'COMPLETED';
  elsif p_status = 'failed' or p_status = 'FAILED' then
    update public.refunds set status = 'FAILED', last_error = 'Gateway reported failure' where id = v_refund.id;
    insert into public.event_notifications (event_id, user_id, type, message)
    select null, p.id, 'PAYMENT_ALERT',
           'Refund ' || v_refund.id::text || ' failed at the gateway.'
      from public.profiles p where p.is_admin = true;
    return 'FAILED';
  end if;
  return 'IGNORED:' || p_status;
end;
$$;

revoke execute on function public.finalize_refund(text, text) from public, anon, authenticated;
grant  execute on function public.finalize_refund(text, text) to service_role;

-- 9. admin_manual_settle_refund — legacy manual-UPI orders (no razorpay
--    payment id): mark settled with a bank reference; audited.
create or replace function public.admin_manual_settle_refund(
  p_refund_id uuid,
  p_reference text
)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund public.refunds;
begin
  if not public.is_current_user_admin() then raise exception 'Admins only'; end if;
  if p_reference is null or length(trim(p_reference)) < 4 then
    raise exception 'Bank reference required';
  end if;
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then raise exception 'Refund not found'; end if;
  if v_refund.status not in ('PENDING','FAILED','INITIATING','INITIATED','REQUESTED') then
    raise exception 'Refund is %, cannot settle', v_refund.status;
  end if;

  update public.refunds
     set status = 'MANUAL_SETTLED',
         completed_at = now(),
         approved_by = auth.uid(),
         rejected_reason = null,
         reason = v_refund.reason || ' — settled manually (ref: ' || trim(p_reference) || ')'
   where id = v_refund.id
   returning * into v_refund;

  if v_refund.order_id is not null then
    update public.orders set status = 'REFUNDED'
     where id = v_refund.order_id and status in ('CONFIRMED','REFUND_REQUESTED');
  end if;

  insert into public.payment_ledger (
    order_id, event_id, organizer_id, type, gross_amount_paise,
    net_platform_paise, razorpay_payment_id, notes
  ) values (
    v_refund.order_id, v_refund.event_id, null, 'ADJUSTMENT',
    -v_refund.amount_paise, -v_refund.amount_paise,
    'manual_settle_' || v_refund.id::text,
    'Manual refund settlement ref: ' || trim(p_reference)
  ) on conflict (razorpay_payment_id) where razorpay_payment_id is not null do nothing;

  insert into public.event_notifications (event_id, user_id, type, message)
  values (v_refund.event_id, v_refund.user_id, 'REFUND_COMPLETED',
          'Your refund of ₹' || (v_refund.amount_paise / 100.0)::numeric(10,2)
          || ' was settled manually by the team.');
  return v_refund;
end;
$$;

revoke execute on function public.admin_manual_settle_refund(uuid, text) from public, anon;
grant  execute on function public.admin_manual_settle_refund(uuid, text) to authenticated, service_role;

-- 10. cancel_event v2 — orders become REFUND_REQUESTED (not REFUNDED), refund
--     rows insert PENDING for the worker, amount = subtotal (or total when the
--     refund_fees_on_cancellation setting is on). Tickets cancel immediately;
--     the organizer liability lands as an ADJUSTMENT ledger row inside this
--     same transaction (replaces the Node sweep).
create or replace function public.cancel_event(
  p_event_id uuid,
  p_reason text,
  p_cancellation_charge_percent integer default 20
)
returns table(refund_count integer, total_refund_paise bigint, total_platform_fee_paise bigint, cancellation_charge_paise bigint, organizer_owes_paise bigint)
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
  v_refund_fees boolean;
  v_amount integer;
  v_owes bigint;
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

  v_refund_fees := coalesce((
    select (value #>> '{}')::boolean
      from public.platform_settings where key = 'refund_fees_on_cancellation'), false);

  update public.events set status = 'CANCELLATION_REQUESTED'
   where id = p_event_id and organizer_id = v_organizer_id;

  -- Release held reservations.
  for v_order in
    select id, tier_id, quantity
      from public.orders
     where event_id = p_event_id and status = 'RESERVED'
  loop
    update public.orders set status = 'CANCELLED' where id = v_order.id;
    update public.ticket_tiers
       set quantity_reserved = greatest(quantity_reserved - v_order.quantity, 0)
     where id = v_order.tier_id;
    update public.payment_intents
       set status = 'EXPIRED', updated_at = now()
     where ref_id = v_order.id and kind = 'TICKET_ORDER' and status = 'CREATED';
  end loop;

  update public.orders
     set status = 'REJECTED', rejection_reason = 'Event cancelled', reviewed_at = now()
   where event_id = p_event_id and status = 'PENDING_VERIFICATION';

  for v_order in
    select id, user_id, tier_id, quantity, total_paise, platform_fee_paise,
           subtotal_paise, convenience_fee_paise, gateway_fee_paise,
           razorpay_payment_id
      from public.orders
     where event_id = p_event_id and status in ('CONFIRMED','REFUND_REQUESTED')
  loop
    update public.orders set status = 'REFUND_REQUESTED' where id = v_order.id;
    update public.tickets set status = 'CANCELLED' where order_id = v_order.id;
    update public.ticket_tiers
       set quantity_sold = greatest(quantity_sold - v_order.quantity, 0)
     where id = v_order.tier_id;
    update public.events
       set registrations_count = greatest(registrations_count - v_order.quantity, 0)
     where id = p_event_id;

    -- Skip if an active refund already exists for this order.
    if not exists (select 1 from public.refunds
                    where order_id = v_order.id
                      and status not in ('REJECTED','FAILED','COMPLETED')) then
      v_amount := case when v_refund_fees then v_order.total_paise else v_order.subtotal_paise end;
      insert into public.refunds (
        order_id, event_id, user_id, amount_paise, platform_fee_paise,
        status, reason, refund_scope, razorpay_payment_id, initiated_at
      ) values (
        v_order.id, p_event_id, v_order.user_id, v_amount,
        v_order.platform_fee_paise, 'PENDING',
        p_reason || case when not v_refund_fees then ' (ticket price only — fees are non-refundable)' else '' end,
        case when v_refund_fees then 'FULL' else 'TICKET_PRICE' end,
        v_order.razorpay_payment_id, now()
      );
      v_total_refund := v_total_refund + v_amount;
      v_refund_count := v_refund_count + 1;
    end if;

    insert into public.event_notifications (event_id, user_id, type, message)
    values (p_event_id, v_order.user_id, 'CANCELLATION',
            p_reason || case when v_refund_fees
                        then ' You will receive a full refund.'
                        else ' Your ticket price will be refunded (fees are non-refundable).' end);
    v_total_fee := v_total_fee + v_order.platform_fee_paise;
  end loop;

  -- Notify subscribers too.
  insert into public.event_notifications (event_id, user_id, type, message)
  select p_event_id, s.user_id, 'CANCELLATION', p_reason
    from public.event_subscriptions s
   where s.event_id = p_event_id
     and s.user_id not in (
       select o.user_id from public.orders o
        where o.event_id = p_event_id and o.status in ('REFUND_REQUESTED','REFUNDED'));

  -- Organizer liability: charge on the refunded subtotal, recorded as an
  -- ADJUSTMENT against their payout in this same transaction.
  v_cancel_charge := round(v_total_refund * coalesce(p_cancellation_charge_percent, 20) / 100.0);
  v_owes := v_total_refund + v_cancel_charge;
  if v_refund_count > 0 then
    insert into public.payment_ledger (
      order_id, event_id, organizer_id, type, gross_amount_paise,
      net_organizer_paise, razorpay_payment_id, notes
    ) values (
      null, p_event_id, v_organizer_id, 'ADJUSTMENT',
      -v_owes, -v_owes,
      'cancel_adjust_' || p_event_id::text,
      'Cancellation liability: refunds ' || v_total_refund::text
        || ' paise + charge ' || v_cancel_charge::text || ' paise'
    ) on conflict (razorpay_payment_id) where razorpay_payment_id is not null do nothing;
  end if;

  return query select v_refund_count, v_total_refund, v_total_fee, v_cancel_charge, v_owes;
end;
$$;

revoke execute on function public.cancel_event(uuid, text, integer) from public, anon;
grant  execute on function public.cancel_event(uuid, text, integer) to authenticated;

-- 11. request_postponement_refund v2 — ticket price only, PENDING for the
--     worker; no Node-side Razorpay call. (Return type changed → drop first.)
drop function if exists public.request_postponement_refund(uuid, uuid);
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
  if not exists (select 1 from public.events where id = p_event_id and status = 'POSTPONED') then
    raise exception 'Event is not postponed';
  end if;

  select o.id, o.subtotal_paise, o.platform_fee_paise, o.tier_id, o.quantity,
         o.status, o.razorpay_payment_id as rzp_payment_id
    into v_order
    from public.orders o
   where o.event_id = p_event_id
     and o.user_id = p_user_id
     and o.status in ('CONFIRMED', 'REFUND_REQUESTED')
   order by (o.status = 'CONFIRMED') desc
   limit 1
   for update of o;

  if not found then raise exception 'No confirmed order found for this event'; end if;

  select r.id, r.amount_paise, r.razorpay_payment_id as rzp_id into v_existing
    from public.refunds r
   where r.order_id = v_order.id
     and r.status not in ('REJECTED','FAILED','COMPLETED')
   limit 1;
  if v_existing.id is not null then
    return query select v_order.id, v_existing.id, v_existing.amount_paise, v_existing.rzp_id, false;
    return;
  end if;

  update public.orders set status = 'REFUND_REQUESTED' where id = v_order.id;
  update public.tickets set status = 'CANCELLED' where order_id = v_order.id;
  update public.ticket_tiers
     set quantity_sold = greatest(quantity_sold - v_order.quantity, 0)
   where id = v_order.tier_id;
  update public.events
     set registrations_count = greatest(registrations_count - v_order.quantity, 0)
   where id = p_event_id;

  insert into public.refunds (
    order_id, event_id, user_id, amount_paise, platform_fee_paise,
    status, reason, refund_scope, razorpay_payment_id, initiated_at
  ) values (
    v_order.id, p_event_id, p_user_id, v_order.subtotal_paise,
    v_order.platform_fee_paise, 'PENDING',
    'Refund requested after event postponement (ticket price only)',
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

-- 12. refunds participates in realtime for dashboards
do $$
begin
  alter publication supabase_realtime add table public.refunds;
exception when duplicate_object then null;
end $$;