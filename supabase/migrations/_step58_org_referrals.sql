-- STEP 58: Promoter organizer-referral program.
-- Promoters share an expiring referral link; organizers who sign up through it
-- attribute the promoter. The promoter earns a configurable % (default 10%) of
-- the platform commission on every paid order for the organizer's first N
-- published paid events (default 5). Paid by Outsiderr - never deducted from
-- the organizer payout.

-- ── Columns ─────────────────────────────────────────────────────────────────
alter table public.promoter_links
  alter column event_id drop not null;
alter table public.promoter_links
  add column if not exists link_kind  text not null default 'EVENT'
    check (link_kind in ('EVENT','ORGANIZER')),
  add column if not exists expires_at timestamptz;

alter table public.organizers
  add column if not exists referred_by_promoter_id uuid references public.promoters(id) on delete set null,
  add column if not exists referred_at timestamptz,
  add column if not exists referral_events_count integer not null default 0;

alter table public.events
  add column if not exists referral_promoter_id uuid references public.promoters(id) on delete set null;

create unique index if not exists promoter_links_one_org_per_promoter
  on public.promoter_links (promoter_id) where link_kind = 'ORGANIZER';

-- ── Earnings: ORG_REFERRAL via + per-via uniqueness (event-promo and org
-- referral may both earn on one order) ──────────────────────────────────────
alter table public.promoter_earnings drop constraint if exists promoter_earnings_via_check;
alter table public.promoter_earnings
  add constraint promoter_earnings_via_check check (via in ('LINK','PROMO_CODE','ORG_REFERRAL'));

alter table public.promoter_earnings drop constraint if exists promoter_earnings_order_id_key;
drop index if exists promoter_earnings_order_id_key;
create unique index if not exists promoter_earnings_order_event_via
  on public.promoter_earnings (order_id) where via in ('LINK','PROMO_CODE') and order_id is not null;
create unique index if not exists promoter_earnings_order_org_via
  on public.promoter_earnings (order_id) where via = 'ORG_REFERRAL' and order_id is not null;

-- ── Settings ────────────────────────────────────────────────────────────────
insert into public.platform_settings (key, value) values
  ('promoter_org_share_bps',        '1000'),
  ('promoter_org_event_limit',      '5'),
  ('promoter_org_link_ttl_days',    '30'),
  ('promoter_org_attribution_days', '30')
on conflict (key) do nothing;

-- ── get_or_create_org_referral_link: live link for the caller, minting a fresh
-- slug when none exists or the old one expired/is deactivated. ───────────────
create or replace function public.get_or_create_org_referral_link()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promoter public.promoters;
  v_link     public.promoter_links;
  v_ttl      integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into v_promoter from public.promoters where user_id = auth.uid();
  if not found then raise exception 'Not a promoter'; end if;
  if v_promoter.is_blocked then raise exception 'Promoter is blocked'; end if;

  v_ttl := greatest(1, coalesce(
    (select value::integer from public.platform_settings where key = 'promoter_org_link_ttl_days'), 30));

  select * into v_link from public.promoter_links
   where promoter_id = v_promoter.id and link_kind = 'ORGANIZER' and is_active
     and (expires_at is null or expires_at > now());
  if not found then
    update public.promoter_links set is_active = false
     where promoter_id = v_promoter.id and link_kind = 'ORGANIZER';
    insert into public.promoter_links (promoter_id, event_id, slug, link_kind, expires_at)
    values (v_promoter.id, null,
            'r' || replace(gen_random_uuid()::text, '-', ''),
            'ORGANIZER', now() + (v_ttl || ' days')::interval)
    returning * into v_link;
  end if;

  return jsonb_build_object('slug', v_link.slug, 'expires_at', v_link.expires_at);
end;
$$;
grant execute on function public.get_or_create_org_referral_link() to authenticated;

-- ── org_referral_slug_lookup: validate an org link for the /r/[slug] route. ──
create or replace function public.org_referral_slug_lookup(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_link public.promoter_links;
begin
  select * into v_link from public.promoter_links l
   where l.slug = lower(p_slug) and l.link_kind = 'ORGANIZER' and l.is_active
     and (l.expires_at is null or l.expires_at > now());
  if not found then return null; end if;
  return jsonb_build_object('link_id', v_link.id, 'promoter_id', v_link.promoter_id);
end;
$$;
grant execute on function public.org_referral_slug_lookup(text) to anon, authenticated, service_role;

-- ── attribute_organizer_referral: called during organizer creation. Resolves
-- the referral slug to a promoter and stamps the organizer (first-write wins,
-- self-referral blocked). Returns the promoter id applied, if any. ───────────
create or replace function public.attribute_organizer_referral(
  p_organizer_id uuid, p_slug text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link     public.promoter_links;
  v_org      public.organizers;
  v_promoter uuid;
begin
  select * into v_org from public.organizers where id = p_organizer_id;
  if not found then return null; end if;
  if v_org.referred_by_promoter_id is not null then
    return v_org.referred_by_promoter_id; end if;

  select * into v_link from public.promoter_links l
   where l.slug = lower(p_slug) and l.link_kind = 'ORGANIZER' and l.is_active
     and (l.expires_at is null or l.expires_at > now());
  if not found then return null; end if;
  v_promoter := v_link.promoter_id;

  if exists (select 1 from public.promoters p
              where p.id = v_promoter and p.user_id = v_org.user_id) then
    return null;
  end if;

  update public.organizers
     set referred_by_promoter_id = v_promoter, referred_at = now()
   where id = p_organizer_id;
  return v_promoter;
end;
$$;
grant execute on function public.attribute_organizer_referral(uuid, text) to authenticated, service_role;

-- ── trg_mark_org_referral: on first PUBLISHED transition, stamp the event with
-- the referral promoter while the organizer is inside the paid-event window.
-- Free events never consume the window. ─────────────────────────────────────
create or replace function public.trg_mark_org_referral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promoter uuid;
  v_limit    integer;
begin
  if new.status <> 'PUBLISHED'::public.event_status
     or new.status is not distinct from old.status
     or new.referral_promoter_id is not null then
    return new;
  end if;
  if not exists (select 1 from public.ticket_tiers t
                  where t.event_id = new.id and t.price_paise > 0) then
    return new;
  end if;

  v_limit := greatest(0, coalesce(
    (select value::integer from public.platform_settings where key = 'promoter_org_event_limit'), 5));

  update public.organizers
     set referral_events_count = referral_events_count + 1
   where id = new.organizer_id
     and referred_by_promoter_id is not null
     and referral_events_count < v_limit
  returning referred_by_promoter_id into v_promoter;

  if v_promoter is not null then
    new.referral_promoter_id := v_promoter;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_events_mark_org_referral on public.events;
create trigger trg_events_mark_org_referral
  before update of status on public.events
  for each row
  when (new.status = 'PUBLISHED'::public.event_status)
  execute function public.trg_mark_org_referral();

-- ── trg_org_referral_earning: confirmed paid order on a referral-stamped
-- event mints an ORG_REFERRAL earning = share_bps of platform commission.
-- Outsiderr's cost - orders.promoter_id stays NULL, organizer payout untouched.
create or replace function public.trg_org_referral_earning()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
  v_share    integer;
begin
  if new.status <> 'CONFIRMED' or new.status is not distinct from old.status then
    return new;
  end if;
  if coalesce(new.commission_paise, 0) <= 0 then return new; end if;

  select e.referral_promoter_id into v_referrer
    from public.events e where e.id = new.event_id;
  if v_referrer is null then return new; end if;

  v_share := greatest(0, coalesce(
    (select value::integer from public.platform_settings where key = 'promoter_org_share_bps'), 1000));

  insert into public.promoter_earnings (
    order_id, promoter_id, event_id, organizer_id, via,
    ticket_subtotal_paise, commission_bps, amount_paise
  ) values (
    new.id, v_referrer, new.event_id,
    (select organizer_id from public.events where id = new.event_id),
    'ORG_REFERRAL', new.subtotal_paise, v_share,
    round(new.commission_paise * v_share / 10000.0)
  ) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_org_referral_earning on public.orders;
create trigger trg_org_referral_earning
  after update on public.orders
  for each row execute function public.trg_org_referral_earning();

-- ── Refund reversal: loop over ALL EARNING rows on the order (event-promo AND
-- org-referral may both exist), reversing each proportionally. ───────────────
create or replace function public.trg_refund_reverse_promoter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_earn     public.promoter_earnings;
  v_order    public.orders;
  v_claw     integer;
  v_remaining integer;
begin
  select * into v_order from public.orders where id = new.order_id;
  if not found then return new; end if;

  for v_earn in
    select * from public.promoter_earnings
     where order_id = new.order_id and kind = 'EARNING' and status <> 'REVERSED'
  loop
    v_claw := least(
      round(coalesce(new.amount_paise, 0)::numeric / nullif(greatest(v_order.total_paise, 1), 0) * v_earn.amount_paise),
      v_earn.amount_paise - v_earn.reversed_paise
    );
    if v_claw <= 0 then continue; end if;

    if v_earn.status = 'PAID' then
      insert into public.promoter_earnings (
        order_id, promoter_id, event_id, organizer_id, via,
        link_id, promo_code_id, ticket_subtotal_paise, commission_bps,
        amount_paise, kind, status, refund_id, reverses_id
      ) values (
        null, v_earn.promoter_id, v_earn.event_id, v_earn.organizer_id, v_earn.via,
        v_earn.link_id, v_earn.promo_code_id, 0, v_earn.commission_bps,
        -v_claw, 'CLAWBACK', 'EARNED', new.id, v_earn.id
      );
    else
      v_remaining := v_earn.amount_paise - (v_earn.reversed_paise + v_claw);
      update public.promoter_earnings
         set reversed_paise = reversed_paise + v_claw,
             status = case when v_remaining <= 0 then 'REVERSED' else status end,
             refund_id = new.id
       where id = v_earn.id;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_refund_reverse_promoter on public.refunds;
create trigger trg_refund_reverse_promoter
  after insert on public.refunds
  for each row execute function public.trg_refund_reverse_promoter();
