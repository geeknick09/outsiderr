-- ============================================================================
-- STEP 34 · Capture dispatcher + webhook event claims + atomic ledger
-- ============================================================================
-- One dispatcher resolves razorpay_order_id → intent → kind and applies the
-- paid/failed/expired transition per payable thing, inside one transaction
-- with the ledger row. Webhook claim semantics prevent double-processing.

-- notification types needed by the payment/refund pipeline
do $$ begin alter type public.event_notification_type add value if not exists 'PAYMENT_ALERT'; exception when others then null; end $$;
do $$ begin alter type public.event_notification_type add value if not exists 'REFUND_REQUESTED'; exception when others then null; end $$;
do $$ begin alter type public.event_notification_type add value if not exists 'REFUND_APPROVED'; exception when others then null; end $$;
do $$ begin alter type public.event_notification_type add value if not exists 'REFUND_REJECTED'; exception when others then null; end $$;
do $$ begin alter type public.event_notification_type add value if not exists 'PAYOUT_RECORDED'; exception when others then null; end $$;

-- 1. webhook_events claim column + drop the duplicate non-unique index
alter table public.webhook_events add column if not exists processing_started_at timestamptz;
drop index if exists public.webhook_events_razorpay_event_idx;

-- payment_ledger: new kinds
alter table public.payment_ledger drop constraint if exists payment_ledger_type_check;
alter table public.payment_ledger add constraint payment_ledger_type_check
  check (type = any (array['TICKET_SALE','BOOST_SALE','DOOR_STAFF_SALE','CLUB_FEE','REFUND','PAYOUT','ADJUSTMENT']));

-- 2. record_webhook_event — insert-or-claim with replay protection.
create or replace function public.record_webhook_event(
  p_event_id text,
  p_type     text,
  p_payload  jsonb,
  p_order_id uuid default null
)
returns table(is_new boolean, already_processed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.webhook_events;
begin
  -- Try claim-by-insert (unique razorpay_event_id decides).
  insert into public.webhook_events (
    razorpay_event_id, event_type, payload, order_id, processing_started_at
  ) values (
    p_event_id, p_type, p_payload, p_order_id, now()
  )
  on conflict (razorpay_event_id) do nothing;

  if found then
    return query select true, false;
    return;
  end if;

  select * into v_existing from public.webhook_events
   where razorpay_event_id = p_event_id for update;

  if v_existing.processed then
    return query select false, true;
    return;
  end if;

  -- Currently claimed by another delivery → let it finish (skip; Razorpay retries).
  if v_existing.processing_started_at is not null
     and v_existing.processing_started_at > now() - interval '5 minutes' then
    return query select false, false;
    return;
  end if;

  -- Stale claim (processing died) → reclaim.
  update public.webhook_events
     set processing_started_at = now(),
         event_type = p_type,
         payload = p_payload,
         order_id = coalesce(p_order_id, order_id)
   where razorpay_event_id = p_event_id;

  return query select true, false;
end;
$$;

revoke execute on function public.record_webhook_event(text, text, jsonb, uuid) from public, anon, authenticated;
grant  execute on function public.record_webhook_event(text, text, jsonb, uuid) to service_role;

create or replace function public.finish_webhook_event(
  p_event_id text,
  p_ok       boolean,
  p_error    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.webhook_events
     set processed = p_ok,
         error_message = p_error,
         processed_at = case when p_ok then now() else null end,
         processing_started_at = null
   where razorpay_event_id = p_event_id;
end;
$$;

revoke execute on function public.finish_webhook_event(text, boolean, text) from public, anon, authenticated;
grant  execute on function public.finish_webhook_event(text, boolean, text) to service_role;

-- 3. apply_captured_payment — the dispatcher. Returns an outcome code.
create or replace function public.apply_captured_payment(
  p_razorpay_order_id  text,
  p_razorpay_payment_id text,
  p_amount             integer,
  p_currency           text,
  p_method             text default null,
  p_fee                integer default null,
  p_tax                integer default null,
  p_signature          text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent   public.payment_intents;
  v_order    public.orders;
  v_boost    public.hero_boosts;
  v_event_id uuid;
  v_org_id   uuid;
  v_duration integer;
  v_dummy    record;
  v_days     integer;
begin
  -- Lock the intent by the gateway order id.
  select * into v_intent from public.payment_intents
   where razorpay_order_id = p_razorpay_order_id
   for update;

  if not found then
    -- Compat path: orders/boosts written before payment_intents existed.
    select * into v_order from public.orders
     where razorpay_order_id = p_razorpay_order_id for update;
    if found then
      if v_order.total_paise <> p_amount or upper(coalesce(p_currency,'INR')) <> 'INR' then
        return 'MISMATCH';
      end if;
      for v_dummy in select * from public.confirm_razorpay_order(
        v_order.id, p_razorpay_payment_id, p_signature, p_method) loop end loop;
      return 'CONFIRMED_COMPAT';
    end if;
    select * into v_boost from public.hero_boosts
     where razorpay_order_id = p_razorpay_order_id for update;
    if found then
      if v_boost.status = 'ACTIVE' then return 'ALREADY_PAID'; end if;
      if v_boost.status <> 'PENDING' then return 'REF_INACTIVE'; end if;
      v_days := public._setting_int('hero_boost_duration_days', 3);
      update public.hero_boosts
         set status = 'ACTIVE', razorpay_payment_id = p_razorpay_payment_id,
             started_at = now(), expires_at = now() + make_interval(days => v_days)
       where id = v_boost.id;
      insert into public.payment_ledger (
        order_id, event_id, organizer_id, type, gross_amount_paise,
        commission_paise, net_platform_paise, razorpay_payment_id,
        razorpay_fee_paise, notes
      ) values (
        null, v_boost.event_id, v_boost.organizer_id, 'BOOST_SALE',
        v_boost.amount_paise, v_boost.amount_paise, v_boost.amount_paise,
        p_razorpay_payment_id, coalesce(p_fee, 0), 'Hero boost (compat path)'
      ) on conflict (razorpay_payment_id) where razorpay_payment_id is not null do nothing;
      return 'APPLIED:HERO_BOOST_COMPAT';
    end if;
    return 'NOT_FOUND';
  end if;

  -- Idempotent: a second delivery of the same payment is a no-op.
  if v_intent.status = 'PAID' then
    return 'ALREADY_PAID';
  end if;

  -- Amount/currency mismatch → never confirm, alert admins.
  if v_intent.amount_paise <> p_amount or upper(coalesce(p_currency,'INR')) <> 'INR' then
    update public.payment_intents
       set status = 'MISMATCH', updated_at = now()
     where id = v_intent.id;
    insert into public.event_notifications (event_id, user_id, type, message)
    select null, p.id, 'PAYMENT_ALERT',
           'Payment amount mismatch on intent ' || v_intent.id::text
           || ' (expected ' || v_intent.amount_paise || ' paise, got ' || coalesce(p_amount::text,'null') || ')'
      from public.profiles p where p.is_admin = true;
    return 'MISMATCH';
  end if;

  -- Dispatch per kind.
  if v_intent.kind = 'TICKET_ORDER' then
    for v_dummy in select * from public.confirm_razorpay_order(
      v_intent.ref_id, p_razorpay_payment_id, p_signature, p_method) loop end loop;

    select * into v_order from public.orders where id = v_intent.ref_id;
    select organizer_id into v_org_id from public.events where id = v_order.event_id;

    insert into public.payment_ledger (
      order_id, event_id, organizer_id, type, gross_amount_paise,
      commission_paise, convenience_fee_paise, razorpay_fee_paise,
      net_organizer_paise, net_platform_paise, razorpay_payment_id, notes
    ) values (
      v_order.id, v_order.event_id, v_org_id, 'TICKET_SALE',
      v_order.subtotal_paise, v_order.commission_paise,
      v_order.convenience_fee_paise + v_order.gateway_fee_paise,
      coalesce(p_fee, 0), v_order.organizer_payout_paise,
      v_order.platform_fee_paise + v_order.gateway_fee_paise - coalesce(p_fee, 0),
      p_razorpay_payment_id, 'Ticket sale'
    ) on conflict (razorpay_payment_id) where razorpay_payment_id is not null do nothing;

  elsif v_intent.kind = 'HERO_BOOST' then
    v_days := public._setting_int('hero_boost_duration_days', 3);
    -- expires_at = min(now + duration, event start) — matches activateHeroBoost
    update public.hero_boosts b
       set status = 'ACTIVE', razorpay_payment_id = p_razorpay_payment_id,
           started_at = now(),
           expires_at = least(
             now() + make_interval(days => v_days),
             (select e.starts_at from public.events e where e.id = b.event_id)
           ),
           updated_at = now()
     where b.id = v_intent.ref_id and b.status = 'PENDING'
     returning event_id, organizer_id into v_event_id, v_org_id;
    insert into public.payment_ledger (
      order_id, event_id, organizer_id, type, gross_amount_paise,
      commission_paise, net_platform_paise, razorpay_payment_id, razorpay_fee_paise, notes
    ) values (
      null, v_event_id, v_org_id, 'BOOST_SALE', v_intent.amount_paise,
      v_intent.amount_paise, v_intent.amount_paise - coalesce(p_fee,0),
      p_razorpay_payment_id, coalesce(p_fee, 0), 'Hero boost'
    ) on conflict (razorpay_payment_id) where razorpay_payment_id is not null do nothing;

  elsif v_intent.kind = 'SLOT_BOOST' then
    -- Only activate when the slot is still free at capture time — a paid
    -- boost must never double-book a slot taken since the intent opened.
    update public.boosts b
       set status = 'ACTIVE', amount_paid_paise = v_intent.amount_paise,
           reviewed_at = now()
     where b.id = v_intent.ref_id and b.status = 'PENDING'
       and not exists (
         select 1 from public.boosts b2
          where b2.slot = b.slot and b2.id <> b.id
            and b2.status = 'ACTIVE' and b2.ends_at > now())
     returning event_id, organizer_id into v_event_id, v_org_id;

    if v_event_id is null then
      -- Slot was taken between checkout and capture → auto-refund + alert.
      update public.boosts set status = 'REJECTED' where id = v_intent.ref_id;
      insert into public.refunds (
        order_id, event_id, user_id, amount_paise, platform_fee_paise,
        status, reason, initiated_at
      ) select null, b.event_id, v_intent.user_id, v_intent.amount_paise, 0,
          'PENDING', 'Slot taken before payment settled — auto-refund', now()
        from public.boosts b where b.id = v_intent.ref_id;
      insert into public.event_notifications (event_id, user_id, type, message)
      select null, p.id, 'PAYMENT_ALERT',
             'Boost slot collision on intent ' || v_intent.id::text
             || ' — payment captured but slot occupied; auto-refunded'
        from public.profiles p where p.is_admin = true;
      update public.payment_intents set status = 'PAID', updated_at = now() where id = v_intent.id;
      return 'APPLIED:SLOT_BOOST_REFUNDED';
    end if;

    insert into public.payment_ledger (
      order_id, event_id, organizer_id, type, gross_amount_paise,
      commission_paise, net_platform_paise, razorpay_payment_id, razorpay_fee_paise, notes
    ) values (
      null, v_event_id, v_org_id, 'BOOST_SALE', v_intent.amount_paise,
      v_intent.amount_paise, v_intent.amount_paise - coalesce(p_fee,0),
      p_razorpay_payment_id, coalesce(p_fee, 0), 'Slot boost'
    ) on conflict (razorpay_payment_id) where razorpay_payment_id is not null do nothing;

  elsif v_intent.kind = 'DOOR_STAFF' then
    update public.door_staff_orders
       set payment_status = 'PAID', updated_at = now()
     where id = v_intent.ref_id
     returning event_id, organizer_id into v_event_id, v_org_id;
    insert into public.payment_ledger (
      order_id, event_id, organizer_id, type, gross_amount_paise,
      commission_paise, net_platform_paise, razorpay_payment_id, razorpay_fee_paise, notes
    ) values (
      null, v_event_id, v_org_id, 'DOOR_STAFF_SALE', v_intent.amount_paise,
      v_intent.amount_paise, v_intent.amount_paise - coalesce(p_fee,0),
      p_razorpay_payment_id, coalesce(p_fee, 0), 'Door staff service'
    ) on conflict (razorpay_payment_id) where razorpay_payment_id is not null do nothing;

  elsif v_intent.kind = 'CLUB_MEMBERSHIP' then
    update public.club_members
       set status = 'ACCEPTED'
     where id = v_intent.ref_id and status = 'PENDING';
    if found then
      update public.clubs set member_count = member_count + 1
       where id = (select club_id from public.club_members where id = v_intent.ref_id);
    end if;
    insert into public.payment_ledger (
      order_id, event_id, organizer_id, type, gross_amount_paise,
      commission_paise, net_platform_paise, razorpay_payment_id, razorpay_fee_paise, notes
    ) values (
      null, null, null, 'CLUB_FEE', v_intent.amount_paise,
      v_intent.amount_paise, v_intent.amount_paise - coalesce(p_fee,0),
      p_razorpay_payment_id, coalesce(p_fee, 0), 'Club membership'
    ) on conflict (razorpay_payment_id) where razorpay_payment_id is not null do nothing;
  end if;

  update public.payment_intents
     set status = 'PAID',
         razorpay_payment_id = p_razorpay_payment_id,
         payment_method = p_method,
         razorpay_fee_paise = coalesce(p_fee, 0),
         razorpay_tax_paise = coalesce(p_tax, 0),
         paid_at = now(),
         updated_at = now()
   where id = v_intent.id;

  return 'APPLIED:' || v_intent.kind;
end;
$$;

revoke execute on function public.apply_captured_payment(text, text, integer, text, text, integer, integer, text) from public, anon, authenticated;
grant  execute on function public.apply_captured_payment(text, text, integer, text, text, integer, integer, text) to service_role;

-- 4. apply_failed_payment
create or replace function public.apply_failed_payment(
  p_razorpay_order_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.payment_intents;
begin
  select * into v_intent from public.payment_intents
   where razorpay_order_id = p_razorpay_order_id for update;
  if not found then return 'NOT_FOUND'; end if;
  if v_intent.status = 'PAID' then return 'ALREADY_PAID'; end if;

  if v_intent.kind = 'TICKET_ORDER' then
    perform public.fail_razorpay_order(v_intent.ref_id);
  end if;

  update public.payment_intents
     set status = 'FAILED', updated_at = now()
   where id = v_intent.id and status <> 'PAID';

  return 'FAILED:' || v_intent.kind;
end;
$$;

revoke execute on function public.apply_failed_payment(text) from public, anon, authenticated;
grant  execute on function public.apply_failed_payment(text) to service_role;

-- 5. expire_payment_intents — superset of expire_reserved_orders: expires
--    CREATED intents past TTL; TICKET_ORDER refs get the order expiry +
--    inventory release inline.
create or replace function public.expire_payment_intents()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent record;
  v_count integer := 0;
begin
  for v_intent in
    select * from public.payment_intents
     where status = 'CREATED' and expires_at < now()
     for update skip locked
  loop
    if v_intent.kind = 'TICKET_ORDER' then
      update public.orders set status = 'EXPIRED'
       where id = v_intent.ref_id and status = 'RESERVED';
      if found then
        update public.ticket_tiers
           set quantity_reserved = greatest(
                 quantity_reserved - (select quantity from public.orders where id = v_intent.ref_id), 0)
         where id = (select tier_id from public.orders where id = v_intent.ref_id);
      end if;
    end if;
    update public.payment_intents
       set status = 'EXPIRED', updated_at = now()
     where id = v_intent.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.expire_payment_intents() from public, anon, authenticated;
grant  execute on function public.expire_payment_intents() to service_role;
-- payment_disputes — Razorpay dispute events land here for admin review.
create table if not exists public.payment_disputes (
  id           uuid primary key default gen_random_uuid(),
  razorpay_dispute_id text unique,
  razorpay_payment_id text,
  razorpay_order_id   text,
  amount_paise integer,
  status       text,
  raw          jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.payment_disputes enable row level security;
drop policy if exists "admin reads disputes" on public.payment_disputes;
create policy "admin reads disputes" on public.payment_disputes
  for select to authenticated using (public.is_current_user_admin());
revoke insert, update, delete on public.payment_disputes from anon, authenticated;
grant insert, update, delete on public.payment_disputes to service_role;
