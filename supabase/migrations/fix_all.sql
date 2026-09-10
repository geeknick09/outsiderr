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

-- Add email column to profiles + update trigger to save it
alter table public.profiles add column if not exists email text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email,
    new.phone,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email;
  return new;
end;
$$;

-- Backfill email for existing profiles from auth.users
update public.profiles p
  set email = au.email
  from auth.users au
  where p.id = au.id and p.email is null;

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
-- STEP 7a: Atomic create_paid_order RPC (prevents concurrent overbooking)
-- Uses SELECT FOR UPDATE on tier + double-booking check in one transaction.
-- Inserts as PENDING_VERIFICATION — quantity_sold only increments on approval.
-- ----------------------------------------------------------------
create or replace function public.create_paid_order(
  p_event_id        uuid,
  p_tier_id         uuid,
  p_quantity        integer,
  p_unit_price_paise   integer,
  p_subtotal_paise     integer,
  p_platform_fee_paise integer,
  p_total_paise        integer,
  p_fee_payer          text,
  p_utr_reference      text,
  p_payment_proof_url  text,
  p_buyer_name         text default null,
  p_buyer_phone        text default null,
  p_buyer_email        text default null,
  p_buyer_gender       text default null,
  p_commission_paise      integer default 0,
  p_convenience_fee_paise integer default 0,
  p_organizer_payout_paise integer default 0
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
  -- Lock the tier row to prevent concurrent overbooking
  select * into v_tier from public.ticket_tiers where id = p_tier_id for update;
  if not found then
    raise exception 'Ticket tier not found';
  end if;
  if v_tier.price_paise = 0 then
    raise exception 'This function is for paid tickets only';
  end if;
  if v_tier.quantity - v_tier.quantity_sold < p_quantity then
    raise exception 'Not enough tickets left in this tier';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found';
  end if;

  -- Prevent double booking: check for existing active orders by this user for this event
  select count(*) into v_existing_count
  from public.orders
  where event_id = p_event_id
    and user_id = auth.uid()
    and status in ('CONFIRMED', 'PENDING_VERIFICATION');
  if v_existing_count > 0 then
    raise exception 'You have already booked a ticket for this event';
  end if;

  -- Insert order as PENDING_VERIFICATION
  insert into public.orders (
    event_id, tier_id, user_id, quantity,
    unit_price_paise, subtotal_paise, platform_fee_paise, total_paise,
    fee_payer, status, utr_reference, payment_proof_url,
    buyer_name, buyer_phone, buyer_email, buyer_gender,
    commission_paise, convenience_fee_paise, organizer_payout_paise
  ) values (
    p_event_id, p_tier_id, auth.uid(), p_quantity,
    p_unit_price_paise, p_subtotal_paise, p_platform_fee_paise, p_total_paise,
    p_fee_payer::fee_payer, 'PENDING_VERIFICATION', p_utr_reference, p_payment_proof_url,
    p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender,
    p_commission_paise, p_convenience_fee_paise, p_organizer_payout_paise
  )
  returning * into v_order;

  -- Do NOT increment quantity_sold here — only on approval
  -- Do NOT mint tickets here — only on approval

  return v_order;
end;
$$;

-- ----------------------------------------------------------------
-- STEP 7b: Door scanner check-in RPC — validate + mark USED
-- Returns VALID, ALREADY_USED, or INVALID
-- ----------------------------------------------------------------
create or replace function public.check_in_ticket(p_qr_hash text, p_event_id uuid)
returns table (
  outcome       text,
  event_title   text,
  tier_name     text,
  holder_name   text,
  checked_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
begin
  select * into v_ticket
    from public.tickets
   where qr_hash = p_qr_hash
     for update;

  if not found then
    return query
      select 'INVALID'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_ticket.event_id <> p_event_id then
    return query
      select 'INVALID'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if not public.is_event_staff(v_ticket.event_id) then
    raise exception 'Not authorised to scan tickets for this event';
  end if;

  if v_ticket.status <> 'VALID' then
    return query
      select
        case when v_ticket.status = 'USED' then 'ALREADY_USED' else 'INVALID' end,
        e.title,
        t.name,
        p.full_name,
        v_ticket.checked_in_at
      from public.events       e
      join public.ticket_tiers t on t.id = v_ticket.tier_id
      left join public.profiles p on p.id = v_ticket.user_id
      where e.id = v_ticket.event_id;
    return;
  end if;

  update public.tickets
     set status        = 'USED',
         checked_in_at = now(),
         checked_in_by = auth.uid()
   where id = v_ticket.id
  returning * into v_ticket;

  return query
    select
      'VALID'::text,
      e.title,
      t.name,
      p.full_name,
      v_ticket.checked_in_at
    from public.events       e
    join public.ticket_tiers t on t.id = v_ticket.tier_id
    left join public.profiles p on p.id = v_ticket.user_id
    where e.id = v_ticket.event_id;
end;
$$;

-- ----------------------------------------------------------------
-- STEP 7c: Atomic cancel_event RPC (replaces non-atomic app-layer flow)
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
alter table public.profiles add column if not exists gender text check (gender in ('male','female','non-binary','other'));
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
-- Razorpay notification types: PAYMENT_SUCCESS, PAYMENT_FAILED,
-- REFUND_INITIATED, REFUND_COMPLETED, PAYOUT_COMPLETED
-- ----------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'PAYMENT_SUCCESS' and enumtypid = (select oid from pg_type where typname = 'event_notification_type')) then
    alter type event_notification_type add value 'PAYMENT_SUCCESS';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'PAYMENT_FAILED' and enumtypid = (select oid from pg_type where typname = 'event_notification_type')) then
    alter type event_notification_type add value 'PAYMENT_FAILED';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'REFUND_INITIATED' and enumtypid = (select oid from pg_type where typname = 'event_notification_type')) then
    alter type event_notification_type add value 'REFUND_INITIATED';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'REFUND_COMPLETED' and enumtypid = (select oid from pg_type where typname = 'event_notification_type')) then
    alter type event_notification_type add value 'REFUND_COMPLETED';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'PAYOUT_COMPLETED' and enumtypid = (select oid from pg_type where typname = 'event_notification_type')) then
    alter type event_notification_type add value 'PAYOUT_COMPLETED';
  end if;
end $$;

-- ----------------------------------------------------------------
-- Add description column to organizers (longer bio, up to 400 chars)
-- bio stays as a short intro (up to 200 chars)
-- ----------------------------------------------------------------
alter table public.organizers add column if not exists description text;

-- ----------------------------------------------------------------
-- Atomic offer_waitlist_next RPC (returns the offered row so app can
-- create a notification). Uses SELECT FOR UPDATE to prevent race.
-- ----------------------------------------------------------------
-- Must DROP first because we're changing the return type from void to waitlist
drop function if exists public.offer_waitlist_next(uuid);
create or replace function public.offer_waitlist_next(p_tier_id uuid)
returns public.waitlist
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next public.waitlist;
begin
  select * into v_next
    from public.waitlist
   where tier_id = p_tier_id and status = 'WAITING'
   order by position asc
   limit 1
     for update;

  if not found then return null; end if;

  update public.waitlist
     set status     = 'OFFERED',
         offered_at = now(),
         expires_at = now() + interval '24 hours'
   where id = v_next.id
  returning * into v_next;

  return v_next;
end;
$$;

-- ----------------------------------------------------------------
-- Commission + convenience fee system
-- ----------------------------------------------------------------
alter table public.events add column if not exists commission_bps integer not null default 1000;
alter table public.events add column if not exists commission_enabled boolean not null default true;
alter table public.events add column if not exists convenience_fee_bps integer not null default 200;
alter table public.events add column if not exists convenience_fee_enabled boolean not null default true;

alter table public.orders add column if not exists commission_paise integer not null default 0;
alter table public.orders add column if not exists convenience_fee_paise integer not null default 0;
alter table public.orders add column if not exists organizer_payout_paise integer not null default 0;

-- Audit log table for admin changes
create table if not exists public.admin_change_log (
  id          uuid        primary key default gen_random_uuid(),
  admin_id    uuid        not null references auth.users(id),
  table_name  text        not null,
  entity_id   text,
  field_name  text        not null,
  old_value   text,
  new_value   text,
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists admin_change_log_created_idx on public.admin_change_log(created_at desc);
create index if not exists admin_change_log_entity_idx on public.admin_change_log(table_name, entity_id);

-- RLS for admin_change_log
alter table public.admin_change_log enable row level security;
drop policy if exists "admins read change log" on public.admin_change_log;
create policy "admins read change log" on public.admin_change_log
  for select to authenticated using (public.is_current_user_admin());
drop policy if exists "admins insert change log" on public.admin_change_log;
create policy "admins insert change log" on public.admin_change_log
  for insert to authenticated with check (public.is_current_user_admin());

-- Platform-level defaults for commission + convenience fee
insert into public.platform_settings (key, value, description)
values ('default_commission_bps', '1000', 'Default organizer commission in basis points (10%)')
on conflict (key) do nothing;
insert into public.platform_settings (key, value, description)
values ('default_convenience_fee_bps', '200', 'Default buyer convenience fee in basis points (2%)')
on conflict (key) do nothing;
insert into public.platform_settings (key, value, description)
values ('max_popular_per_city', '4', 'Max popular events shown per city on homepage')
on conflict (key) do nothing;
insert into public.platform_settings (key, value, description)
values ('max_sponsored_per_city', '4', 'Max sponsored/featured events shown per city on homepage')
on conflict (key) do nothing;

-- ----------------------------------------------------------------
-- Multi-category support + Hip Hop Party category
-- ----------------------------------------------------------------
alter type event_category add value if not exists 'HIP_HOP_PARTY';
alter type event_category add value if not exists 'CAR_BIKE_MEET';
alter table public.events add column if not exists categories text[] not null default '{}';

-- Backfill: set categories = [category] for existing events
update public.events set categories = array[category::text] where array_length(categories, 1) is null or array_length(categories, 1) = 0;

-- ----------------------------------------------------------------
-- Supabase Realtime — enable Postgres Changes on key tables
-- Allows the browser client to subscribe to INSERT/UPDATE/DELETE
-- events via websockets for live UI updates.
-- ----------------------------------------------------------------
-- Use DO blocks to silently skip if the table is already in the publication.
do $$ begin
  alter publication supabase_realtime add table public.event_notifications;
exception when duplicate_object then null; when duplicate_table then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.ticket_tiers;
exception when duplicate_object then null; when duplicate_table then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; when duplicate_table then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.tickets;
exception when duplicate_object then null; when duplicate_table then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null; when duplicate_table then null;
end $$;

-- ----------------------------------------------------------------
-- STEP 14: Razorpay integration — schema changes + new RPCs
-- ----------------------------------------------------------------

-- Extend order_status enum with new Razorpay flow values
do $$ begin
  alter type order_status add value if not exists 'REFUNDED';
exception when others then null; end $$;
do $$ begin
  alter type order_status add value if not exists 'RESERVED';
exception when others then null; end $$;
do $$ begin
  alter type order_status add value if not exists 'EXPIRED';
exception when others then null; end $$;
do $$ begin
  alter type order_status add value if not exists 'FAILED';
exception when others then null; end $$;

-- Razorpay columns on orders
alter table public.orders add column if not exists razorpay_order_id text;
alter table public.orders add column if not exists razorpay_payment_id text;
alter table public.orders add column if not exists razorpay_signature text;
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists reserved_at timestamptz;
alter table public.orders add column if not exists reservation_expires_at timestamptz;
alter table public.orders add column if not exists confirmed_at timestamptz;
alter table public.orders add column if not exists invoice_number text;

-- Reserved inventory on ticket_tiers
alter table public.ticket_tiers add column if not exists quantity_reserved integer not null default 0;
do $$ begin
  alter table public.ticket_tiers add constraint ticket_tiers_not_overreserved
    check (quantity_sold + quantity_reserved <= quantity);
exception when duplicate_object then null; end $$;

-- Unique indexes for Razorpay IDs
create unique index if not exists orders_razorpay_order_id_idx
  on public.orders(razorpay_order_id) where razorpay_order_id is not null;
create unique index if not exists orders_razorpay_payment_id_idx
  on public.orders(razorpay_payment_id) where razorpay_payment_id is not null;
create index if not exists orders_reservation_expires_idx
  on public.orders(reservation_expires_at) where status = 'RESERVED';

-- Razorpay columns on hero_boosts
alter table public.hero_boosts add column if not exists razorpay_order_id text;
alter table public.hero_boosts add column if not exists razorpay_payment_id text;
create unique index if not exists hero_boosts_razorpay_order_idx
  on public.hero_boosts(razorpay_order_id) where razorpay_order_id is not null;

-- Razorpay columns on refunds
alter table public.refunds add column if not exists razorpay_refund_id text;
alter table public.refunds add column if not exists razorpay_payment_id text;
alter table public.refunds add column if not exists refund_type text default 'FULL' check (refund_type in ('FULL','PARTIAL'));
alter table public.refunds add column if not exists initiated_by uuid references auth.users(id);
alter table public.refunds add column if not exists gateway_fee_paise integer not null default 0;

-- New tables: webhook_events, payment_ledger, payout_records
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
);
create index if not exists webhook_events_razorpay_event_idx on public.webhook_events(razorpay_event_id);
create index if not exists webhook_events_order_idx          on public.webhook_events(order_id);
create index if not exists webhook_events_unprocessed_idx    on public.webhook_events(processed) where not processed;

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
);
create index if not exists ledger_event_idx      on public.payment_ledger(event_id);
create index if not exists ledger_organizer_idx  on public.payment_ledger(organizer_id);
create index if not exists ledger_order_idx      on public.payment_ledger(order_id);
create index if not exists ledger_type_idx       on public.payment_ledger(type);

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
);
create index if not exists payout_organizer_idx on public.payout_records(organizer_id);
create index if not exists payout_event_idx     on public.payout_records(event_id);
create index if not exists payout_status_idx    on public.payout_records(status);

-- Invoice number sequence
create sequence if not exists invoice_number_seq start with 10001;

-- Enable RLS on new tables
alter table public.webhook_events enable row level security;
alter table public.payment_ledger enable row level security;
alter table public.payout_records enable row level security;

-- RLS policies for new tables
drop policy if exists "admin read webhook events" on public.webhook_events;
create policy "admin read webhook events" on public.webhook_events
  for select using (public.is_current_user_admin());
drop policy if exists "admin update webhook events" on public.webhook_events;
create policy "admin update webhook events" on public.webhook_events
  for update using (public.is_current_user_admin());

drop policy if exists "admin read all ledger" on public.payment_ledger;
create policy "admin read all ledger" on public.payment_ledger
  for select using (public.is_current_user_admin());
drop policy if exists "organizer read own ledger" on public.payment_ledger;
create policy "organizer read own ledger" on public.payment_ledger
  for select using (
    organizer_id is not null
    and exists (select 1 from public.organizers o
                where o.id = payment_ledger.organizer_id and o.owner_id = auth.uid())
  );

drop policy if exists "admin read all payouts" on public.payout_records;
create policy "admin read all payouts" on public.payout_records
  for select using (public.is_current_user_admin());
drop policy if exists "admin insert payouts" on public.payout_records;
create policy "admin insert payouts" on public.payout_records
  for insert with check (public.is_current_user_admin());
drop policy if exists "admin update payouts" on public.payout_records;
create policy "admin update payouts" on public.payout_records
  for update using (public.is_current_user_admin());
drop policy if exists "organizer read own payouts" on public.payout_records;
create policy "organizer read own payouts" on public.payout_records
  for select using (
    exists (select 1 from public.organizers o
            where o.id = payout_records.organizer_id and o.owner_id = auth.uid())
  );

-- New RPCs (full definitions live in schema.sql; re-created here for migration safety)
-- create_reserved_order, confirm_razorpay_order, fail_razorpay_order,
-- expire_reserved_orders, set_razorpay_order_id
-- These are defined in schema.sql and are idempotent (create or replace).

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

create or replace function public.confirm_razorpay_order(
  p_order_id            uuid,
  p_razorpay_payment_id text,
  p_razorpay_signature  text default null,
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

-- Update cancel_event to also release RESERVED orders' inventory
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

  -- Release reserved inventory for RESERVED orders (Razorpay flow)
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

-- ----------------------------------------------------------------
-- DONE.
-- ----------------------------------------------------------------
-- ----------------------------------------------------------------
-- STEP 10: Performance indexes (added for production readiness)
-- ----------------------------------------------------------------

-- Events: filter by status (admin dashboard, public listing)
create index if not exists events_status_idx on public.events (status);

-- Events: filter by city (public listing)
create index if not exists events_city_idx on public.events (city);

-- Events: filter by is_featured (homepage Front Row)
create index if not exists events_is_featured_idx on public.events (is_featured);

-- Events: GIN index on categories array for .contains() queries
create index if not exists events_categories_gin_idx on public.events using gin (categories);

-- ----------------------------------------------------------------
-- STEP 11: Clean orphaned auth identities
-- ----------------------------------------------------------------
-- Test scripts that delete from auth.users can leave orphaned rows in
-- auth.identities (user_id with no matching auth.users row). These cause
-- "Multiple accounts with the same email address in the same linking
-- domain detected" errors during Google OAuth / magic-link sign-in.
-- Run this after any test-data cleanup to keep auth healthy.
delete from auth.identities
where user_id not in (select id from auth.users);

-- ----------------------------------------------------------------
-- STEP 12: Walk-in / manual check-in support
-- ----------------------------------------------------------------
-- Adds order_source column to distinguish online bookings from
-- organizer-added walk-ins, plus RPCs for creating and editing
-- walk-in orders. Walk-ins have convenience_fee = 0 (they didn't
-- use the platform to register) but commission is still deducted.
-- Modes: WALKIN_PREEVENT (before event, VALID ticket)
--        WALKIN_QR       (during event, VALID ticket for scanning)
--        WALKIN_INSTANT  (during event, auto check-in, USED ticket)
alter table public.orders add column if not exists order_source text not null default 'ONLINE'
  check (order_source in ('ONLINE','WALKIN_PREEVENT','WALKIN_QR','WALKIN_INSTANT'));

create or replace function public.create_walkin_order(
  p_event_id    uuid,
  p_buyer_name  text,
  p_buyer_phone text,
  p_tier_id     uuid    default null,
  p_buyer_email text    default null,
  p_amount_paise integer default 0,
  p_mode        text    default 'WALKIN_PREEVENT'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event         public.events;
  v_tier          public.ticket_tiers;
  v_subtotal      integer;
  v_commission    integer;
  v_payout        integer;
  v_order_id      uuid;
  v_ticket_id     uuid;
  v_tier_id       uuid;
  v_ticket_status text;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;

  if p_tier_id is not null then
    select * into v_tier from public.ticket_tiers where id = p_tier_id and event_id = p_event_id;
    if not found then raise exception 'Tier not found'; end if;
    v_subtotal := v_tier.price_paise;
    v_tier_id  := p_tier_id;
  else
    v_subtotal := p_amount_paise;
    select id into v_tier_id from public.ticket_tiers where event_id = p_event_id limit 1;
    if v_tier_id is null then raise exception 'No tiers exist for this event'; end if;
  end if;

  v_commission := case when v_event.commission_enabled
    then round(v_subtotal * v_event.commission_bps / 10000.0)
    else 0 end;
  v_payout := v_subtotal - v_commission;

  v_ticket_status := case when p_mode = 'WALKIN_INSTANT' then 'USED' else 'VALID' end;

  insert into public.orders (
    event_id, tier_id, user_id, quantity, unit_price_paise,
    subtotal_paise, platform_fee_paise, commission_paise,
    convenience_fee_paise, organizer_payout_paise, total_paise,
    fee_payer, status, confirmed_at, buyer_name, buyer_phone, buyer_email,
    order_source
  ) values (
    p_event_id, v_tier_id, auth.uid(), 1, v_subtotal,
    v_subtotal, v_commission, v_commission,
    0, v_payout, v_subtotal,
    v_event.fee_payer, 'CONFIRMED', now(), p_buyer_name, p_buyer_phone, p_buyer_email,
    p_mode
  ) returning id into v_order_id;

  insert into public.tickets (
    order_id, event_id, tier_id, user_id, status, qr_hash,
    checked_in_at
  ) values (
    v_order_id, p_event_id, v_tier_id, auth.uid(), v_ticket_status::ticket_status, gen_random_uuid()::text,
    case when p_mode = 'WALKIN_INSTANT' then now() else null end
  ) returning id into v_ticket_id;

  update public.ticket_tiers set quantity_sold = quantity_sold + 1
    where id = v_tier_id;

  return jsonb_build_object(
    'orderId', v_order_id,
    'ticketId', v_ticket_id,
    'subtotalPaise', v_subtotal,
    'commissionPaise', v_commission,
    'payoutPaise', v_payout,
    'ticketStatus', v_ticket_status
  );
end;
$$;

create or replace function public.update_walkin_order(
  p_order_id     uuid,
  p_buyer_name   text    default null,
  p_buyer_phone  text    default null,
  p_buyer_email  text    default null,
  p_amount_paise integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event      public.events;
  v_order      public.orders;
  v_subtotal   integer;
  v_commission integer;
  v_payout     integer;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if v_order.order_source not in ('WALKIN_PREEVENT', 'WALKIN_QR', 'WALKIN_INSTANT') then
    raise exception 'Not a walk-in order';
  end if;

  select * into v_event from public.events where id = v_order.event_id;
  v_subtotal := coalesce(p_amount_paise, v_order.subtotal_paise);
  v_commission := case when v_event.commission_enabled
    then round(v_subtotal * v_event.commission_bps / 10000.0)
    else 0 end;
  v_payout := v_subtotal - v_commission;

  update public.orders set
    buyer_name = coalesce(p_buyer_name, buyer_name),
    buyer_phone = coalesce(p_buyer_phone, buyer_phone),
    buyer_email = coalesce(p_buyer_email, buyer_email),
    subtotal_paise = v_subtotal,
    unit_price_paise = v_subtotal,
    commission_paise = v_commission,
    platform_fee_paise = v_commission,
    organizer_payout_paise = v_payout,
    total_paise = v_subtotal
  where id = p_order_id;
end;
$$;

-- Events: trigram indexes for ilike search on title, venue_name
create extension if not exists pg_trgm;
create index if not exists events_title_trgm_idx on public.events using gin (title gin_trgm_ops);
create index if not exists events_venue_name_trgm_idx on public.events using gin (venue_name gin_trgm_ops);

-- Orders: filter by status alone (admin dashboard, pending orders)
create index if not exists orders_status_idx on public.orders (status);

-- Orders: filter by status + created_at (analytics, daily charts)
create index if not exists orders_status_created_at_idx on public.orders (status, created_at);

-- Orders: lookup by razorpay_order_id (webhook handler)
create index if not exists orders_razorpay_order_id_idx on public.orders (razorpay_order_id);

-- Orders: lookup by user_id (my orders, user analytics)
create index if not exists orders_user_id_idx on public.orders (user_id);

-- Profiles: admin lookup
create index if not exists profiles_is_admin_idx on public.profiles (is_admin);

-- Profiles: sort by created_at (admin user list, daily signups)
create index if not exists profiles_created_at_idx on public.profiles (created_at);

-- Hero boosts: lookup by razorpay_order_id (webhook)
create index if not exists hero_boosts_razorpay_order_id_idx on public.hero_boosts (razorpay_order_id);

-- Webhook events: lookup by processed flag (admin monitoring)
create index if not exists webhook_events_processed_idx on public.webhook_events (processed);

-- Refunds: lookup by razorpay_refund_id (webhook refund processing)
create index if not exists refunds_razorpay_refund_id_idx on public.refunds (razorpay_refund_id);

-- Refunds: lookup by order_id (refund total calculation)
create index if not exists refunds_order_id_idx on public.refunds (order_id);

-- Payment ledger: lookup by razorpay_payment_id (idempotency check)
create index if not exists payment_ledger_razorpay_payment_id_idx on public.payment_ledger (razorpay_payment_id);

-- ----------------------------------------------------------------
-- STEP 11: Add waitlist_enabled column to events
-- ----------------------------------------------------------------
alter table public.events add column if not exists waitlist_enabled boolean not null default true;

-- ----------------------------------------------------------------
-- STEP 12: Fix RLS policy � allow POSTPONED events to be public
-- Postponed events are still live, just with a new date. They should
-- appear on the home page with a "Postponed" tag, not be hidden.
-- ----------------------------------------------------------------
drop policy if exists "published events are public" on public.events;
create policy "published events are public" on public.events
  for select using (status in ('PUBLISHED', 'POSTPONED') or public.is_event_staff(id));

-- ----------------------------------------------------------------
-- STEP 13: Add REFUND_REQUESTED to order_status enum
-- ----------------------------------------------------------------
do $$ begin
  alter type order_status add value if not exists 'REFUND_REQUESTED';
exception when others then null; end $$;

-- ----------------------------------------------------------------
-- STEP 14: Create event_staff table for door staff access
-- ----------------------------------------------------------------
create table if not exists public.event_staff (
  id             uuid        primary key default gen_random_uuid(),
  event_id       uuid        not null references public.events(id) on delete cascade,
  organizer_id   uuid        not null references public.organizers(id) on delete cascade,
  email          text,
  phone          text,
  user_id        uuid        references auth.users(id) on delete set null,
  display_name   text        not null default '',
  created_at     timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create index if not exists event_staff_event_idx     on public.event_staff(event_id);
create index if not exists event_staff_org_idx       on public.event_staff(organizer_id);
create index if not exists event_staff_user_idx      on public.event_staff(user_id);
create index if not exists event_staff_email_idx     on public.event_staff(email);
create index if not exists event_staff_phone_idx     on public.event_staff(phone);

-- RLS for event_staff
alter table public.event_staff enable row level security;
drop policy if exists "organizers read own event staff" on public.event_staff;
create policy "organizers read own event staff" on public.event_staff
  for select using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );
drop policy if exists "organizers insert event staff" on public.event_staff;
create policy "organizers insert event staff" on public.event_staff
  for insert with check (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );
drop policy if exists "organizers delete own event staff" on public.event_staff;
create policy "organizers delete own event staff" on public.event_staff
  for delete using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );
drop policy if exists "staff read own assignments" on public.event_staff;
create policy "staff read own assignments" on public.event_staff
  for select using (user_id = auth.uid());
drop policy if exists "staff update own user_id" on public.event_staff;
create policy "staff update own user_id" on public.event_staff
  for update using (user_id = auth.uid() or user_id is null);
drop policy if exists "admin read all event staff" on public.event_staff;
create policy "admin read all event staff" on public.event_staff
  for select using (public.is_current_user_admin());
drop policy if exists "admin delete event staff" on public.event_staff;
create policy "admin delete event staff" on public.event_staff
  for delete using (public.is_current_user_admin());

-- ----------------------------------------------------------------
-- STEP 15: Update is_event_staff to check event_staff table
-- ----------------------------------------------------------------
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
  )
  or exists (
    select 1
    from public.event_staff es
    where es.event_id = p_event_id and es.user_id = auth.uid()
  )
  or public.is_current_user_admin();
$$;

-- Check if the current user is door staff for any organizer
create or replace function public.is_door_staff_any()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_staff es where es.user_id = auth.uid()
  ) or public.is_current_user_admin();
$$;

-- Get organizer IDs that the current user is door staff for (or owns)
create or replace function public.get_staff_organizer_ids()
returns table (organizer_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct es.organizer_id from public.event_staff es where es.user_id = auth.uid()
  union
  select o.id from public.organizers o where o.owner_id = auth.uid();
$$;

-- ----------------------------------------------------------------
-- STEP 16: request_postponement_refund RPC
-- ----------------------------------------------------------------
create or replace function public.request_postponement_refund(
  p_event_id uuid,
  p_user_id uuid
)
returns table (
  order_id uuid,
  total_paise integer,
  razorpay_payment_id text,
  refund_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_refund_id uuid;
begin
  if not exists (select 1 from public.events where id = p_event_id and status = 'POSTPONED') then
    raise exception 'Event is not postponed';
  end if;

  select id, total_paise, platform_fee_paise
    into v_order
    from public.orders
   where event_id = p_event_id and user_id = p_user_id and status = 'CONFIRMED'
   limit 1;

  if not found then
    raise exception 'No confirmed order found for this event';
  end if;

  update public.orders set status = 'REFUND_REQUESTED' where id = v_order.id;
  update public.tickets set status = 'CANCELLED' where order_id = v_order.id;

  insert into public.refunds (order_id, event_id, user_id, amount_paise, platform_fee_paise, status, reason, initiated_at, initiated_by)
  values (v_order.id, p_event_id, p_user_id, v_order.total_paise, v_order.platform_fee_paise, 'PENDING', 'Postponement refund requested by user', now(), p_user_id)
  returning id into v_refund_id;

  insert into public.event_notifications (event_id, user_id, type, message)
  values (p_event_id, p_user_id, 'REFUND_INITIATED', 'Your refund request for the postponed event has been submitted. You will receive your refund shortly.');

  return query
    select v_order.id, v_order.total_paise, o.razorpay_payment_id, true
    from public.orders o where o.id = v_order.id;
end;
$$;

-- Add event_staff to realtime publication
do $$ begin
  alter publication supabase_realtime add table public.event_staff;
exception when duplicate_object then null; when duplicate_table then null;
end $$;
