-- ================================================================
-- OUTSIDERR — SINGLE FIX-ALL MIGRATION
-- Run this ONCE in the Supabase SQL Editor.
-- Safe to re-run (all statements are idempotent).
--
-- Fixes:
--   1. Infinite recursion on profiles RLS
--   2. Admin can't verify/activate Hero Boosts
--   3. Admin can't see user names
--   4. Organizer can't approve orders (P0001 + missing RLS)
--   5. Admin settings not saving
--   6. Admin can't manage legal pages / door staff
-- ================================================================

-- ----------------------------------------------------------------
-- STEP 1: Helper functions (security definer = no RLS recursion)
-- ----------------------------------------------------------------

-- Check if current user is admin (strict — no fallback)
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  );
$$;

-- Check if current user is staff for an event (organizer or admin)
create or replace function public.is_event_staff(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    join public.organizers o on o.id = e.organizer_id
    where e.id = p_event_id and o.owner_id = auth.uid()
  ) or public.is_current_user_admin();
$$;

-- ----------------------------------------------------------------
-- STEP 2: Ensure all tables exist (in case of partial setup)
-- ----------------------------------------------------------------

create table if not exists public.hero_boosts (
  id              uuid        primary key default gen_random_uuid(),
  event_id        uuid        not null references public.events(id) on delete cascade,
  organizer_id    uuid        not null references public.organizers(id) on delete cascade,
  status          text        not null default 'PENDING'
                  check (status in ('PENDING','ACTIVE','EXPIRED','CANCELLED','REFUNDED','FAILED')),
  amount_paise    integer     not null check (amount_paise > 0),
  currency        text        not null default 'INR',
  utr_reference   text,
  started_at      timestamptz,
  expires_at      timestamptz,
  cancelled_at    timestamptz,
  expired_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists hero_boosts_event_idx     on public.hero_boosts(event_id);
create index if not exists hero_boosts_organizer_idx on public.hero_boosts(organizer_id);
create index if not exists hero_boosts_status_idx    on public.hero_boosts(status);
create index if not exists hero_boosts_expires_idx   on public.hero_boosts(expires_at);
create index if not exists hero_boosts_started_idx   on public.hero_boosts(started_at);
create unique index if not exists hero_boosts_one_active_per_event
  on public.hero_boosts(event_id)
  where status = 'ACTIVE';

-- Ensure contact columns exist on events
alter table public.events add column if not exists contact_email text;
alter table public.events add column if not exists contact_phone text;

-- Ensure user profile columns exist on profiles
alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists interested_tags text[] not null default '{}';
alter table public.profiles add column if not exists instagram_url text;

-- Ensure cover photo column exists on organizers
alter table public.organizers add column if not exists cover_url text;
alter table public.organizers add column if not exists instagram_url text;

-- Ensure Instagram URL column exists on events
alter table public.events add column if not exists instagram_url text;

-- Ensure phase columns exist on ticket_tiers (for time-based flat pricing)
alter table public.ticket_tiers add column if not exists tier_type text not null default 'NAMED';
alter table public.ticket_tiers add column if not exists phase_order int;
alter table public.ticket_tiers add column if not exists phase_opens_at timestamptz;
alter table public.ticket_tiers add column if not exists phase_closes_at timestamptz;

-- Ensure hero boost settings exist
insert into public.platform_settings (key, value, description) values
  ('hero_boost_enabled',              'true',  'Enable/disable the Hero Boost feature'),
  ('hero_boost_price',                '99900', 'Price for a 7-day Hero Boost in paise'),
  ('hero_boost_duration_days',        '7',     'Hero Boost duration in days'),
  ('hero_rotation_interval_minutes',  '30',    'Hero carousel rotation interval in minutes'),
  ('hero_max_visible_events',         '7',     'Maximum Hero events displayed at once')
on conflict (key) do nothing;

-- ----------------------------------------------------------------
-- STEP 3: Enable RLS on all tables
-- ----------------------------------------------------------------

alter table public.profiles              enable row level security;
alter table public.organizers            enable row level security;
alter table public.events                enable row level security;
alter table public.ticket_tiers          enable row level security;
alter table public.orders                enable row level security;
alter table public.tickets               enable row level security;
alter table public.waitlist              enable row level security;
alter table public.push_subscriptions    enable row level security;
alter table public.boosts                enable row level security;
alter table public.boost_slot_prices     enable row level security;
alter table public.clubs                 enable row level security;
alter table public.club_members          enable row level security;
alter table public.refunds               enable row level security;
alter table public.event_notifications   enable row level security;
alter table public.platform_settings     enable row level security;
alter table public.legal_pages           enable row level security;
alter table public.hero_boosts           enable row level security;
alter table public.event_terms_acceptances enable row level security;
alter table public.door_staff_orders     enable row level security;

-- ----------------------------------------------------------------
-- STEP 4: Recreate ALL RLS policies (using is_current_user_admin)
-- ----------------------------------------------------------------

-- ===== profiles =====
drop policy if exists "profiles are self readable" on public.profiles;
create policy "profiles are self readable" on public.profiles
  for select using (auth.uid() = id or public.is_current_user_admin());

drop policy if exists "profiles are self writable" on public.profiles;
create policy "profiles are self writable" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ===== organizers =====
-- NUCLEAR: Drop ALL policies and recreate clean
do $$
declare
  r record;
begin
  for r in (select policyname from pg_policies where tablename = 'organizers' and schemaname = 'public')
  loop
    execute format('drop policy if exists %I on public.organizers', r.policyname);
  end loop;
end$$;

create policy "organizers are public" on public.organizers
  for select using (true);

create policy "organizers owner insert" on public.organizers
  for insert with check (auth.uid() = owner_id);
create policy "organizers owner update" on public.organizers
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "organizers owner delete" on public.organizers
  for delete using (auth.uid() = owner_id);

-- ===== events =====
-- NUCLEAR OPTION: Drop ALL existing policies on events table and recreate clean.
-- This ensures no stale `for all` policy interferes with SELECT.
do $$
declare
  r record;
begin
  for r in (select policyname from pg_policies where tablename = 'events' and schemaname = 'public')
  loop
    execute format('drop policy if exists %I on public.events', r.policyname);
  end loop;
end$$;

-- Published events are visible to EVERYONE (including anonymous / logged-out users)
-- NOTE: Do NOT call is_event_staff() here to avoid RLS recursion on the events table.
create policy "published events are public" on public.events
  for select using (status = 'PUBLISHED');

-- Organizers can see ALL their own events (including DRAFT, CANCELLED, POSTPONED)
create policy "organizers see own events" on public.events
  for select using (
    exists (select 1 from public.organizers o
      where o.id = events.organizer_id and o.owner_id = auth.uid())
  );

-- Admins can see ALL events
create policy "admins see all events" on public.events
  for select using (public.is_current_user_admin());

-- Organizers can insert their own events
create policy "events organizer insert" on public.events
  for insert with check (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
    or public.is_current_user_admin()
  );

-- Organizers can update their own events
create policy "events organizer update" on public.events
  for update using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
    or public.is_current_user_admin()
  );

-- Organizers can delete their own events
create policy "events organizer delete" on public.events
  for delete using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
    or public.is_current_user_admin()
  );

-- ===== ticket_tiers =====
-- NUCLEAR: Drop ALL policies and recreate clean
do $$
declare
  r record;
begin
  for r in (select policyname from pg_policies where tablename = 'ticket_tiers' and schemaname = 'public')
  loop
    execute format('drop policy if exists %I on public.ticket_tiers', r.policyname);
  end loop;
end$$;

create policy "tiers are public" on public.ticket_tiers
  for select using (true);

create policy "tiers organizer insert" on public.ticket_tiers
  for insert with check (public.is_event_staff(event_id));
create policy "tiers organizer update" on public.ticket_tiers
  for update using (public.is_event_staff(event_id));
create policy "tiers organizer delete" on public.ticket_tiers
  for delete using (public.is_event_staff(event_id));

-- ===== orders =====
drop policy if exists "orders are visible to buyer and organizer" on public.orders;
create policy "orders are visible to buyer and organizer" on public.orders
  for select using (auth.uid() = user_id or public.is_event_staff(event_id));

drop policy if exists "buyers create their own orders" on public.orders;
create policy "buyers create their own orders" on public.orders
  for insert with check (auth.uid() = user_id);

drop policy if exists "organizer updates orders" on public.orders;
create policy "organizer updates orders" on public.orders
  for update using (public.is_event_staff(event_id));

-- ===== tickets =====
drop policy if exists "tickets are visible to holder and organizer" on public.tickets;
create policy "tickets are visible to holder and organizer" on public.tickets
  for select using (auth.uid() = user_id or public.is_event_staff(event_id));

drop policy if exists "organizer creates tickets" on public.tickets;
create policy "organizer creates tickets" on public.tickets
  for insert with check (public.is_event_staff(event_id));

drop policy if exists "organizer updates tickets" on public.tickets;
create policy "organizer updates tickets" on public.tickets
  for update using (public.is_event_staff(event_id));

-- ===== waitlist =====
drop policy if exists "waitlist self or staff" on public.waitlist;
create policy "waitlist self or staff" on public.waitlist
  for select using (auth.uid() = user_id or public.is_event_staff(event_id));

drop policy if exists "waitlist self insert" on public.waitlist;
create policy "waitlist self insert" on public.waitlist
  for insert with check (auth.uid() = user_id);

drop policy if exists "waitlist self delete" on public.waitlist;
create policy "waitlist self delete" on public.waitlist
  for delete using (auth.uid() = user_id);

-- ===== push_subscriptions =====
drop policy if exists "push subs self" on public.push_subscriptions;
create policy "push subs self" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== boosts (slot-based) =====
-- NUCLEAR: Drop ALL policies and recreate clean
do $$
declare
  r record;
begin
  for r in (select policyname from pg_policies where tablename = 'boosts' and schemaname = 'public')
  loop
    execute format('drop policy if exists %I on public.boosts', r.policyname);
  end loop;
end$$;

create policy "boosts active public" on public.boosts
  for select using (status = 'ACTIVE' or public.is_event_staff(event_id));

create policy "boosts organizer insert" on public.boosts
  for insert with check (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );

create policy "boosts organizer update" on public.boosts
  for update using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
    or public.is_current_user_admin()
  );

-- ===== boost_slot_prices =====
drop policy if exists "boost prices public" on public.boost_slot_prices;
drop policy if exists "boost prices admin update" on public.boost_slot_prices;
create policy "boost prices public" on public.boost_slot_prices
  for select using (true);
create policy "boost prices admin update" on public.boost_slot_prices
  for update using (public.is_current_user_admin());

-- ===== clubs =====
drop policy if exists "clubs are publicly readable" on public.clubs;
create policy "clubs are publicly readable" on public.clubs
  for select using (true);

drop policy if exists "organizers can insert clubs" on public.clubs;
create policy "organizers can insert clubs" on public.clubs
  for insert with check (
    exists (select 1 from public.organizers o where o.id = owner_id and o.owner_id = auth.uid())
  );

drop policy if exists "organizers can update own clubs" on public.clubs;
create policy "organizers can update own clubs" on public.clubs
  for update using (
    exists (select 1 from public.organizers o where o.id = owner_id and o.owner_id = auth.uid())
  );

-- ===== club_members =====
drop policy if exists "members are visible to club owner and self" on public.club_members;
create policy "members are visible to club owner and self" on public.club_members
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.clubs c
      join public.organizers o on o.id = c.owner_id
      where c.id = club_id and o.owner_id = auth.uid()
    )
  );

drop policy if exists "users can request to join" on public.club_members;
create policy "users can request to join" on public.club_members
  for insert with check (user_id = auth.uid());

drop policy if exists "users can update own membership" on public.club_members;
create policy "users can update own membership" on public.club_members
  for update using (user_id = auth.uid());

drop policy if exists "club owners can update membership status" on public.club_members;
create policy "club owners can update membership status" on public.club_members
  for update using (
    exists (
      select 1 from public.clubs c
      join public.organizers o on o.id = c.owner_id
      where c.id = club_id and o.owner_id = auth.uid()
    )
  );

-- ===== refunds =====
drop policy if exists "users can read own refunds" on public.refunds;
create policy "users can read own refunds" on public.refunds
  for select using (user_id = auth.uid());

drop policy if exists "organizers can read event refunds" on public.refunds;
create policy "organizers can read event refunds" on public.refunds
  for select using (
    exists (select 1 from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = event_id and o.owner_id = auth.uid())
  );

drop policy if exists "organizers can create refunds" on public.refunds;
create policy "organizers can create refunds" on public.refunds
  for insert with check (
    exists (select 1 from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = event_id and o.owner_id = auth.uid())
  );

drop policy if exists "organizers can update refund status" on public.refunds;
create policy "organizers can update refund status" on public.refunds
  for update using (
    exists (select 1 from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = event_id and o.owner_id = auth.uid())
  );

-- ===== event_notifications =====
drop policy if exists "users can read own notifications" on public.event_notifications;
create policy "users can read own notifications" on public.event_notifications
  for select using (user_id = auth.uid());

drop policy if exists "users can mark own notifications read" on public.event_notifications;
create policy "users can mark own notifications read" on public.event_notifications
  for update using (user_id = auth.uid());

drop policy if exists "organizers can create event notifications" on public.event_notifications;
create policy "organizers can create event notifications" on public.event_notifications
  for insert with check (
    exists (select 1 from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = event_id and o.owner_id = auth.uid())
  );

-- ===== platform_settings =====
drop policy if exists "public read platform settings" on public.platform_settings;
create policy "public read platform settings" on public.platform_settings
  for select using (true);

drop policy if exists "admin insert platform settings" on public.platform_settings;
create policy "admin insert platform settings" on public.platform_settings
  for insert with check (public.is_current_user_admin());

drop policy if exists "admin update platform settings" on public.platform_settings;
create policy "admin update platform settings" on public.platform_settings
  for update using (public.is_current_user_admin());

drop policy if exists "admin delete platform settings" on public.platform_settings;
create policy "admin delete platform settings" on public.platform_settings
  for delete using (public.is_current_user_admin());

-- ===== legal_pages =====
drop policy if exists "public read legal pages" on public.legal_pages;
create policy "public read legal pages" on public.legal_pages
  for select using (is_published = true);

drop policy if exists "admin insert legal pages" on public.legal_pages;
create policy "admin insert legal pages" on public.legal_pages
  for insert with check (public.is_current_user_admin());

drop policy if exists "admin update legal pages" on public.legal_pages;
create policy "admin update legal pages" on public.legal_pages
  for update using (public.is_current_user_admin());

drop policy if exists "admin delete legal pages" on public.legal_pages;
create policy "admin delete legal pages" on public.legal_pages
  for delete using (public.is_current_user_admin());

-- ===== hero_boosts =====
-- NUCLEAR: Drop ALL policies and recreate clean
do $$
declare
  r record;
begin
  for r in (select policyname from pg_policies where tablename = 'hero_boosts' and schemaname = 'public')
  loop
    execute format('drop policy if exists %I on public.hero_boosts', r.policyname);
  end loop;
end$$;

-- Active hero boosts are publicly visible (for homepage carousel)
create policy "active hero boosts are public" on public.hero_boosts
  for select using (status = 'ACTIVE');

-- Organizers can read their own boosts (any status)
create policy "organizer read own hero boosts" on public.hero_boosts
  for select using (
    exists (select 1 from public.organizers o
      where o.id = hero_boosts.organizer_id and o.owner_id = auth.uid())
  );

-- Admins can read all boosts
create policy "admin read hero boosts" on public.hero_boosts
  for select using (public.is_current_user_admin());

-- Organizers can insert hero boosts (pending only)
create policy "organizer insert hero boosts" on public.hero_boosts
  for insert with check (
    exists (select 1 from public.organizers o
      where o.id = hero_boosts.organizer_id and o.owner_id = auth.uid())
    and status = 'PENDING'
  );

-- Admins can update hero boosts
create policy "admin update hero boosts" on public.hero_boosts
  for update using (public.is_current_user_admin());

-- Admins can delete hero boosts
create policy "admin delete hero boosts" on public.hero_boosts
  for delete using (public.is_current_user_admin());

-- ===== event_terms_acceptances =====
drop policy if exists "organizers read own terms acceptances" on public.event_terms_acceptances;
create policy "organizers read own terms acceptances" on public.event_terms_acceptances
  for select using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );

drop policy if exists "insert terms acceptances" on public.event_terms_acceptances;
create policy "insert terms acceptances" on public.event_terms_acceptances
  for insert with check (auth.uid() is not null);

drop policy if exists "admin read all terms acceptances" on public.event_terms_acceptances;
create policy "admin read all terms acceptances" on public.event_terms_acceptances
  for select using (public.is_current_user_admin());

-- ===== door_staff_orders =====
drop policy if exists "organizers read own door staff orders" on public.door_staff_orders;
create policy "organizers read own door staff orders" on public.door_staff_orders
  for select using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );

drop policy if exists "organizers insert door staff orders" on public.door_staff_orders;
create policy "organizers insert door staff orders" on public.door_staff_orders
  for insert with check (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );

drop policy if exists "organizers update own door staff orders" on public.door_staff_orders;
create policy "organizers update own door staff orders" on public.door_staff_orders
  for update using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );

drop policy if exists "admin read all door staff orders" on public.door_staff_orders;
create policy "admin read all door staff orders" on public.door_staff_orders
  for select using (public.is_current_user_admin());

drop policy if exists "admin update door staff orders" on public.door_staff_orders;
create policy "admin update door staff orders" on public.door_staff_orders
  for update using (public.is_current_user_admin());

-- ===== Storage bucket =====
insert into storage.buckets (id, name, public)
values ('event-media', 'event-media', true)
on conflict (id) do nothing;

drop policy if exists "public read on event-media" on storage.objects;
create policy "public read on event-media"
  on storage.objects for select
  using (bucket_id = 'event-media');

drop policy if exists "authenticated upload on event-media" on storage.objects;
create policy "authenticated upload on event-media"
  on storage.objects for insert
  with check (bucket_id = 'event-media' and auth.role() = 'authenticated');

drop policy if exists "authenticated update on event-media" on storage.objects;
create policy "authenticated update on event-media"
  on storage.objects for update
  using (bucket_id = 'event-media' and auth.role() = 'authenticated');

drop policy if exists "authenticated delete on event-media" on storage.objects;
create policy "authenticated delete on event-media"
  on storage.objects for delete
  using (bucket_id = 'event-media' and auth.role() = 'authenticated');

-- ----------------------------------------------------------------
-- STEP 5: Auto-promote first user to admin (if only 1 user exists)
-- ----------------------------------------------------------------
do $$
begin
  if (select count(*) from public.profiles) = 1
     and (select count(*) from public.profiles where is_admin = true) = 0 then
    update public.profiles set is_admin = true
    where id = (select id from public.profiles limit 1);
  end if;
end $$;

-- ----------------------------------------------------------------
-- STEP 6: Update Terms & Conditions content
-- ----------------------------------------------------------------

insert into public.legal_pages (slug, title, content, is_published) values
  ('terms', 'Terms & Conditions',
   E'# Terms & Conditions\n\nBy purchasing a ticket on Outsiderr, you agree to the following terms:\n\n- Please carry a valid ID proof along with you.\n- No refunds on purchased ticket are possible, even in case of any rescheduling.\n- Security procedures, including frisking remain the right of the management.\n- No dangerous or potentially hazardous objects including but not limited to weapons, knives, guns, fireworks, helmets, lazer devices, bottles, musical instruments will be allowed in the venue and may be ejected with or without the owner from the venue.\n- The sponsors/performers/organizers are not responsible for any injury or damage occurring due to the event. Any claims regarding the same would be settled in courts in Mumbai.\n- People in an inebriated state may not be allowed entry.\n- Organizers hold the right to deny late entry to the event.\n- Venue rules apply.',
   true)
on conflict (slug) do update set
  title   = excluded.title,
  content = excluded.content;

-- ----------------------------------------------------------------
-- STEP 7: Replace approve_order and reject_order RPCs
-- Remove the is_event_staff() check from inside these security
-- definer functions. Auth is enforced by the app layer (organizer
-- page only shows orders for their events). The security definer
-- means ALL inserts/updates inside bypass RLS completely — no more
-- "new row violates row-level security policy for table tickets".
-- ----------------------------------------------------------------

create or replace function public.approve_order(p_order_id uuid)
returns setof public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_tier  public.ticket_tiers;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;
  if v_order.status <> 'PENDING_VERIFICATION' then
    raise exception 'Order is already %', v_order.status;
  end if;

  -- Authorization: only event staff (organizer or admin) can approve
  if not public.is_event_staff(v_order.event_id) then
    raise exception 'Not authorised to approve orders for this event';
  end if;

  -- Stock check: prevent overselling
  select * into v_tier from public.ticket_tiers where id = v_order.tier_id for update;
  if not found then
    raise exception 'Ticket tier not found';
  end if;
  if v_tier.quantity - v_tier.quantity_sold < v_order.quantity then
    raise exception 'Not enough tickets left in this tier (available: %, requested: %)',
      v_tier.quantity - v_tier.quantity_sold, v_order.quantity;
  end if;

  update public.ticket_tiers
     set quantity_sold = quantity_sold + v_order.quantity
   where id = v_order.tier_id;

  update public.orders
     set status = 'CONFIRMED', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_order_id;

  update public.events
     set registrations_count = registrations_count + v_order.quantity
   where id = v_order.event_id;

  return query
    insert into public.tickets (order_id, event_id, tier_id, user_id, qr_hash)
    select
      v_order.id,
      v_order.event_id,
      v_order.tier_id,
      v_order.user_id,
      encode(
        sha256((v_order.id::text || ':' || g::text || ':' || gen_random_uuid()::text)::bytea),
        'hex'
      )
    from generate_series(1, v_order.quantity) g
    returning *;
end;
$$;

create or replace function public.reject_order(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  -- Authorization: only event staff (organizer or admin) can reject
  if not public.is_event_staff(v_order.event_id) then
    raise exception 'Not authorised to reject orders for this event';
  end if;

  update public.orders
     set status           = 'REJECTED',
         rejection_reason = p_reason,
         reviewed_by      = auth.uid(),
         reviewed_at      = now()
   where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- ----------------------------------------------------------------
-- STEP 7b: Atomic cancel_event RPC (replaces non-atomic app-layer flow)
-- ----------------------------------------------------------------
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
  -- Verify caller is the event organizer
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

  -- Set status → CANCELLATION_REQUESTED
  update public.events set status = 'CANCELLATION_REQUESTED'
   where id = p_event_id and organizer_id = v_organizer_id;

  -- Process all confirmed orders atomically
  for v_order in
    select id, user_id, total_paise, platform_fee_paise
      from public.orders
     where event_id = p_event_id and status = 'CONFIRMED'
  loop
    -- Mark order REFUNDED
    update public.orders set status = 'REFUNDED' where id = v_order.id;
    -- Mark tickets CANCELLED
    update public.tickets set status = 'CANCELLED' where order_id = v_order.id;
    -- Create refund record
    insert into public.refunds (order_id, event_id, user_id, amount_paise, platform_fee_paise, status, reason, initiated_at)
    values (v_order.id, p_event_id, v_order.user_id, v_order.total_paise, v_order.platform_fee_paise, 'PENDING', p_reason, now());
    -- Create notification
    insert into public.event_notifications (event_id, user_id, type, message)
    values (p_event_id, v_order.user_id, 'CANCELLATION', p_reason || ' You will receive a full refund.');
    -- Accumulate totals
    v_refund_count := v_refund_count + 1;
    v_total_refund := v_total_refund + v_order.total_paise;
    v_total_fee := v_total_fee + v_order.platform_fee_paise;
  end loop;

  -- Set final status → CANCELLED
  update public.events set status = 'CANCELLED'
   where id = p_event_id and organizer_id = v_organizer_id;

  -- Cancel any active hero boosts for this event
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

-- ----------------------------------------------------------------
-- STEP 7c: Atomic postpone_event RPC
-- ----------------------------------------------------------------
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

  -- Update event status + dates
  update public.events
     set status = 'POSTPONED', starts_at = p_new_starts_at, ends_at = p_new_ends_at
   where id = p_event_id;

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

-- ----------------------------------------------------------------
-- STEP 8: Add KYC / payout columns to organizers table
-- (safe to run on existing DB — uses IF NOT EXISTS / idempotent)
-- ----------------------------------------------------------------

alter table public.organizers
  add column if not exists pan_number          text,
  add column if not exists pan_name            text,
  add column if not exists gst_number          text,
  add column if not exists gst_business_name   text,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc           text,
  add column if not exists bank_account_name   text,
  add column if not exists bank_account_type   text,
  add column if not exists kyc_submitted       boolean not null default false;

-- ----------------------------------------------------------------
-- STEP 9: Sync is_organizer flag on profiles
-- Any user who has an organizer profile but is_organizer = false
-- gets the flag fixed. This resolves the mobile issue where
-- the profile menu shows "List Your Event" instead of "Manage Your Events".
-- ----------------------------------------------------------------

update public.profiles p
  set is_organizer = true
  where exists (
    select 1 from public.organizers o where o.owner_id = p.id
  )
  and (p.is_organizer is null or p.is_organizer = false);

-- ----------------------------------------------------------------
-- STEP 10: Insert tagline platform settings
-- (jsonb column — string values must be double-quoted JSON strings)
-- ----------------------------------------------------------------

insert into public.platform_settings (key, value, description) values
  ('tagline_header',    '"Find what''s happening outside the mainstream."', 'Homepage header tagline (bold line)'),
  ('tagline_subheader', '"Discover raw events happening today near you."',  'Homepage sub-tagline (muted line)'),
  ('tagline_footer',    '"Cyphers, battles, stunts, skates, jams & real communities. Discover raw events happening today near you."', 'Footer brand tagline')
on conflict (key) do nothing;

-- ----------------------------------------------------------------
-- STEP 10b: Insert commission tier settings
-- ----------------------------------------------------------------

insert into public.platform_settings (key, value, description) values
  ('commission_tier1_max_paise', '50000',  'Tier 1 threshold: tickets below this price use tier 1 rate (paise)'),
  ('commission_tier2_max_paise', '300000', 'Tier 2 threshold: tickets up to this price use tier 2 rate (paise)'),
  ('commission_tier1_bps',       '1000',   'Tier 1 commission rate in bps (1000 = 10%)'),
  ('commission_tier2_bps',       '700',    'Tier 2 commission rate in bps (700 = 7%)'),
  ('commission_tier3_bps',       '500',    'Tier 3 commission rate in bps (500 = 5%)')
on conflict (key) do nothing;

-- ----------------------------------------------------------------
-- STEP 11: Clean up orphaned hero boosts
-- Remove hero boosts that reference events that no longer exist
-- ----------------------------------------------------------------

delete from public.hero_boosts
  where not exists (
    select 1 from public.events e where e.id = hero_boosts.event_id
  );

-- ----------------------------------------------------------------
-- STEP 12: Auto-promote first user to admin via trigger
-- This fires every time a new profile is inserted. If no admin
-- exists yet, the first user becomes admin automatically.
-- Works after wipe_all.sql (unlike the one-time DO block in schema.sql)
-- ----------------------------------------------------------------

create or replace function public.auto_promote_first_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only promote if this is the first user and no admin exists
  if (select count(*) from public.profiles where is_admin = true) = 0 then
    update public.profiles set is_admin = true where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_insert on public.profiles;
create trigger on_profile_insert
  after insert on public.profiles
  for each row execute function public.auto_promote_first_admin();

-- ----------------------------------------------------------------
-- STEP 8: Unique constraint on club_members (prevent duplicate joins)
-- ----------------------------------------------------------------
create unique index if not exists club_members_club_user_unique
  on public.club_members(club_id, user_id);

-- ----------------------------------------------------------------
-- STEP 13: Allow PHASED pricing mode on events
-- The app supports 4 pricing modes: FREE, FLAT, PAID, PHASED
-- but the original check constraint only allowed FREE, FLAT, PAID.
-- Drop both old constraint names (schema.sql vs migration created different names)
-- and add a single clean constraint.
-- ----------------------------------------------------------------
alter table public.events drop constraint if exists events_pricing_mode_check;
alter table public.events drop constraint if exists events_pricing_model_check;
alter table public.events add constraint events_pricing_mode_check
  check (pricing_mode in ('FREE','FLAT','PAID','PHASED'));

-- ----------------------------------------------------------------
-- Social links: YouTube + X for profiles, organizers, events
-- ----------------------------------------------------------------
alter table public.profiles add column if not exists youtube_url text;
alter table public.profiles add column if not exists x_url text;
alter table public.profiles add column if not exists facebook_url text;
alter table public.profiles add column if not exists linkedin_url text;
alter table public.organizers add column if not exists youtube_url text;
alter table public.organizers add column if not exists x_url text;
alter table public.organizers add column if not exists facebook_url text;
alter table public.organizers add column if not exists linkedin_url text;
alter table public.events add column if not exists youtube_url text;
alter table public.events add column if not exists x_url text;
alter table public.events add column if not exists facebook_url text;
alter table public.events add column if not exists linkedin_url text;

-- ----------------------------------------------------------------
-- Notification types: add WAITLIST_OFFER, VENUE_CHANGE, CITY_CHANGE, TIME_CHANGE
-- ----------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'WAITLIST_OFFER' and enumtypid = (select oid from pg_type where typname = 'event_notification_type')) then
    alter type event_notification_type add value 'WAITLIST_OFFER';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'VENUE_CHANGE' and enumtypid = (select oid from pg_type where typname = 'event_notification_type')) then
    alter type event_notification_type add value 'VENUE_CHANGE';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'CITY_CHANGE' and enumtypid = (select oid from pg_type where typname = 'event_notification_type')) then
    alter type event_notification_type add value 'CITY_CHANGE';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'TIME_CHANGE' and enumtypid = (select oid from pg_type where typname = 'event_notification_type')) then
    alter type event_notification_type add value 'TIME_CHANGE';
  end if;
end $$;

-- ----------------------------------------------------------------
-- DONE.
-- ----------------------------------------------------------------
