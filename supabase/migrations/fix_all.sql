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
do $$ begin
  -- Guarded: table is renamed to communities later in this bundle (STEP 45).
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relname='clubs' and c.relkind='r') then
    alter table public.clubs enable row level security;
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relname='club_members' and c.relkind='r') then
    alter table public.club_members enable row level security;
  end if;
end $$;
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
  for insert with check (auth.uid() = owner_id or public.is_current_user_admin());
create policy "organizers owner update" on public.organizers
  for update using (auth.uid() = owner_id or public.is_current_user_admin())
  with check (auth.uid() = owner_id or public.is_current_user_admin());
create policy "organizers owner delete" on public.organizers
  for delete using (auth.uid() = owner_id or public.is_current_user_admin());

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

-- ===== clubs ===== (guarded: renamed to communities in STEP 45)
do $$ begin
if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relname='clubs' and c.relkind='r') then
  return;
end if;
drop policy if exists "clubs are publicly readable" on public.clubs;
create policy "clubs are publicly readable" on public.clubs
  for select using (true);

drop policy if exists "organizers can insert clubs" on public.clubs;
create policy "organizers can insert clubs" on public.clubs
  for insert with check (
    exists (select 1 from public.organizers o where o.id = clubs.owner_id and o.owner_id = auth.uid())
  );

drop policy if exists "organizers can update own clubs" on public.clubs;
create policy "organizers can update own clubs" on public.clubs
  for update using (
    exists (select 1 from public.organizers o where o.id = clubs.owner_id and o.owner_id = auth.uid())
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
end $$;

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

drop policy if exists "users can clear own notifications" on public.event_notifications;
create policy "users can clear own notifications" on public.event_notifications
  for delete using (user_id = auth.uid());

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
     set registrations_count = registrations_count + v_order.quantity * greatest(1, coalesce(v_tier.admits, 1))
   where id = v_order.event_id;

  -- Clear the user's waitlist entry for this tier — they got the ticket.
  delete from public.waitlist
   where tier_id = v_order.tier_id and user_id = v_order.user_id;

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
    from generate_series(1, v_order.quantity * greatest(1, coalesce(v_tier.admits, 1))) g
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

  -- Reject is for unverified payments only — CONFIRMED orders carry real
  -- money and must go through the refund flow (not a bare status flip).
  if v_order.status <> 'PENDING_VERIFICATION' then
    raise exception 'Only orders awaiting payment verification can be rejected (status is %)', v_order.status;
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
        coalesce(o.buyer_name, p.full_name),
        v_ticket.checked_in_at
      from public.events       e
      join public.ticket_tiers t on t.id = v_ticket.tier_id
      left join public.orders   o on o.id = v_ticket.order_id
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
      coalesce(o.buyer_name, p.full_name),
      v_ticket.checked_in_at
    from public.events       e
    join public.ticket_tiers t on t.id = v_ticket.tier_id
    left join public.orders   o on o.id = v_ticket.order_id
    left join public.profiles p on p.id = v_ticket.user_id
    where e.id = v_ticket.event_id;
end;
$$;

-- PIN-based ticket check-in (for door scanner with PIN auth, no Supabase login)
create or replace function public.check_in_ticket_with_pin(
  p_qr_hash  text,
  p_event_id uuid,
  p_pin      text
)
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
  v_pin    public.scanner_pins;
begin
  select * into v_pin from public.scanner_pins sp
   where sp.event_id = p_event_id and sp.pin_code = p_pin and sp.is_active = true
   for update;
  if not found then
    raise exception 'Invalid or inactive scanner PIN';
  end if;
  update public.scanner_pins set last_used_at = now() where id = v_pin.id;

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

  if v_ticket.status <> 'VALID' then
    return query
      select
        case when v_ticket.status = 'USED' then 'ALREADY_USED' else 'INVALID' end,
        e.title,
        t.name,
        coalesce(o.buyer_name, p.full_name),
        v_ticket.checked_in_at
      from public.events       e
      join public.ticket_tiers t on t.id = v_ticket.tier_id
      left join public.orders   o on o.id = v_ticket.order_id
      left join public.profiles p on p.id = v_ticket.user_id
      where e.id = v_ticket.event_id;
    return;
  end if;

  update public.tickets
     set status        = 'USED',
         checked_in_at = now(),
         checked_in_by = null
   where id = v_ticket.id
  returning * into v_ticket;

  return query
    select
      'VALID'::text,
      e.title,
      t.name,
      coalesce(o.buyer_name, p.full_name),
      v_ticket.checked_in_at
    from public.events       e
    join public.ticket_tiers t on t.id = v_ticket.tier_id
    left join public.orders   o on o.id = v_ticket.order_id
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

-- KYC review workflow columns (idempotent)
alter table public.organizers
  add column if not exists kyc_status      text not null default 'NOT_SUBMITTED',
  add column if not exists kyc_reviewed_at timestamptz,
  add column if not exists kyc_review_note text;
-- Backfill kyc_status for existing organizers: if kyc_submitted=true, set to PENDING
update public.organizers set kyc_status = 'PENDING' where kyc_submitted = true and kyc_status = 'NOT_SUBMITTED';
-- Make event_id nullable on event_notifications (KYC notifications have no event)
alter table public.event_notifications alter column event_id drop not null;

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
do $$ begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relname='club_members' and c.relkind='r') then
    create unique index if not exists club_members_club_user_unique
      on public.club_members(club_id, user_id);
  end if;
end $$;

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
alter table public.organizers add column if not exists organizer_intent text;
alter table public.organizers add column if not exists pan_document_url text;

update public.organizers
set organizer_intent = substr(description, strpos(description, E'\n\n') + 2),
    description = nullif(substr(description, 1, strpos(description, E'\n\n') - 1), '')
where organizer_intent is null
  and strpos(coalesce(description, ''), E'\n\n') > 0;
alter table public.organizers add column if not exists bank_document_url text;
alter table public.organizers add column if not exists kyc_response_note text;
alter table public.organizers add column if not exists kyc_response_document_url text;

-- Pending KYC/payout changes for APPROVED organizers — sensitive edits are
-- staged here (jsonb keyed by column name) and only applied to the real
-- columns when an admin approves. Never exposed via organizers_public.
alter table public.organizers add column if not exists pending_kyc jsonb;

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
  v_tier public.ticket_tiers;
begin
  -- Lock the tier row and only offer when a seat is actually free —
  -- serializes against concurrent bookings; prevents phantom offers.
  select * into v_tier from public.ticket_tiers where id = p_tier_id for update;
  if not found then return null; end if;
  if v_tier.quantity - v_tier.quantity_sold - coalesce(v_tier.quantity_reserved, 0) <= 0 then
    return null;
  end if;

  select * into v_next
    from public.waitlist
   where tier_id = p_tier_id and status = 'WAITING'
   order by position asc, created_at asc
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
alter type event_category add value if not exists 'TECHNO_RAVE';
alter type event_category add value if not exists 'CAR_BIKE_MEET';
alter type event_category add value if not exists 'GAMING';
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
     set registrations_count = registrations_count + v_order.quantity * greatest(1, coalesce(v_tier.admits, 1))
   where id = v_order.event_id;
  -- Clear the user's waitlist entry for this tier — they got the ticket.
  delete from public.waitlist
   where tier_id = v_order.tier_id and user_id = v_order.user_id;
  return query
    insert into public.tickets (order_id, event_id, tier_id, user_id, qr_hash)
    select
      v_order.id, v_order.event_id, v_order.tier_id, v_order.user_id,
      encode(sha256((v_order.id::text || ':' || g::text || ':' || gen_random_uuid()::text)::bytea), 'hex')
    from generate_series(1, v_order.quantity * greatest(1, coalesce(v_tier.admits, 1))) g
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

-- Add allow_booking_during_event toggle (default false — booking closes at event start)
alter table public.events add column if not exists allow_booking_during_event boolean not null default false;

-- Add is_box_office column to orders (walk-in/box office orders are hidden from My Tickets)
alter table public.orders add column if not exists is_box_office boolean not null default false;

-- Add idempotency_key column to orders (prevents duplicate box-office orders from double-clicks/retries)
alter table public.orders add column if not exists idempotency_key text;
create unique index if not exists orders_idempotency_idx on public.orders(idempotency_key) where idempotency_key is not null;

create or replace function public.create_walkin_order(
  p_event_id    uuid,
  p_buyer_name  text,
  p_buyer_phone text,
  p_tier_id     uuid    default null,
  p_buyer_email text    default null,
  p_amount_paise integer default 0,
  p_mode        text    default 'WALKIN_PREEVENT',
  p_idempotency_key text default null
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
  v_existing      public.orders;
begin
  -- Idempotency: if an order with this key already exists, return it
  if p_idempotency_key is not null then
    select * into v_existing from public.orders
      where idempotency_key = p_idempotency_key limit 1;
    if v_existing.id is not null then
      select id into v_ticket_id from public.tickets where order_id = v_existing.id limit 1;
      return jsonb_build_object(
        'orderId', v_existing.id,
        'ticketId', v_ticket_id,
        'subtotalPaise', v_existing.subtotal_paise,
        'commissionPaise', v_existing.commission_paise,
        'payoutPaise', v_existing.organizer_payout_paise,
        'ticketStatus', case when v_existing.order_source = 'WALKIN_INSTANT' then 'USED' else 'VALID' end
      );
    end if;
  end if;

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
    order_source, is_box_office, idempotency_key
  ) values (
    p_event_id, v_tier_id, null, 1, v_subtotal,
    v_subtotal, v_commission, v_commission,
    0, v_payout, v_subtotal,
    v_event.fee_payer, 'CONFIRMED', now(), p_buyer_name, p_buyer_phone, p_buyer_email,
    p_mode, true, p_idempotency_key
  ) returning id into v_order_id;

  insert into public.tickets (
    order_id, event_id, tier_id, user_id, status, qr_hash,
    checked_in_at
  ) values (
    v_order_id, p_event_id, v_tier_id, null, v_ticket_status::ticket_status, gen_random_uuid()::text,
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
-- pgcrypto provides digest() — required by verify_scanner_pin / verify_box_office_pin
create extension if not exists pgcrypto;
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
drop function if exists public.request_postponement_refund(uuid, uuid);
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

-- ----------------------------------------------------------------
-- STEP 17: Scanner PINs + Box Office PINs (door scanner auth)
-- ----------------------------------------------------------------

-- Scanner PINs table
create table if not exists public.scanner_pins (
  id           uuid        primary key default gen_random_uuid(),
  event_id     uuid        not null references public.events(id) on delete cascade,
  organizer_id uuid        not null references public.organizers(id) on delete cascade,
  pin_code     text        not null,
  pin_hash     text,
  staff_name   text        not null,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  unique(event_id, pin_code)
);
create index if not exists scanner_pins_event_idx on public.scanner_pins(event_id);
create index if not exists scanner_pins_org_idx   on public.scanner_pins(organizer_id);

-- Box Office PINs table
create table if not exists public.box_office_pins (
  id           uuid        primary key default gen_random_uuid(),
  event_id     uuid        not null references public.events(id) on delete cascade,
  organizer_id uuid        references public.organizers(id) on delete cascade,
  pin_code     text        not null,
  pin_hash     text,
  staff_name   text        not null,
  role         text        not null default 'ORGANIZER' check (role in ('ORGANIZER','ADMIN')),
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  unique(event_id, pin_code)
);
create index if not exists box_office_pins_event_idx on public.box_office_pins(event_id);
create index if not exists box_office_pins_org_idx   on public.box_office_pins(organizer_id);

-- Add pin_hash columns (idempotent) and backfill hashes for existing PINs
alter table public.scanner_pins add column if not exists pin_hash text;
alter table public.box_office_pins add column if not exists pin_hash text;
-- Add staff contact columns to scanner_pins (idempotent)
alter table public.scanner_pins add column if not exists staff_email text;
alter table public.scanner_pins add column if not exists staff_phone text;
-- Backfill pin_hash for existing rows using SHA-256 of (event_id || ':' || pin_code)
update public.scanner_pins set pin_hash = encode(digest(event_id::text || ':' || pin_code, 'sha256'), 'hex') where pin_hash is null;
update public.box_office_pins set pin_hash = encode(digest(event_id::text || ':' || pin_code, 'sha256'), 'hex') where pin_hash is null;
-- Make pin_hash NOT NULL after backfill (only if all rows have hashes)
do $$
begin
  if not exists (select 1 from public.scanner_pins where pin_hash is null) then
    alter table public.scanner_pins alter column pin_hash set not null;
  end if;
  if not exists (select 1 from public.box_office_pins where pin_hash is null) then
    alter table public.box_office_pins alter column pin_hash set not null;
  end if;
end;
$$;
-- Replace unique(event_id, pin_code) with unique(event_id, pin_hash)
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'scanner_pins_event_id_pin_code_key') then
    alter table public.scanner_pins drop constraint scanner_pins_event_id_pin_code_key;
  end if;
  if exists (select 1 from pg_constraint where conname = 'box_office_pins_event_id_pin_code_key') then
    alter table public.box_office_pins drop constraint box_office_pins_event_id_pin_code_key;
  end if;
end;
$$;
create unique index if not exists scanner_pins_event_pin_hash_idx on public.scanner_pins(event_id, pin_hash);
create unique index if not exists box_office_pins_event_pin_hash_idx on public.box_office_pins(event_id, pin_hash);

-- RLS for scanner_pins
alter table public.scanner_pins enable row level security;
drop policy if exists "organizers read own scanner pins" on public.scanner_pins;
create policy "organizers read own scanner pins" on public.scanner_pins
  for select using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );
drop policy if exists "organizers insert scanner pins" on public.scanner_pins;
create policy "organizers insert scanner pins" on public.scanner_pins
  for insert with check (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );
drop policy if exists "organizers update scanner pins" on public.scanner_pins;
create policy "organizers update scanner pins" on public.scanner_pins
  for update using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );
drop policy if exists "organizers delete scanner pins" on public.scanner_pins;
create policy "organizers delete scanner pins" on public.scanner_pins
  for delete using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );
drop policy if exists "admin read all scanner pins" on public.scanner_pins;
create policy "admin read all scanner pins" on public.scanner_pins
  for select using (public.is_current_user_admin());
drop policy if exists "admin delete scanner pins" on public.scanner_pins;
create policy "admin delete scanner pins" on public.scanner_pins
  for delete using (public.is_current_user_admin());

-- RLS for box_office_pins
alter table public.box_office_pins enable row level security;
drop policy if exists "organizers read own box office pins" on public.box_office_pins;
create policy "organizers read own box office pins" on public.box_office_pins
  for select using (
    organizer_id is not null and exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );
drop policy if exists "organizers insert box office pins" on public.box_office_pins;
create policy "organizers insert box office pins" on public.box_office_pins
  for insert with check (
    organizer_id is not null and exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );
drop policy if exists "organizers update box office pins" on public.box_office_pins;
create policy "organizers update box office pins" on public.box_office_pins
  for update using (
    organizer_id is not null and exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );
drop policy if exists "organizers delete box office pins" on public.box_office_pins;
create policy "organizers delete box office pins" on public.box_office_pins
  for delete using (
    organizer_id is not null and exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );
drop policy if exists "admin read all box office pins" on public.box_office_pins;
create policy "admin read all box office pins" on public.box_office_pins
  for select using (public.is_current_user_admin());
drop policy if exists "admin insert box office pins" on public.box_office_pins;
create policy "admin insert box office pins" on public.box_office_pins
  for insert with check (public.is_current_user_admin());
drop policy if exists "admin delete box office pins" on public.box_office_pins;
create policy "admin delete box office pins" on public.box_office_pins
  for delete using (public.is_current_user_admin());

-- Scanner PIN verification RPC (no Supabase auth required)
create or replace function public.verify_scanner_pin(p_event_id uuid, p_pin text)
returns table (
  event_id        uuid,
  event_title     text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  status          text,
  organizer_name  text,
  valid_count     bigint,
  checked_in_count bigint,
  staff_name      text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin public.scanner_pins;
  v_hash text;
begin
  v_hash := encode(digest(p_event_id::text || ':' || p_pin, 'sha256'), 'hex');
  select * into v_pin from public.scanner_pins sp
   where sp.event_id = p_event_id and sp.pin_hash = v_hash and sp.is_active = true
   for update;
  if not found then
    return query select null::uuid, null::text, null::timestamptz, null::timestamptz, null::text, null::text, null::bigint, null::bigint, null::text;
    return;
  end if;
  update public.scanner_pins set last_used_at = now() where id = v_pin.id;
  return query
    select
      e.id, e.title, e.starts_at, e.ends_at, e.status::text,
      o.name,
      (select count(*) from public.tickets t where t.event_id = e.id and t.status = 'VALID'),
      (select count(*) from public.tickets t where t.event_id = e.id and t.status = 'USED'),
      v_pin.staff_name
    from public.events e
    join public.organizers o on o.id = e.organizer_id
    where e.id = p_event_id;
end;
$$;

-- Bulk generate scanner PINs
-- Drop old 2-param version first to avoid ambiguity (idempotent)
drop function if exists public.generate_scanner_pins(uuid, text[]);
create or replace function public.generate_scanner_pins(
  p_event_id     uuid,
  p_staff_names  text[],
  p_staff_emails text[] default '{}',
  p_staff_phones text[] default '{}'
)
returns table (pin_code text, staff_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_organizer_id uuid;
  v_name text;
  v_email text;
  v_phone text;
  v_pin text;
  v_hash text;
  v_idx integer := 0;
begin
  select organizer_id into v_organizer_id from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if not public.is_current_user_admin() and not exists (
    select 1 from public.organizers where id = v_organizer_id and owner_id = auth.uid()
  ) then
    raise exception 'Not authorised to manage scanner PINs for this event';
  end if;
  foreach v_name in array p_staff_names loop
    v_idx := v_idx + 1;
    v_email := coalesce(p_staff_emails[v_idx], '');
    v_phone := coalesce(p_staff_phones[v_idx], '');
    loop
      v_pin := lpad((floor(random() * 1000000))::text, 6, '0');
      v_hash := encode(digest(p_event_id::text || ':' || v_pin, 'sha256'), 'hex');
      exit when not exists (
        select 1 from public.scanner_pins sp where sp.event_id = p_event_id and sp.pin_hash = v_hash
      );
    end loop;
    insert into public.scanner_pins (event_id, organizer_id, pin_code, pin_hash, staff_name, staff_email, staff_phone)
    values (p_event_id, v_organizer_id, v_pin, v_hash, v_name, nullif(v_email, ''), nullif(v_phone, ''));
    return query select v_pin, v_name;
  end loop;
end;
$$;

-- Revoke a scanner PIN
create or replace function public.revoke_scanner_pin(p_pin_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin public.scanner_pins;
begin
  select * into v_pin from public.scanner_pins where id = p_pin_id;
  if not found then return false; end if;
  if not public.is_current_user_admin() and not exists (
    select 1 from public.organizers o where o.id = v_pin.organizer_id and o.owner_id = auth.uid()
  ) then
    raise exception 'Not authorised to revoke this PIN';
  end if;
  update public.scanner_pins set is_active = false where id = p_pin_id;
  return true;
end;
$$;

-- Box Office PIN verification RPC
create or replace function public.verify_box_office_pin(p_event_id uuid, p_pin text)
returns table (
  event_id        uuid,
  event_title     text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  status          text,
  organizer_name  text,
  staff_name      text,
  role            text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin public.box_office_pins;
  v_hash text;
begin
  v_hash := encode(digest(p_event_id::text || ':' || p_pin, 'sha256'), 'hex');
  select * into v_pin from public.box_office_pins bp
   where bp.event_id = p_event_id and bp.pin_hash = v_hash and bp.is_active = true
   for update;
  if not found then
    return query select null::uuid, null::text, null::timestamptz, null::timestamptz, null::text, null::text, null::text, null::text;
    return;
  end if;
  update public.box_office_pins set last_used_at = now() where id = v_pin.id;
  return query
    select
      e.id, e.title, e.starts_at, e.ends_at, e.status::text,
      o.name,
      v_pin.staff_name,
      v_pin.role
    from public.events e
    left join public.organizers o on o.id = e.organizer_id
    where e.id = p_event_id;
end;
$$;

-- Bulk generate box office PINs
create or replace function public.generate_box_office_pins(
  p_event_id    uuid,
  p_staff_names text[],
  p_role        text default 'ORGANIZER'
)
returns table (pin_code text, staff_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_organizer_id uuid;
  v_name text;
  v_pin text;
  v_hash text;
begin
  select organizer_id into v_organizer_id from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if p_role = 'ADMIN' then
    if not public.is_current_user_admin() then
      raise exception 'Not authorised to create admin box office PINs';
    end if;
  else
    if not public.is_current_user_admin() and not exists (
      select 1 from public.organizers where id = v_organizer_id and owner_id = auth.uid()
    ) then
      raise exception 'Not authorised to manage box office PINs for this event';
    end if;
  end if;
  foreach v_name in array p_staff_names loop
    loop
      v_pin := lpad((floor(random() * 1000000))::text, 6, '0');
      v_hash := encode(digest(p_event_id::text || ':' || v_pin, 'sha256'), 'hex');
      exit when not exists (
        select 1 from public.box_office_pins bp where bp.event_id = p_event_id and bp.pin_hash = v_hash
      );
    end loop;
    insert into public.box_office_pins (event_id, organizer_id, pin_code, pin_hash, staff_name, role)
    values (p_event_id, v_organizer_id, v_pin, v_hash, v_name, p_role);
    return query select v_pin, v_name;
  end loop;
end;
$$;

-- Revoke a box office PIN
create or replace function public.revoke_box_office_pin(p_pin_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin public.box_office_pins;
begin
  select * into v_pin from public.box_office_pins where id = p_pin_id;
  if not found then return false; end if;
  if not public.is_current_user_admin() and not exists (
    select 1 from public.organizers o where o.id = v_pin.organizer_id and o.owner_id = auth.uid()
  ) then
    raise exception 'Not authorised to revoke this PIN';
  end if;
  update public.box_office_pins set is_active = false where id = p_pin_id;
  return true;
end;
$$;

-- Add new tables to realtime publication
do $$ begin
  alter publication supabase_realtime add table public.scanner_pins;
exception when duplicate_object then null; when duplicate_table then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.box_office_pins;
exception when duplicate_object then null; when duplicate_table then null;
end $$;

-- ================================================================
-- Backups bucket (private � only service-role can access)
-- ================================================================
-- Stores automated database backups (gzip JSON) from the backup cron.
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

drop policy if exists "service read on backups" on storage.objects;
create policy "service read on backups"
  on storage.objects for select
  using (bucket_id = 'backups' and auth.role() = 'service_role');

drop policy if exists "service write on backups" on storage.objects;
create policy "service write on backups"
  on storage.objects for insert
  with check (bucket_id = 'backups' and auth.role() = 'service_role');

drop policy if exists "service delete on backups" on storage.objects;
create policy "service delete on backups"
  on storage.objects for delete
  using (bucket_id = 'backups' and auth.role() = 'service_role');

-- ================================================================
-- Event Reviews (checked-in attendees only)
-- ================================================================
create table if not exists public.event_reviews (
  id            uuid        primary key default gen_random_uuid(),
  event_id      uuid        not null references public.events(id) on delete cascade,
  organizer_id  uuid        not null references public.organizers(id) on delete cascade,
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  rating        smallint    not null check (rating between 1 and 5),
  review_text   text,
  created_at    timestamptz not null default now(),
  unique(event_id, user_id)
);
create index if not exists event_reviews_organizer_idx on public.event_reviews(organizer_id);
create index if not exists event_reviews_event_idx on public.event_reviews(event_id);
create index if not exists event_reviews_user_idx on public.event_reviews(user_id);

alter table public.event_reviews enable row level security;

drop policy if exists "public read on event_reviews" on public.event_reviews;
create policy "public read on event_reviews"
  on public.event_reviews for select
  using (true);

drop policy if exists "checked_in users can review" on public.event_reviews;
create policy "checked_in users can review"
  on public.event_reviews for insert
  with check (
    exists (
      select 1 from public.tickets t
      join public.orders o on o.id = t.order_id
      where t.event_id = event_reviews.event_id
        and o.user_id = auth.uid()
        and t.status = 'USED'
    )
    and not exists (
      select 1 from public.event_reviews er
      where er.event_id = event_reviews.event_id
        and er.user_id = auth.uid()
    )
  );

drop policy if exists "users delete own reviews" on public.event_reviews;
create policy "users delete own reviews"
  on public.event_reviews for delete
  using (user_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.event_reviews;
exception when duplicate_object then null; when duplicate_table then null;
end $$;

-- ================================================================
-- Linked Past Events (organizer links their own past events as previous editions)
-- ================================================================
alter table public.events add column if not exists linked_past_event_ids uuid[] not null default '{}';

-- Admins can delete any review (moderation)
drop policy if exists "admins delete any review" on public.event_reviews;
create policy "admins delete any review"
  on public.event_reviews for delete
  using (public.is_current_user_admin());

-- ================================================================
-- New notification types
-- ================================================================
do $$ begin
  alter type public.event_notification_type add value if not exists 'EVENT_UPDATE';
exception when others then null; end $$;
do $$ begin
  alter type public.event_notification_type add value if not exists 'EVENT_REMINDER';
exception when others then null; end $$;
do $$ begin
  alter type public.event_notification_type add value if not exists 'TICKETS_AVAILABLE';
exception when others then null; end $$;
do $$ begin
  alter type public.event_notification_type add value if not exists 'COLLAB_INVITE';
exception when others then null; end $$;
do $$ begin
  alter type public.event_notification_type add value if not exists 'COLLAB_ACCEPTED';
exception when others then null; end $$;
do $$ begin
  alter type public.event_notification_type add value if not exists 'KYC_APPROVED';
exception when others then null; end $$;
do $$ begin
  alter type public.event_notification_type add value if not exists 'KYC_REJECTED';
exception when others then null; end $$;
do $$ begin
  alter type public.event_notification_type add value if not exists 'KYC_CLARIFICATION';
exception when others then null; end $$;

-- ================================================================
-- Event Subscriptions ("Update Me" per-event)
-- ================================================================
create table if not exists public.event_subscriptions (
  id          uuid        primary key default gen_random_uuid(),
  event_id    uuid        not null references public.events(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists event_sub_user_idx  on public.event_subscriptions(user_id);
create index if not exists event_sub_event_idx on public.event_subscriptions(event_id);

alter table public.event_subscriptions enable row level security;

drop policy if exists "users read own subscriptions" on public.event_subscriptions;
create policy "users read own subscriptions" on public.event_subscriptions
  for select using (user_id = auth.uid());

drop policy if exists "users can subscribe" on public.event_subscriptions;
create policy "users can subscribe" on public.event_subscriptions
  for insert with check (user_id = auth.uid());

drop policy if exists "users can unsubscribe" on public.event_subscriptions;
create policy "users can unsubscribe" on public.event_subscriptions
  for delete using (user_id = auth.uid());

drop policy if exists "organizers read event subscriptions" on public.event_subscriptions;
create policy "organizers read event subscriptions" on public.event_subscriptions
  for select using (
    exists (
      select 1 from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = event_subscriptions.event_id and o.owner_id = auth.uid()
    )
  );

do $$ begin
  alter publication supabase_realtime add table public.event_subscriptions;
exception when duplicate_object then null; when duplicate_table then null;
end $$;

-- ================================================================
-- Organizer Follows (follow/unfollow, public follower count)
-- ================================================================
create table if not exists public.organizer_follows (
  id            uuid        primary key default gen_random_uuid(),
  organizer_id  uuid        not null references public.organizers(id) on delete cascade,
  follower_id   uuid        not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (organizer_id, follower_id)
);
create index if not exists org_follow_organizer_idx on public.organizer_follows(organizer_id);
create index if not exists org_follow_follower_idx  on public.organizer_follows(follower_id);

alter table public.organizer_follows enable row level security;

drop policy if exists "public read follows" on public.organizer_follows;
create policy "public read follows" on public.organizer_follows
  for select using (true);

drop policy if exists "users can follow" on public.organizer_follows;
create policy "users can follow" on public.organizer_follows
  for insert with check (follower_id = auth.uid());

drop policy if exists "users can unfollow" on public.organizer_follows;
create policy "users can unfollow" on public.organizer_follows
  for delete using (follower_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.organizer_follows;
exception when duplicate_object then null; when duplicate_table then null;
end $$;

-- KYC realtime — admins + organizers get live status/thread updates
do $$ begin
  alter publication supabase_realtime add table public.organizers;
exception when duplicate_object then null; when duplicate_table then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.kyc_messages;
exception when duplicate_object then null; when duplicate_table then null;
end $$;

-- ================================================================
-- Event Collaborators (co-hosting)
-- ================================================================
create table if not exists public.event_collaborators (
  id               uuid        primary key default gen_random_uuid(),
  event_id         uuid        not null references public.events(id) on delete cascade,
  organizer_id     uuid        not null references public.organizers(id) on delete cascade,
  invited_by       uuid        not null references public.organizers(id) on delete cascade,
  status           text        not null default 'PENDING',
  permission_level text        not null default 'VIEW_ONLY',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (event_id, organizer_id)
);
-- Add permission_level column to existing tables (idempotent)
alter table public.event_collaborators add column if not exists permission_level text not null default 'VIEW_ONLY';
create index if not exists event_collab_event_idx    on public.event_collaborators(event_id);
create index if not exists event_collab_org_idx      on public.event_collaborators(organizer_id);
create index if not exists event_collab_invited_idx  on public.event_collaborators(invited_by);

alter table public.event_collaborators enable row level security;

drop policy if exists "public read accepted collaborators" on public.event_collaborators;
create policy "public read accepted collaborators" on public.event_collaborators
  for select using (status = 'ACCEPTED');

drop policy if exists "organizers read own collaborations" on public.event_collaborators;
create policy "organizers read own collaborations" on public.event_collaborators
  for select using (
    exists (select 1 from public.organizers o
            where (o.id = event_collaborators.organizer_id or o.id = event_collaborators.invited_by)
            and o.owner_id = auth.uid())
  );

drop policy if exists "organizers can invite collaborators" on public.event_collaborators;
create policy "organizers can invite collaborators" on public.event_collaborators
  for insert with check (
    exists (
      select 1 from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = event_collaborators.event_id
        and o.owner_id = auth.uid()
        and event_collaborators.invited_by = e.organizer_id
    )
  );

drop policy if exists "organizers update own collaboration" on public.event_collaborators;
create policy "organizers update own collaboration" on public.event_collaborators
  for update using (
    exists (select 1 from public.organizers o
            where o.id = event_collaborators.organizer_id and o.owner_id = auth.uid())
  );

drop policy if exists "organizers delete collaborations" on public.event_collaborators;
create policy "organizers delete collaborations" on public.event_collaborators
  for delete using (
    exists (
      select 1 from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = event_collaborators.event_id and o.owner_id = auth.uid()
    )
    or exists (select 1 from public.organizers o
               where o.id = event_collaborators.organizer_id and o.owner_id = auth.uid())
  );

do $$ begin
  alter publication supabase_realtime add table public.event_collaborators;
exception when duplicate_object then null; when duplicate_table then null;
end $$;

-- Event teaser video (optional short clip, autoplayed muted on the discovery card).
alter table public.events add column if not exists teaser_video_url text;

-- ---------------------------------------------------------------------------
-- Waitlist FIFO tightening
--  - offer_waitlist_next: created_at tiebreaker for legacy duplicate positions
--  - join_waitlist: atomic position = max(position)+1 under the tier row lock
--  - requeue_waitlist_entry: expired offers go to the true end of the queue
-- ---------------------------------------------------------------------------

create or replace function public.offer_waitlist_next(p_tier_id uuid)
returns public.waitlist
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next public.waitlist;
  v_tier public.ticket_tiers;
begin
  -- Lock the tier row and only offer when a seat is actually free —
  -- serializes against concurrent bookings; prevents phantom offers.
  select * into v_tier from public.ticket_tiers where id = p_tier_id for update;
  if not found then return null; end if;
  if v_tier.quantity - v_tier.quantity_sold - coalesce(v_tier.quantity_reserved, 0) <= 0 then
    return null;
  end if;

  select * into v_next
    from public.waitlist
   where tier_id = p_tier_id and status = 'WAITING'
   order by position asc, created_at asc
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

create or replace function public.join_waitlist(p_event_id uuid, p_tier_id uuid)
returns public.waitlist
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.waitlist;
begin
  select * into v_entry
    from public.waitlist
   where tier_id = p_tier_id and user_id = auth.uid();
  if found then return v_entry; end if;

  perform 1 from public.ticket_tiers where id = p_tier_id for update;

  insert into public.waitlist (event_id, tier_id, user_id, position)
  values (
    p_event_id, p_tier_id, auth.uid(),
    (select coalesce(max(position), 0) + 1 from public.waitlist where tier_id = p_tier_id)
  )
  on conflict (tier_id, user_id) do nothing
  returning * into v_entry;

  if not found then
    select * into v_entry
      from public.waitlist
     where tier_id = p_tier_id and user_id = auth.uid();
  end if;

  return v_entry;
end;
$$;

create or replace function public.requeue_waitlist_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier uuid;
begin
  select tier_id into v_tier from public.waitlist where id = p_entry_id for update;
  if not found then return; end if;

  perform 1 from public.ticket_tiers where id = v_tier for update;

  update public.waitlist
     set status     = 'WAITING',
         offered_at = null,
         expires_at = null,
         position   = (select coalesce(max(position), 0) + 1
                         from public.waitlist
                        where tier_id = v_tier)
   where id = p_entry_id and status = 'OFFERED';
end;
$$;

-- Clear a waitlisted user's entry when their order confirms (avoids re-offer spam).
-- Applied to free + paid confirm paths.

create or replace function public.create_free_order(
  p_event_id uuid,
  p_tier_id  uuid,
  p_quantity integer,
  p_buyer_name   text default null,
  p_buyer_phone  text default null,
  p_buyer_email  text default null,
  p_buyer_gender text default null
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
begin
  select * into v_tier from public.ticket_tiers where id = p_tier_id for update;
  if not found then
    raise exception 'Ticket tier not found';
  end if;
  if v_tier.price_paise <> 0 then
    raise exception 'This function is for free tickets only';
  end if;
  if v_tier.quantity - v_tier.quantity_sold < p_quantity then
    raise exception 'Not enough tickets left';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found';
  end if;

  insert into public.orders (
    event_id, tier_id, user_id, quantity,
    unit_price_paise, subtotal_paise, platform_fee_paise, total_paise,
    fee_payer, status, buyer_name, buyer_phone, buyer_email, buyer_gender
  ) values (
    p_event_id, p_tier_id, auth.uid(), p_quantity,
    0, 0, 0, 0,
    coalesce(v_event.fee_payer, 'BUYER')::fee_payer, 'CONFIRMED', p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender
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
  from generate_series(1, p_quantity * greatest(1, coalesce(v_tier.admits, 1))) g;

  update public.ticket_tiers
     set quantity_sold = quantity_sold + p_quantity
   where id = p_tier_id;

  update public.events
     set registrations_count = registrations_count + p_quantity * greatest(1, coalesce(v_tier.admits, 1))
   where id = p_event_id;

  -- Clear the user's waitlist entry for this tier — they got the ticket.
  delete from public.waitlist
   where tier_id = p_tier_id and user_id = auth.uid();

  return v_order;
end;
$$;

-- ================================================================
-- STEP 21: Security hardening sweep (QA audit fixes, 2026-09-22)
-- Fixes: RPC lockdown (free-ticket mints), privileged-column writes
-- (self-admin / self-KYC / fee evasion), staff self-claim, collaborator
-- escalation, refund races, missing inventory release, ledger gaps.
-- ================================================================

-- ---- 1. Missing columns (schema drift — code references them; never migrated)
do $$ begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relname='clubs' and c.relkind='r') then
    alter table public.clubs add column if not exists cover_url text;
  end if;
end $$;
alter table public.organizers add column if not exists rejection_count integer not null default 0;

-- ---- 2. is_event_manager(): event owner OR admin OR ACCEPTED FULL collaborator.
-- is_event_staff() stays for scan/read surfaces; write surfaces upgrade to this.
create or replace function public.is_event_manager(p_event_id uuid)
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
  or public.is_current_user_admin()
  or exists (
    select 1
    from public.event_collaborators c
    join public.organizers o2 on o2.id = c.organizer_id
    where c.event_id = p_event_id
      and c.status = 'ACCEPTED'
      and c.permission_level = 'FULL'
      and o2.owner_id = auth.uid()
  );
$$;

-- ---- 3. Privileged-RPC lockdown ------------------------------------------------
-- These mint/confirm/refund or mutate money-critical state. They are invoked
-- only by server code AFTER its own verification (Razorpay signature, PIN,
-- CRON_SECRET, admin check) and now run under the service role only.
revoke execute on function public.confirm_razorpay_order(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.fail_razorpay_order(uuid) from public, anon, authenticated;
revoke execute on function public.create_walkin_order(uuid, text, text, uuid, text, integer, text, text) from public, anon, authenticated;
revoke execute on function public.update_walkin_order(uuid, text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.expire_reserved_orders() from public, anon, authenticated;
revoke execute on function public.set_razorpay_order_id(uuid, text) from public, anon, authenticated;
revoke execute on function public.requeue_waitlist_entry(uuid) from public, anon, authenticated;
revoke execute on function public.offer_waitlist_next(uuid) from public, anon;
do $$ begin
  if to_regprocedure('public.increment_club_member_count(uuid)') is not null then
    execute 'revoke execute on function public.increment_club_member_count(uuid) from public, anon';
  end if;
end $$;

grant execute on function public.confirm_razorpay_order(uuid, text, text, text) to service_role;
grant execute on function public.fail_razorpay_order(uuid) to service_role;
grant execute on function public.create_walkin_order(uuid, text, text, uuid, text, integer, text, text) to service_role;
grant execute on function public.update_walkin_order(uuid, text, text, text, integer) to service_role;
grant execute on function public.update_walkin_order(uuid, text, text, text, integer) to service_role;
grant execute on function public.expire_reserved_orders() to service_role;
grant execute on function public.set_razorpay_order_id(uuid, text) to service_role;
grant execute on function public.requeue_waitlist_entry(uuid) to service_role;
grant execute on function public.offer_waitlist_next(uuid) to authenticated, service_role;
do $$ begin
  if to_regprocedure('public.increment_club_member_count(uuid)') is not null then
    execute 'grant execute on function public.increment_club_member_count(uuid) to authenticated, service_role';
  end if;
end $$;

-- ---- 4. event_staff self-claim hardening ---------------------------------------
-- The claim path may only fill user_id on an unresolved row; identity columns
-- are pinned by trigger so a claimer can't retarget the row onto other events.
create or replace function public.event_staff_pin_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.role() <> 'service_role' then
    new.event_id := old.event_id;
    new.organizer_id := old.organizer_id;
    if old.user_id is not null and new.user_id is distinct from old.user_id then
      raise exception 'Staff assignment cannot be transferred';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists event_staff_pin_columns_trg on public.event_staff;
create trigger event_staff_pin_columns_trg
  before update on public.event_staff
  for each row execute function public.event_staff_pin_columns();

drop policy if exists "staff update own user_id" on public.event_staff;
create policy "staff update own user_id" on public.event_staff
  for update using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid());

-- ---- 5. event_collaborators: invitee may only change status --------------------
create or replace function public.event_collaborators_pin_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.role() <> 'service_role' then
    new.event_id := old.event_id;
    new.organizer_id := old.organizer_id;
    new.invited_by := old.invited_by;
    if not public.is_current_user_admin() then
      new.permission_level := old.permission_level;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists event_collaborators_pin_columns_trg on public.event_collaborators;
create trigger event_collaborators_pin_columns_trg
  before update on public.event_collaborators
  for each row execute function public.event_collaborators_pin_columns();

-- Event owner can also update the collaborator row (e.g. permission_level)
drop policy if exists "event owner updates collaborators" on public.event_collaborators;
create policy "event owner updates collaborators" on public.event_collaborators
  for update using (
    exists (
      select 1 from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = event_collaborators.event_id and o.owner_id = auth.uid()
    )
  );

-- ---- 6. event_reviews: pin user_id to the caller --------------------------------
drop policy if exists "checked_in users can review" on public.event_reviews;
create policy "checked_in users can review"
  on public.event_reviews for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.tickets t
      join public.orders o on o.id = t.order_id
      where t.event_id = event_reviews.event_id
        and o.user_id = auth.uid()
        and t.status = 'USED'
    )
    and not exists (
      select 1 from public.event_reviews er
      where er.event_id = event_reviews.event_id
        and er.user_id = auth.uid()
    )
  );

-- ---- 7. orders: creation happens only via RPCs (they run as definer) ------------
drop policy if exists "buyers create their own orders" on public.orders;

-- Tighten organizer-side writes to managers (door staff no longer get order/tier/ticket writes)
drop policy if exists "organizer updates orders" on public.orders;
create policy "organizer updates orders" on public.orders
  for update using (public.is_event_manager(event_id));

drop policy if exists "tiers organizer insert" on public.ticket_tiers;
create policy "tiers organizer insert" on public.ticket_tiers
  for insert with check (public.is_event_manager(event_id));
drop policy if exists "tiers organizer update" on public.ticket_tiers;
create policy "tiers organizer update" on public.ticket_tiers
  for update using (public.is_event_manager(event_id));
drop policy if exists "tiers organizer delete" on public.ticket_tiers;
create policy "tiers organizer delete" on public.ticket_tiers
  for delete using (public.is_event_manager(event_id));

drop policy if exists "organizer creates tickets" on public.tickets;
create policy "organizer creates tickets" on public.tickets
  for insert with check (public.is_event_manager(event_id));
drop policy if exists "organizer updates tickets" on public.tickets;
create policy "organizer updates tickets" on public.tickets
  for update using (public.is_event_manager(event_id));

-- ---- 8. Privileged column lockdown via column-level grants ---------------------
-- Privileged writes (roles/KYC/status/fees/featured/counters) now only flow
-- through security-definer RPCs or the service role. RLS stays on top.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, avatar_url, birth_date, gender, interested_tags,
              instagram_url, youtube_url, x_url, facebook_url, linkedin_url,
              theme_preference)
  on public.profiles to authenticated;

revoke update on public.organizers from anon, authenticated;
-- Owners may update their own profile + KYC *data* fields; the *decision*
-- fields (kyc_status, verified, rejection_count, kyc_reviewed_at,
-- kyc_review_note, owner_id) are writable only via submit_kyc/admin paths.
grant update (name, bio, description, organizer_intent, avatar_url, cover_url, instagram_url, youtube_url,
              x_url, facebook_url, linkedin_url, upi_id, upi_qr_url,
              pan_number, pan_name, pan_document_url, gst_number, gst_business_name,
              bank_account_number, bank_ifsc, bank_account_name, bank_account_type,
              bank_document_url, kyc_response_note, kyc_response_document_url,
              pending_kyc)
  on public.organizers to authenticated;

-- Pin the INSERT path too — an owner can't create an already-APPROVED row.
drop policy if exists "organizers owner insert" on public.organizers;
create policy "organizers owner insert" on public.organizers
  for insert with check (
    (auth.uid() = owner_id or public.is_current_user_admin())
    and kyc_status in ('NOT_SUBMITTED', 'PENDING')
    and verified = false
    and coalesce(rejection_count, 0) = 0
  );

revoke update on public.events from anon, authenticated;
grant update (title, description, things_to_know, tags, photo_urls, category, categories,
              city, venue_name, venue_address, latitude, longitude, google_maps_link,
              starts_at, ends_at, card_poster_url, banner_poster_url, teaser_video_url,
              fee_payer, needs_door_staff, waitlist_enabled, allow_booking_during_event,
              terms, pricing_mode, contact_email, contact_phone, instagram_url,
              youtube_url, x_url, facebook_url, linkedin_url, linked_past_event_ids)
  on public.events to authenticated;

-- ---- 9. Sanitized public organizer view ----------------------------------------
-- Base table select becomes owner/admin-only; public reads use this view.
create or replace view public.organizers_public as
  select id, owner_id, name, bio, description, avatar_url, cover_url,
         instagram_url, youtube_url, x_url, facebook_url, linkedin_url,
         upi_id, upi_qr_url, verified, created_at
    from public.organizers;
grant select on public.organizers_public to anon, authenticated;

drop policy if exists "organizers are publicly readable" on public.organizers;
drop policy if exists "organizers are public" on public.organizers;
drop policy if exists "organizers owner/admin read" on public.organizers;
create policy "organizers owner/admin read" on public.organizers
  for select using (owner_id = auth.uid() or public.is_current_user_admin());

-- ---- 10. set_event_status RPC — owner (DRAFT/PUBLISHED) or admin (any non-refund
-- transition). CANCELLED must go through cancel_event (refund pipeline).
create or replace function public.set_event_status(p_event_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('DRAFT', 'PUBLISHED', 'POSTPONED', 'COMPLETED') then
    raise exception 'Invalid status transition';
  end if;
  if not public.is_current_user_admin() and not exists (
    select 1 from public.events e
    join public.organizers o on o.id = e.organizer_id
    where e.id = p_event_id and o.owner_id = auth.uid()
  ) then
    raise exception 'Not authorised to change this event status';
  end if;
  update public.events set status = p_status
   where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
end;
$$;
grant execute on function public.set_event_status(uuid, text) to authenticated, service_role;

-- ---- 11. submit_kyc RPC — owner submits own KYC; can only reach PENDING ---------
-- Also enforces the rejection limit: an owner whose rejection_count reached
-- organizer_rejection_limit cannot re-enter the review queue. Callable via
-- PostgREST by any authenticated user, so the check must live here — app-level
-- guards are bypassable. Admin/service callers are exempt (review override).
create or replace function public.submit_kyc(p_organizer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rejections int;
  v_limit int;
begin
  if not exists (
    select 1 from public.organizers
    where id = p_organizer_id and owner_id = auth.uid()
  ) and not public.is_current_user_admin() then
    raise exception 'Not authorised to submit KYC for this organizer';
  end if;

  if auth.role() = 'authenticated' and not public.is_current_user_admin() then
    select coalesce(rejection_count, 0)
      into v_rejections
      from public.organizers
     where id = p_organizer_id;

    select coalesce((value #>> '{}')::int, 5)
      into v_limit
      from public.platform_settings
     where key = 'organizer_rejection_limit';
    v_limit := coalesce(v_limit, 5);

    if v_limit > 0 and v_rejections >= v_limit then
      raise exception 'Organizer application rejected the maximum number of times';
    end if;
  end if;

  update public.organizers
     set kyc_submitted = true,
         kyc_status = 'PENDING',
         kyc_reviewed_at = null,
         kyc_review_note = null
   where id = p_organizer_id;
end;
$$;
grant execute on function public.submit_kyc(uuid) to authenticated, service_role;

-- ---- 12. request_postponement_refund — rewritten --------------------------------
-- Fixes: caller could pass any p_user_id (forced refunds), no row lock
-- (double-refund race), ambiguous column refs (function was broken outright),
-- no idempotency, no inventory release.
drop function if exists public.request_postponement_refund(uuid, uuid);
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
  v_existing uuid;
begin
  -- A signed-in caller may only refund their own order; service role (admin/cron) may pass any user.
  if auth.role() = 'authenticated' and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorised to request a refund for this user';
  end if;

  if not exists (select 1 from public.events where id = p_event_id and status = 'POSTPONED') then
    raise exception 'Event is not postponed';
  end if;

  select o.id, o.total_paise, o.platform_fee_paise, o.tier_id, o.quantity,
         o.status, o.razorpay_payment_id as rzp_payment_id
    into v_order
    from public.orders o
   where o.event_id = p_event_id
     and o.user_id = p_user_id
     and o.status in ('CONFIRMED', 'REFUND_REQUESTED')
   order by (o.status = 'CONFIRMED') desc
   limit 1
   for update of o;

  if not found then
    raise exception 'No confirmed order found for this event';
  end if;

  -- Idempotent: a pending/initiated refund already exists → return it.
  select r.id into v_existing
    from public.refunds r
   where r.order_id = v_order.id and r.status in ('PENDING', 'INITIATED')
   limit 1;
  if v_existing is not null then
    return query
      select v_order.id, v_order.total_paise, v_order.rzp_payment_id, false;
    return;
  end if;

  update public.orders set status = 'REFUND_REQUESTED' where id = v_order.id;
  update public.tickets set status = 'CANCELLED' where order_id = v_order.id;

  -- Release the seat back to the tier.
  update public.ticket_tiers
     set quantity_sold = greatest(quantity_sold - v_order.quantity, 0)
   where id = v_order.tier_id;
  update public.events
     set registrations_count = greatest(registrations_count - v_order.quantity, 0)
   where id = p_event_id;

  insert into public.refunds (order_id, event_id, user_id, amount_paise, platform_fee_paise, status, reason, initiated_at, initiated_by)
  values (v_order.id, p_event_id, p_user_id, v_order.total_paise, v_order.platform_fee_paise, 'PENDING', 'Postponement refund requested by user', now(), p_user_id);

  insert into public.event_notifications (event_id, user_id, type, message)
  values (p_event_id, p_user_id, 'REFUND_INITIATED', 'Your refund request for the postponed event has been submitted. You will receive your refund shortly.');

  -- Offer the freed seat to the next waiter (no-op if none).
  perform public.offer_waitlist_next(v_order.tier_id);

  return query
    select v_order.id, v_order.total_paise, v_order.rzp_payment_id, true;
end;
$$;

-- ---- 13. approve_order — managers only, counts reservations, event-status guard,
--      journals a TICKET_SALE ledger row, notifies the buyer.
create or replace function public.approve_order(p_order_id uuid)
returns setof public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  public.orders;
  v_tier   public.ticket_tiers;
  v_status text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;
  if v_order.status <> 'PENDING_VERIFICATION' then
    raise exception 'Order is already %', v_order.status;
  end if;

  -- Authorization: event owner, admin, or FULL collaborator (not door staff).
  if not public.is_event_manager(v_order.event_id) then
    raise exception 'Not authorised to approve orders for this event';
  end if;

  -- Never mint tickets for a cancelled/terminated event.
  select status into v_status from public.events where id = v_order.event_id;
  if v_status in ('CANCELLED', 'CANCELLATION_REQUESTED') then
    raise exception 'Cannot approve orders for a cancelled event';
  end if;

  -- Stock check counts held reservations too.
  select * into v_tier from public.ticket_tiers where id = v_order.tier_id for update;
  if not found then
    raise exception 'Ticket tier not found';
  end if;
  if v_tier.quantity - v_tier.quantity_sold - coalesce(v_tier.quantity_reserved, 0) < v_order.quantity then
    raise exception 'Not enough tickets left in this tier (available: %, requested: %)',
      v_tier.quantity - v_tier.quantity_sold - coalesce(v_tier.quantity_reserved, 0), v_order.quantity;
  end if;

  update public.ticket_tiers
     set quantity_sold = quantity_sold + v_order.quantity
   where id = v_order.tier_id;

  update public.orders
     set status = 'CONFIRMED', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_order_id;

  update public.events
     set registrations_count = registrations_count + v_order.quantity * greatest(1, coalesce(v_tier.admits, 1))
   where id = v_order.event_id;

  -- Journal the sale (manual-UPI path has no Razorpay payment id).
  insert into public.payment_ledger (
    order_id, event_id, organizer_id, type,
    gross_amount_paise, commission_paise, convenience_fee_paise,
    razorpay_fee_paise, net_organizer_paise, net_platform_paise, notes
  )
  select o.id, o.event_id, e.organizer_id, 'TICKET_SALE',
         o.subtotal_paise, o.commission_paise, o.convenience_fee_paise,
         0, o.organizer_payout_paise, o.platform_fee_paise,
         'Manual UPI order approved'
    from public.orders o
    join public.events e on e.id = o.event_id
   where o.id = p_order_id
     and o.subtotal_paise > 0
     and not exists (
       select 1 from public.payment_ledger pl
       where pl.order_id = o.id and pl.type = 'TICKET_SALE'
     );

  -- Notify the buyer.
  insert into public.event_notifications (event_id, user_id, type, message)
  select o.event_id, o.user_id, 'ORDER_CONFIRMED', 'Your payment was verified — your ticket is confirmed.'
    from public.orders o
   where o.id = p_order_id and o.user_id is not null;

  -- Clear waitlist entry on confirm.
  delete from public.waitlist
   where tier_id = v_order.tier_id and user_id = v_order.user_id;

  -- Mint the tickets (qr_hash per ticket, same scheme as confirm_razorpay_order).
  return query
    insert into public.tickets (order_id, event_id, tier_id, user_id, qr_hash)
    select
      v_order.id, v_order.event_id, v_order.tier_id, v_order.user_id,
      encode(sha256((v_order.id::text || ':' || g::text || ':' || gen_random_uuid()::text)::bytea), 'hex')
    from generate_series(1, v_order.quantity * greatest(1, coalesce(v_tier.admits, 1))) g
    returning *;
end;
$$;
-- approve/reject stay callable by authenticated (is_event_manager enforced inside)

-- ---- 14. reject_order — managers only + buyer notification.
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
  if not public.is_event_manager(v_order.event_id) then
    raise exception 'Not authorised to reject orders for this event';
  end if;
  -- Reject is for unverified payments only — CONFIRMED orders carry real
  -- money and must go through the refund flow (not a bare status flip).
  if v_order.status <> 'PENDING_VERIFICATION' then
    raise exception 'Only orders awaiting payment verification can be rejected (status is %)', v_order.status;
  end if;

  update public.orders
     set status           = 'REJECTED',
         rejection_reason = p_reason,
         reviewed_by      = auth.uid(),
         reviewed_at      = now()
   where id = p_order_id
  returning * into v_order;

  insert into public.event_notifications (event_id, user_id, type, message)
  select o.event_id, o.user_id, 'ORDER_REJECTED',
         coalesce('Your payment could not be verified. ' || p_reason, 'Your payment could not be verified.')
    from public.orders o
   where o.id = p_order_id and o.user_id is not null;

  return v_order;
end;
$$;

-- ---- 15. Order-creation RPCs: event-status + tier↔event checks ------------------
-- create_paid_order: also counts held reservations and blocks duplicate
-- active orders (incl. RESERVED).
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
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found';
  end if;
  if v_event.status not in ('PUBLISHED', 'POSTPONED') then
    raise exception 'This event is not open for booking';
  end if;

  -- Lock the tier row to prevent concurrent overbooking
  select * into v_tier from public.ticket_tiers where id = p_tier_id for update;
  if not found then
    raise exception 'Ticket tier not found';
  end if;
  if v_tier.event_id <> p_event_id then
    raise exception 'Ticket tier does not belong to this event';
  end if;
  if v_tier.price_paise = 0 then
    raise exception 'This function is for paid tickets only';
  end if;
  if v_tier.quantity - v_tier.quantity_sold - coalesce(v_tier.quantity_reserved, 0) < p_quantity then
    raise exception 'Not enough tickets left in this tier';
  end if;

  -- Prevent double booking: active orders include held Razorpay reservations.
  select count(*) into v_existing_count
  from public.orders
  where event_id = p_event_id
    and user_id = auth.uid()
    and status in ('CONFIRMED', 'PENDING_VERIFICATION', 'RESERVED');
  if v_existing_count > 0 then
    raise exception 'You have already booked a ticket for this event';
  end if;

  insert into public.orders (
    event_id, tier_id, user_id, quantity,
    unit_price_paise, subtotal_paise, platform_fee_paise, total_paise,
    fee_payer, status, utr_reference, payment_proof_url,
    buyer_name, buyer_phone, buyer_email, buyer_gender,
    commission_paise, convenience_fee_paise, organizer_payout_paise
  ) values (
    p_event_id, p_tier_id, auth.uid(), p_quantity,
    p_unit_price_paise, p_subtotal_paise, p_platform_fee_paise, p_total_paise,
    p_fee_payer, 'PENDING_VERIFICATION', p_utr_reference, p_payment_proof_url,
    p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender,
    p_commission_paise, p_convenience_fee_paise, p_organizer_payout_paise
  )
  returning * into v_order;

  return v_order;
end;
$$;

-- create_free_order: same guards + duplicate check inside the RPC under the
-- tier lock (was previously a racy JS-level count).
create or replace function public.create_free_order(
  p_event_id uuid,
  p_tier_id  uuid,
  p_quantity integer,
  p_buyer_name   text default null,
  p_buyer_phone  text default null,
  p_buyer_email  text default null,
  p_buyer_gender text default null
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
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found';
  end if;
  if v_event.status not in ('PUBLISHED', 'POSTPONED') then
    raise exception 'This event is not open for booking';
  end if;

  select * into v_tier from public.ticket_tiers where id = p_tier_id for update;
  if not found then
    raise exception 'Ticket tier not found';
  end if;
  if v_tier.event_id <> p_event_id then
    raise exception 'Ticket tier does not belong to this event';
  end if;
  if v_tier.price_paise <> 0 then
    raise exception 'This function is for free tickets only';
  end if;
  if v_tier.quantity - v_tier.quantity_sold - coalesce(v_tier.quantity_reserved, 0) < p_quantity then
    raise exception 'Not enough tickets left';
  end if;

  select count(*) into v_existing_count
  from public.orders
  where event_id = p_event_id
    and user_id = auth.uid()
    and status in ('CONFIRMED', 'PENDING_VERIFICATION', 'RESERVED');
  if v_existing_count > 0 then
    raise exception 'You have already booked a ticket for this event';
  end if;

  insert into public.orders (
    event_id, tier_id, user_id, quantity,
    unit_price_paise, subtotal_paise, platform_fee_paise, total_paise,
    fee_payer, status, buyer_name, buyer_phone, buyer_email, buyer_gender
  ) values (
    p_event_id, p_tier_id, auth.uid(), p_quantity,
    0, 0, 0, 0,
    coalesce(v_event.fee_payer, 'BUYER')::fee_payer, 'CONFIRMED', p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender
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
  from generate_series(1, p_quantity * greatest(1, coalesce(v_tier.admits, 1))) g;

  update public.ticket_tiers
     set quantity_sold = quantity_sold + p_quantity
   where id = p_tier_id;

  update public.events
     set registrations_count = registrations_count + p_quantity * greatest(1, coalesce(v_tier.admits, 1))
   where id = p_event_id;

  delete from public.waitlist
   where tier_id = p_tier_id and user_id = auth.uid();

  return v_order;
end;
$$;

-- ---- 16. confirm_razorpay_order — late-capture safety net -----------------------
-- If a payment lands on a FAILED/EXPIRED/CANCELLED order (async UPI capture,
-- retry after expiry), do NOT mint tickets — instead flip to REFUND_REQUESTED
-- with a refunds row so the money is never silently kept.
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
    -- Late capture on a dead order: money arrived but inventory is gone → refund.
    if v_order.status in ('FAILED', 'EXPIRED', 'CANCELLED') and p_razorpay_payment_id is not null then
      update public.orders
         set status = 'REFUND_REQUESTED', razorpay_payment_id = p_razorpay_payment_id
       where id = p_order_id;
      insert into public.refunds (order_id, event_id, user_id, amount_paise, platform_fee_paise, status, reason, initiated_at)
      values (v_order.id, v_order.event_id, v_order.user_id, v_order.total_paise, v_order.platform_fee_paise,
              'PENDING', 'Payment captured after order ' || lower(v_order.status::text) || ' — auto-refund', now());
      -- Guest (counter) orders have no account to notify.
      if v_order.user_id is not null then
        insert into public.event_notifications (event_id, user_id, type, message)
        values (v_order.event_id, v_order.user_id, 'REFUND_INITIATED',
                'Your payment was received after the booking window closed — a refund has been initiated automatically.');
      end if;
      return;
    end if;
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
     set registrations_count = registrations_count + v_order.quantity * greatest(1, coalesce(v_tier.admits, 1))
   where id = v_order.event_id;
  delete from public.waitlist
   where tier_id = v_order.tier_id and user_id = v_order.user_id;
  -- Guest (counter) orders have no account to notify.
  if v_order.user_id is not null then
    insert into public.event_notifications (event_id, user_id, type, message)
    values (v_order.event_id, v_order.user_id, 'ORDER_CONFIRMED', 'Payment confirmed — your ticket is ready.');
  end if;
  return query
    insert into public.tickets (order_id, event_id, tier_id, user_id, qr_hash)
    select
      v_order.id, v_order.event_id, v_order.tier_id, v_order.user_id,
      encode(sha256((v_order.id::text || ':' || g::text || ':' || gen_random_uuid()::text)::bytea), 'hex')
    from generate_series(1, v_order.quantity * greatest(1, coalesce(v_tier.admits, 1))) g
    returning *;
end;
$$;

-- ---- 17. cancel_event — also reject pending-verification orders -----------------
-- and release sold inventory so counts stay honest.
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
  end loop;

  -- Reject orders still awaiting manual verification (not chargeable).
  update public.orders
     set status = 'REJECTED', rejection_reason = 'Event cancelled', reviewed_at = now()
   where event_id = p_event_id and status = 'PENDING_VERIFICATION';

  for v_order in
    select id, user_id, tier_id, quantity, total_paise, platform_fee_paise
      from public.orders
     where event_id = p_event_id and status = 'CONFIRMED'
  loop
    update public.orders set status = 'REFUNDED' where id = v_order.id;
    update public.tickets set status = 'CANCELLED' where order_id = v_order.id;
    -- Release the seats (keeps sold/registrations honest for analytics).
    update public.ticket_tiers
       set quantity_sold = greatest(quantity_sold - v_order.quantity, 0)
     where id = v_order.tier_id;
    update public.events
       set registrations_count = greatest(registrations_count - v_order.quantity, 0)
     where id = p_event_id;
    insert into public.refunds (order_id, event_id, user_id, amount_paise, platform_fee_paise, status, reason, initiated_at)
    values (v_order.id, p_event_id, v_order.user_id, v_order.total_paise, v_order.platform_fee_paise, 'PENDING', p_reason, now());
    insert into public.event_notifications (event_id, user_id, type, message)
    values (p_event_id, v_order.user_id, 'CANCELLATION', p_reason || ' You will receive a full refund.');
    v_refund_count := v_refund_count + 1;
    v_total_refund := v_total_refund + v_order.total_paise;
    v_total_fee := v_total_fee + v_order.platform_fee_paise;
  end loop;

  -- Notify subscribers (Update-Me) too, not just ticket holders.
  insert into public.event_notifications (event_id, user_id, type, message)
  select p_event_id, s.user_id, 'CANCELLATION', p_reason
    from public.event_subscriptions s
   where s.event_id = p_event_id
     and s.user_id not in (
       select o.user_id from public.orders o
       where o.event_id = p_event_id and o.status = 'REFUNDED' and o.user_id is not null
     );

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

-- ---- 18. payment_ledger: unique payment-ref index (double-write guard) ---------
create unique index if not exists payment_ledger_payment_uidx
  on public.payment_ledger (razorpay_payment_id)
  where razorpay_payment_id is not null;

-- ---- 19. event_notifications: admins can also insert (KYC outcomes etc.) -------
drop policy if exists "admins insert notifications" on public.event_notifications;
create policy "admins insert notifications" on public.event_notifications
  for insert with check (public.is_current_user_admin());

-- ---- 20. refunds: admins (not just event owner) can insert refund rows ----------
drop policy if exists "admins insert refunds" on public.refunds;
create policy "admins insert refunds" on public.refunds
  for insert with check (public.is_current_user_admin());


-- ---- 21. set_razorpay_order_id — raise when the order is not linkable --------
-- (was a silent no-op: a status race would leave the order unmatchable).
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
  if not found then raise exception 'Order is not reservable'; end if;
end;
$$;

-- ---- 22. boosts: organizer can only insert PENDING; only admin flips status ----
-- Previously the organizer UPDATE policy let an organizer self-activate.
drop policy if exists "boosts organizer insert" on public.boosts;
create policy "boosts organizer insert" on public.boosts
  for insert with check (
    status = 'PENDING'
    and exists (
      select 1 from public.organizers o
      where o.id = organizer_id and o.owner_id = auth.uid()
    )
  );
drop policy if exists "boosts organizer update" on public.boosts;
drop policy if exists "boosts admin update" on public.boosts;
create policy "boosts admin update" on public.boosts
  for update using (public.is_current_user_admin());

-- ---- 23. hero_boosts: pin status on organizer insert ----------------------------
drop policy if exists "organizer insert hero boosts" on public.hero_boosts;
create policy "organizer insert hero boosts" on public.hero_boosts
  for insert with check (
    status = 'PENDING'
    and exists (
      select 1 from public.organizers o
      where o.id = organizer_id and o.owner_id = auth.uid()
    )
  );

-- ---- 24. join_waitlist: validate the tier belongs to the event + waitlist on ---
create or replace function public.join_waitlist(
  p_event_id uuid,
  p_tier_id  uuid
)
returns public.waitlist
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.waitlist;
  v_pos   integer;
  v_cap   integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to join the waitlist';
  end if;

  -- Lock the tier row to serialize position assignment
  perform 1 from public.ticket_tiers where id = p_tier_id for update;
  if not found then
    raise exception 'Ticket tier not found';
  end if;
  if not exists (select 1 from public.ticket_tiers where id = p_tier_id and event_id = p_event_id) then
    raise exception 'Ticket tier does not belong to this event';
  end if;
  if not exists (select 1 from public.events where id = p_event_id and waitlist_enabled) then
    raise exception 'Waitlist is not enabled for this event';
  end if;

  -- Per-user cap: when max_tickets_per_order is 1 (the default), a user who
  -- already holds an active order can't join the waitlist — mirrors the
  -- per-user-per-event guard in the order flow.
  select (value #>> '{}')::int into v_cap
    from public.platform_settings where key = 'max_tickets_per_order';
  if coalesce(v_cap, 1) <= 1 and exists (
    select 1 from public.orders
     where event_id = p_event_id
       and user_id = auth.uid()
       and status in ('CONFIRMED', 'PENDING_VERIFICATION', 'RESERVED')
  ) then
    raise exception 'You already have a ticket for this event';
  end if;

  -- Idempotent: already on the waitlist → return existing row
  select * into v_entry
    from public.waitlist
   where tier_id = p_tier_id and user_id = auth.uid();
  if found then
    return v_entry;
  end if;

  select coalesce(max(position), 0) + 1 into v_pos
    from public.waitlist where tier_id = p_tier_id;

  insert into public.waitlist (event_id, tier_id, user_id, position)
  values (p_event_id, p_tier_id, auth.uid(), v_pos)
  on conflict (tier_id, user_id) do nothing
  returning * into v_entry;

  if v_entry.id is null then
    select * into v_entry
      from public.waitlist
     where tier_id = p_tier_id and user_id = auth.uid();
  end if;

  return v_entry;
end;
$$;

-- ---- 25. Money integrity: create_paid_order / create_reserved_order ----------
-- Previously every paise field was caller-supplied — anyone could book a ₹500
-- ticket with total_paise=1 or set organizer_payout_paise arbitrarily.
-- Both functions now recompute ALL money fields from the tier row and the
-- event's fee config. The caller's p_*_paise params are kept for signature
-- compatibility but ignored.

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
  v_subtotal integer;
  v_commission integer;
  v_convenience integer;
  v_platform_fee integer;
  v_total integer;
  v_payout integer;
begin
  if auth.uid() is null then raise exception 'Sign in to book tickets'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be at least 1'; end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found';
  end if;
  if v_event.status not in ('PUBLISHED', 'POSTPONED') then
    raise exception 'This event is not open for booking';
  end if;

  -- Booking cutoff: event start, or event end when organizer allows during-event booking
  if (case when coalesce(v_event.allow_booking_during_event, false)
           then coalesce(v_event.ends_at, v_event.starts_at)
           else v_event.starts_at end) <= now() then
    raise exception 'Online booking is closed for this event';
  end if;

  -- Lock the tier row to prevent concurrent overbooking
  select * into v_tier from public.ticket_tiers where id = p_tier_id for update;
  if not found then
    raise exception 'Ticket tier not found';
  end if;
  if v_tier.event_id <> p_event_id then
    raise exception 'Ticket tier does not belong to this event';
  end if;
  if v_tier.price_paise = 0 then
    raise exception 'This function is for paid tickets only';
  end if;
  if v_tier.quantity - v_tier.quantity_sold - coalesce(v_tier.quantity_reserved, 0) < p_quantity then
    raise exception 'Not enough tickets left in this tier';
  end if;

  -- Prevent double booking: active orders include held Razorpay reservations.
  select count(*) into v_existing_count
  from public.orders
  where event_id = p_event_id
    and user_id = auth.uid()
    and status in ('CONFIRMED', 'PENDING_VERIFICATION', 'RESERVED');
  if v_existing_count > 0 then
    raise exception 'You have already booked a ticket for this event';
  end if;

  -- Money: recompute server-side from tier price + event fee config.
  -- Caller-supplied paise params are ignored (kept for signature compat).
  v_subtotal    := v_tier.price_paise * p_quantity;
  v_commission  := case when coalesce(v_event.commission_enabled, true)
                        then round(v_subtotal * coalesce(v_event.commission_bps, 1000) / 10000.0)
                        else 0 end;
  v_convenience := case when coalesce(v_event.convenience_fee_enabled, true)
                        then round(v_subtotal * coalesce(v_event.convenience_fee_bps, 200) / 10000.0)
                        else 0 end;
  v_platform_fee := v_commission + v_convenience;
  v_total       := v_subtotal + v_convenience;
  v_payout      := v_subtotal - v_commission;

  insert into public.orders (
    event_id, tier_id, user_id, quantity,
    unit_price_paise, subtotal_paise, platform_fee_paise, total_paise,
    fee_payer, status, utr_reference, payment_proof_url,
    buyer_name, buyer_phone, buyer_email, buyer_gender,
    commission_paise, convenience_fee_paise, organizer_payout_paise
  ) values (
    p_event_id, p_tier_id, auth.uid(), p_quantity,
    v_tier.price_paise, v_subtotal, v_platform_fee, v_total,
    coalesce(v_event.fee_payer, 'BUYER'), 'PENDING_VERIFICATION', p_utr_reference, p_payment_proof_url,
    p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender,
    v_commission, v_convenience, v_payout
  )
  returning * into v_order;

  return v_order;
end;
$$;

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
  v_subtotal integer;
  v_commission integer;
  v_convenience integer;
  v_platform_fee integer;
  v_total integer;
  v_payout integer;
begin
  if auth.uid() is null then raise exception 'Sign in to book tickets'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be at least 1'; end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if v_event.status not in ('PUBLISHED', 'POSTPONED') then
    raise exception 'This event is not open for booking';
  end if;

  -- Booking cutoff
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
    and status in ('CONFIRMED', 'RESERVED', 'PENDING_VERIFICATION');
  if v_existing_count > 0 then
    raise exception 'You already have an active booking for this event';
  end if;

  -- Money: recompute server-side (caller amounts ignored).
  v_subtotal    := v_tier.price_paise * p_quantity;
  v_commission  := case when coalesce(v_event.commission_enabled, true)
                        then round(v_subtotal * coalesce(v_event.commission_bps, 1000) / 10000.0)
                        else 0 end;
  v_convenience := case when coalesce(v_event.convenience_fee_enabled, true)
                        then round(v_subtotal * coalesce(v_event.convenience_fee_bps, 200) / 10000.0)
                        else 0 end;
  v_platform_fee := v_commission + v_convenience;
  v_total       := v_subtotal + v_convenience;
  v_payout      := v_subtotal - v_commission;

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
    v_tier.price_paise, v_subtotal, v_platform_fee,
    v_commission, v_convenience, v_payout,
    v_total, coalesce(v_event.fee_payer, 'BUYER'), 'RESERVED',
    p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender,
    now(), now() + interval '15 minutes'
  )
  returning * into v_order;
  return v_order;
end;
$$;

-- create_free_order: same guards (auth, qty, cutoff). Keeps the ticket
-- minting + waitlist cleanup from the earlier version.
create or replace function public.create_free_order(
  p_event_id uuid,
  p_tier_id  uuid,
  p_quantity integer,
  p_buyer_name   text default null,
  p_buyer_phone  text default null,
  p_buyer_email  text default null,
  p_buyer_gender text default null
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
  if auth.uid() is null then raise exception 'Sign in to RSVP'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be at least 1'; end if;

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

  select count(*) into v_existing_count
  from public.orders
  where event_id = p_event_id
    and user_id = auth.uid()
    and status in ('CONFIRMED', 'PENDING_VERIFICATION', 'RESERVED');
  if v_existing_count > 0 then
    raise exception 'You have already booked a ticket for this event';
  end if;

  insert into public.orders (
    event_id, tier_id, user_id, quantity,
    unit_price_paise, subtotal_paise, platform_fee_paise, total_paise,
    fee_payer, status, buyer_name, buyer_phone, buyer_email, buyer_gender
  ) values (
    p_event_id, p_tier_id, auth.uid(), p_quantity,
    0, 0, 0, 0,
    coalesce(v_event.fee_payer, 'BUYER')::fee_payer, 'CONFIRMED', p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender
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
  from generate_series(1, p_quantity * greatest(1, coalesce(v_tier.admits, 1))) g;

  update public.ticket_tiers
     set quantity_sold = quantity_sold + p_quantity
   where id = p_tier_id;

  update public.events
     set registrations_count = registrations_count + p_quantity * greatest(1, coalesce(v_tier.admits, 1))
   where id = p_event_id;

  delete from public.waitlist
   where tier_id = p_tier_id and user_id = auth.uid();

  return v_order;
end;
$$;

-- ---- 26. Post-STEP-21 fixes ----------------------------------------------------
-- a) Missing enum values — approve/reject-order and hero-boost notifications
--    were silently failing (sendNotification swallows insert errors).
do $$ begin alter type public.event_notification_type add value if not exists 'ORDER_CONFIRMED'; exception when others then null; end $$;
do $$ begin alter type public.event_notification_type add value if not exists 'ORDER_REJECTED'; exception when others then null; end $$;
do $$ begin alter type public.event_notification_type add value if not exists 'HERO_BOOST'; exception when others then null; end $$;

-- b) set_event_status: p_status is text → cast to the event_status enum.
create or replace function public.set_event_status(
  p_event_id uuid,
  p_status   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_event_manager(p_event_id) then
    raise exception 'Not authorised to change this event status';
  end if;
  if p_status not in ('DRAFT','PUBLISHED','POSTPONED','CANCELLED','COMPLETED','SOLD_OUT') then
    raise exception 'Invalid status: %', p_status;
  end if;
  if p_status = 'CANCELLED' then
    raise exception 'Use cancel_event() — direct cancellation skips refunds and notifications';
  end if;
  update public.events set status = p_status::public.event_status
   where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
end;
$$;
grant execute on function public.set_event_status(uuid, text) to authenticated, service_role;

-- c) request_postponement_refund: qualify tickets.order_id — the OUT param
--    `order_id` (RETURNS TABLE) shadows the column → "ambiguous" on every call.
drop function if exists public.request_postponement_refund(uuid, uuid);
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
  v_existing uuid;
begin
  -- A signed-in caller may only refund their own order; service role (admin/cron) may pass any user.
  if auth.role() = 'authenticated' and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorised to request a refund for this user';
  end if;

  if not exists (select 1 from public.events where id = p_event_id and status = 'POSTPONED') then
    raise exception 'Event is not postponed';
  end if;

  select o.id, o.total_paise, o.platform_fee_paise, o.tier_id, o.quantity,
         o.status, o.razorpay_payment_id as rzp_payment_id
    into v_order
    from public.orders o
   where o.event_id = p_event_id
     and o.user_id = p_user_id
     and o.status in ('CONFIRMED', 'REFUND_REQUESTED')
   order by (o.status = 'CONFIRMED') desc
   limit 1
   for update of o;

  if not found then
    raise exception 'No confirmed order found for this event';
  end if;

  -- Idempotent: a pending/initiated refund already exists → return it.
  select r.id into v_existing
    from public.refunds r
   where r.order_id = v_order.id and r.status in ('PENDING', 'INITIATED')
   limit 1;
  if v_existing is not null then
    return query
      select v_order.id, v_order.total_paise, v_order.rzp_payment_id, false;
    return;
  end if;

  update public.orders set status = 'REFUND_REQUESTED' where id = v_order.id;
  update public.tickets t set status = 'CANCELLED' where t.order_id = v_order.id;

  -- Release the seat back to the tier.
  update public.ticket_tiers
     set quantity_sold = greatest(quantity_sold - v_order.quantity, 0)
   where id = v_order.tier_id;
  update public.events
     set registrations_count = greatest(registrations_count - v_order.quantity, 0)
   where id = p_event_id;

  insert into public.refunds (order_id, event_id, user_id, amount_paise, platform_fee_paise, status, reason, initiated_at, initiated_by)
  values (v_order.id, p_event_id, p_user_id, v_order.total_paise, v_order.platform_fee_paise, 'PENDING', 'Postponement refund requested by user', now(), p_user_id);

  insert into public.event_notifications (event_id, user_id, type, message)
  values (p_event_id, p_user_id, 'REFUND_INITIATED', 'Your refund request for the postponed event has been submitted. You will receive your refund shortly.');

  -- Offer the freed seat to the next waiter (no-op if none).
  perform public.offer_waitlist_next(v_order.tier_id);

  return query
    select v_order.id, v_order.total_paise, v_order.rzp_payment_id, true;
end;
$$;
grant execute on function public.request_postponement_refund(uuid, uuid) to authenticated, service_role;

-- ============================================================================
-- STEP 27 · Analytics schema separation
-- ============================================================================
-- Analytics reads previously pulled the whole orders/profiles tables into
-- memory per dashboard request. Rollups now live in a dedicated `analytics`
-- schema (keeps the module boundary for the future service split and keeps
-- PostgREST's public surface clean). A cron-called RPC refreshes them; admin
-- reads go through service-role-only public views.
-- OLAP (ClickHouse/BigQuery) can later consume the same rollup/event data via
-- CDC or scheduled ETL — this schema is the seam.

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;
grant usage on schema analytics to service_role;

-- One row per UTC calendar day.
create table if not exists analytics.daily_metrics (
  day                      date primary key,
  signups                  integer not null default 0,
  new_organizers           integer not null default 0,
  dau                      integer not null default 0,   -- distinct users with order activity
  orders_created           integer not null default 0,
  orders_confirmed         integer not null default 0,
  gross_paise              bigint  not null default 0,   -- confirmed subtotal
  buyer_paid_paise         bigint  not null default 0,   -- confirmed total
  commission_paise         bigint  not null default 0,
  convenience_fee_paise    bigint  not null default 0,
  platform_fee_paise       bigint  not null default 0,
  organizer_payout_paise   bigint  not null default 0,
  refreshed_at             timestamptz not null default now()
);

-- Fact table for DAU/MAU: one row per (day, user) with any order activity.
create table if not exists analytics.user_activity_days (
  day      date not null,
  user_id  uuid not null,
  primary key (day, user_id)
);

-- Per-user order stats (all-time) — returning vs non-returning, active users.
create table if not exists analytics.user_order_stats (
  user_id          uuid primary key,
  confirmed_orders integer not null default 0,
  last_order_day   date,
  refreshed_at     timestamptz not null default now()
);

-- Per-organizer rollup (all-time) — top-organizers widget.
create table if not exists analytics.organizer_rollup (
  organizer_id             uuid primary key references public.organizers(id) on delete cascade,
  event_count              integer not null default 0,
  confirmed_revenue_paise  bigint  not null default 0,  -- confirmed subtotal (organizer gross)
  refreshed_at             timestamptz not null default now()
);

-- Per-event rollup (all-time) — admin revenue table, organizer dashboards.
create table if not exists analytics.event_rollup (
  event_id                  uuid primary key references public.events(id) on delete cascade,
  organizer_id              uuid not null,
  confirmed_orders          integer not null default 0,
  gross_paise               bigint not null default 0,
  buyer_paid_paise          bigint not null default 0,
  commission_paise          bigint not null default 0,
  convenience_fee_paise     bigint not null default 0,
  platform_fee_paise        bigint not null default 0,
  organizer_payout_paise    bigint not null default 0,
  refreshed_at              timestamptz not null default now()
);

-- Singleton all-time totals row (id always 1).
create table if not exists analytics.totals (
  id                      smallint primary key default 1 check (id = 1),
  total_payments          integer not null default 0,
  confirmed_payments      integer not null default 0,
  total_volume_paise      bigint  not null default 0,
  avg_order_value_paise   bigint  not null default 0,
  active_users            integer not null default 0,   -- users with ≥1 confirmed order
  returning_users         integer not null default 0,   -- ≥2 confirmed orders
  non_returning_users     integer not null default 0,   -- exactly 1 confirmed order
  mau                     integer not null default 0,   -- distinct users active last 30d
  payment_methods         jsonb   not null default '[]'::jsonb,
  refreshed_at            timestamptz not null default now()
);
insert into analytics.totals (id) values (1) on conflict (id) do nothing;

revoke all on all tables in schema analytics from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema analytics to service_role;

-- Public views for PostgREST reads — service-role only, so dashboards hit
-- these via the service client after requireAdmin() (authz in app code).
create or replace view public.analytics_daily_metrics_v  as select * from analytics.daily_metrics;
create or replace view public.analytics_user_stats_v     as select * from analytics.user_order_stats;
create or replace view public.analytics_user_activity_v  as select * from analytics.user_activity_days;
create or replace view public.analytics_organizer_rollup_v as select * from analytics.organizer_rollup;
create or replace view public.analytics_event_rollup_v   as select * from analytics.event_rollup;
create or replace view public.analytics_totals_v         as select * from analytics.totals;

revoke all on public.analytics_daily_metrics_v      from public, anon, authenticated;
revoke all on public.analytics_user_stats_v         from public, anon, authenticated;
revoke all on public.analytics_user_activity_v      from public, anon, authenticated;
revoke all on public.analytics_organizer_rollup_v   from public, anon, authenticated;
revoke all on public.analytics_event_rollup_v       from public, anon, authenticated;
revoke all on public.analytics_totals_v             from public, anon, authenticated;
grant select on public.analytics_daily_metrics_v      to service_role;
grant select on public.analytics_user_stats_v         to service_role;
grant select on public.analytics_user_activity_v      to service_role;
grant select on public.analytics_organizer_rollup_v   to service_role;
grant select on public.analytics_event_rollup_v       to service_role;
grant select on public.analytics_totals_v             to service_role;

-- ---- refresh_analytics_rollups ------------------------------------------------
-- Recomputes the last p_days of daily buckets plus all-time per-user /
-- per-organizer / per-event / totals rollups. Idempotent — safe to re-run.
-- Called by /api/cron/refresh-analytics (service role only).

create or replace function public.refresh_analytics_rollups(p_days integer default 90)
returns void
language plpgsql
security definer
set search_path = public, analytics
as $$
begin
  -- Daily metrics for the trailing window (incl. today's partial day).
  delete from analytics.daily_metrics where day >= current_date - p_days;
  insert into analytics.daily_metrics (
    day, signups, new_organizers, dau,
    orders_created, orders_confirmed,
    gross_paise, buyer_paid_paise, commission_paise,
    convenience_fee_paise, platform_fee_paise, organizer_payout_paise,
    refreshed_at
  )
  select
    d.day,
    coalesce(s.cnt, 0), coalesce(o.cnt, 0), coalesce(a.dau, 0),
    coalesce(oc.cnt, 0), coalesce(cn.cnt, 0),
    coalesce(cn.gross, 0), coalesce(cn.paid, 0), coalesce(cn.comm, 0),
    coalesce(cn.conv, 0), coalesce(cn.fee, 0), coalesce(cn.payout, 0),
    now()
  from generate_series(current_date - p_days, current_date, '1 day'::interval) d(day)
  left join (
    select created_at::date as day, count(*) cnt from public.profiles group by 1
  ) s on s.day = d.day
  left join (
    select created_at::date as day, count(*) cnt from public.organizers group by 1
  ) o on o.day = d.day
  left join (
    select created_at::date as day, count(distinct user_id) dau
      from public.orders where user_id is not null group by 1
  ) a on a.day = d.day
  left join (
    select created_at::date as day, count(*) cnt from public.orders group by 1
  ) oc on oc.day = d.day
  left join (
    select created_at::date as day,
           count(*) cnt,
           sum(subtotal_paise) gross,
           sum(total_paise) paid,
           sum(commission_paise) comm,
           sum(convenience_fee_paise) conv,
           sum(platform_fee_paise) fee,
           sum(organizer_payout_paise) payout
      from public.orders where status = 'CONFIRMED' group by 1
  ) cn on cn.day = d.day;

  -- User-activity fact rows for the window.
  delete from analytics.user_activity_days where day >= current_date - p_days;
  insert into analytics.user_activity_days (day, user_id)
  select distinct created_at::date, user_id
    from public.orders
   where user_id is not null and created_at::date >= current_date - p_days;

  -- All-time per-user order stats.
  truncate analytics.user_order_stats;
  insert into analytics.user_order_stats (user_id, confirmed_orders, last_order_day, refreshed_at)
  select user_id, count(*) filter (where status = 'CONFIRMED'),
         max(created_at)::date, now()
    from public.orders
   where user_id is not null
   group by user_id;

  -- All-time per-organizer rollup.
  truncate analytics.organizer_rollup;
  insert into analytics.organizer_rollup (organizer_id, event_count, confirmed_revenue_paise, refreshed_at)
  select e.organizer_id,
         count(distinct o.event_id),
         coalesce(sum(o.subtotal_paise), 0),
         now()
    from public.orders o
    join public.events e on e.id = o.event_id
   where o.status = 'CONFIRMED'
   group by e.organizer_id;

  -- All-time per-event rollup.
  truncate analytics.event_rollup;
  insert into analytics.event_rollup (
    event_id, organizer_id, confirmed_orders, gross_paise, buyer_paid_paise,
    commission_paise, convenience_fee_paise, platform_fee_paise,
    organizer_payout_paise, refreshed_at
  )
  select o.event_id, e.organizer_id,
         count(*),
         sum(o.subtotal_paise), sum(o.total_paise),
         sum(o.commission_paise), sum(o.convenience_fee_paise),
         sum(o.platform_fee_paise), sum(o.organizer_payout_paise),
         now()
    from public.orders o
    join public.events e on e.id = o.event_id
   where o.status = 'CONFIRMED'
   group by o.event_id, e.organizer_id;

  -- Singleton totals.
  update analytics.totals set
    total_payments        = (select count(*) from public.orders),
    confirmed_payments    = (select count(*) from public.orders where status = 'CONFIRMED'),
    total_volume_paise    = (select coalesce(sum(total_paise),0) from public.orders where status = 'CONFIRMED'),
    avg_order_value_paise = (select coalesce(round(avg(total_paise)),0) from public.orders where status = 'CONFIRMED'),
    active_users          = (select count(*) from analytics.user_order_stats where confirmed_orders >= 1),
    returning_users       = (select count(*) from analytics.user_order_stats where confirmed_orders >= 2),
    non_returning_users   = (select count(*) from analytics.user_order_stats where confirmed_orders = 1),
    mau                   = (select count(distinct user_id) from analytics.user_activity_days where day >= current_date - 30),
    payment_methods       = coalesce((
      select jsonb_agg(jsonb_build_object('method', coalesce(payment_method,'unknown'), 'count', cnt, 'volumePaise', vol))
        from (select payment_method, count(*) cnt, sum(total_paise) vol
                from public.orders where status = 'CONFIRMED' group by payment_method) m
    ), '[]'::jsonb),
    refreshed_at          = now()
  where id = 1;
end;
$$;

revoke all on function public.refresh_analytics_rollups(integer) from public, anon, authenticated;
grant execute on function public.refresh_analytics_rollups(integer) to service_role;

-- ============================================================================
-- STEP 28 · Incremental analytics refresh (watermark)
-- ============================================================================
-- The STEP-27 refresh rebuilt every rollup from a full scan each run. Correct,
-- but wasteful once orders grow. Now: a watermark on orders' change timestamps
-- (created_at / confirmed_at / reviewed_at / refund initiated_at) selects only
-- "dirty" entities; their rollup rows are recomputed wholesale (per-entity
-- re-aggregation → status flips like CONFIRMED→REFUNDED still correct).
-- p_full=true forces a complete rebuild (weekly cron safety net).

create table if not exists analytics.refresh_state (
  key        text primary key,
  watermark  timestamptz not null default '1970-01-01'::timestamptz
);
insert into analytics.refresh_state (key, watermark) values ('orders', '1970-01-01')
on conflict (key) do nothing;

-- RLS on rollup tables — access already restricted to service_role via grants
-- and the schema is not exposed in PostgREST; RLS is defense-in-depth in case
-- the schema is ever added to db-schema or grants widen.
alter table analytics.daily_metrics      enable row level security;
alter table analytics.user_activity_days enable row level security;
alter table analytics.user_order_stats   enable row level security;
alter table analytics.organizer_rollup   enable row level security;
alter table analytics.event_rollup       enable row level security;
alter table analytics.totals             enable row level security;
alter table analytics.refresh_state      enable row level security;

drop function if exists public.refresh_analytics_rollups(integer);

create or replace function public.refresh_analytics_rollups(
  p_days integer default 90,
  p_full boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, analytics
as $$
declare
  v_watermark timestamptz;
  v_new_watermark timestamptz;
begin
  v_watermark := case when p_full then '1970-01-01'::timestamptz
                      else (select watermark from analytics.refresh_state where key = 'orders') end;

  -- Snapshot of changed orders since the watermark. Confirmed_at and
  -- reviewed_at capture post-creation status flips; refunds.initiated_at
  -- catches CONFIRMED→REFUNDED.
  create temp table _dirty_orders on commit drop as
  select o.* from public.orders o
   where greatest(
           o.created_at,
           coalesce(o.confirmed_at, o.created_at),
           coalesce(o.reviewed_at,  o.created_at)
         ) > v_watermark
  union
  select o.* from public.orders o
    join public.refunds r on r.order_id = o.id
   where r.initiated_at > v_watermark;

  select max(ts) into v_new_watermark from (
    select greatest(created_at, coalesce(confirmed_at, created_at), coalesce(reviewed_at, created_at)) ts
      from _dirty_orders
    union all
    select r.initiated_at from public.refunds r where r.initiated_at > v_watermark
  ) t;
  v_new_watermark := coalesce(v_new_watermark, v_watermark);

  -- ---- daily_metrics: rebuild only touched days (+ always today) ----------
  create temp table _dirty_days on commit drop as
  select distinct d::date as day from (
    select created_at from _dirty_orders
    union all select confirmed_at from _dirty_orders where confirmed_at is not null
    union all select reviewed_at  from _dirty_orders where reviewed_at  is not null
  ) x(d)
  union select current_date;  -- always refresh today's partial bucket

  delete from analytics.daily_metrics
   where day in (select day from _dirty_days);

  insert into analytics.daily_metrics (
    day, signups, new_organizers, dau,
    orders_created, orders_confirmed,
    gross_paise, buyer_paid_paise, commission_paise,
    convenience_fee_paise, platform_fee_paise, organizer_payout_paise,
    refreshed_at
  )
  select
    dd.day,
    coalesce(s.cnt, 0), coalesce(o.cnt, 0), coalesce(a.dau, 0),
    coalesce(oc.cnt, 0), coalesce(cn.cnt, 0),
    coalesce(cn.gross, 0), coalesce(cn.paid, 0), coalesce(cn.comm, 0),
    coalesce(cn.conv, 0), coalesce(cn.fee, 0), coalesce(cn.payout, 0),
    now()
  from _dirty_days dd
  left join (
    select created_at::date as day, count(*) cnt from public.profiles group by 1
  ) s on s.day = dd.day
  left join (
    select created_at::date as day, count(*) cnt from public.organizers group by 1
  ) o on o.day = dd.day
  left join (
    select created_at::date as day, count(distinct user_id) dau
      from public.orders where user_id is not null group by 1
  ) a on a.day = dd.day
  left join (
    select created_at::date as day, count(*) cnt from public.orders group by 1
  ) oc on oc.day = dd.day
  left join (
    select created_at::date as day,
           count(*) cnt,
           sum(subtotal_paise) gross,
           sum(total_paise) paid,
           sum(commission_paise) comm,
           sum(convenience_fee_paise) conv,
           sum(platform_fee_paise) fee,
           sum(organizer_payout_paise) payout
      from public.orders where status = 'CONFIRMED' group by 1
  ) cn on cn.day = dd.day;

  -- ---- user_activity_days: rebuild touched days --------------------------
  delete from analytics.user_activity_days
   where day in (select day from _dirty_days);
  insert into analytics.user_activity_days (day, user_id)
  select distinct created_at::date, user_id
    from public.orders
   where user_id is not null
     and created_at::date in (select day from _dirty_days);

  -- ---- per-user stats: recompute only users with changed orders ----------
  create temp table _dirty_users on commit drop as
    select distinct user_id from _dirty_orders where user_id is not null;

  delete from analytics.user_order_stats where user_id in (select user_id from _dirty_users);
  insert into analytics.user_order_stats (user_id, confirmed_orders, last_order_day, refreshed_at)
  select user_id, count(*) filter (where status = 'CONFIRMED'),
         max(created_at)::date, now()
    from public.orders
   where user_id in (select user_id from _dirty_users)
   group by user_id;

  -- ---- per-event / per-organizer: recompute only touched entities --------
  create temp table _dirty_events on commit drop as
    select distinct event_id from _dirty_orders;
  create temp table _dirty_orgs on commit drop as
    select distinct e.organizer_id
      from _dirty_events de join public.events e on e.id = de.event_id;

  delete from analytics.event_rollup where event_id in (select event_id from _dirty_events);
  insert into analytics.event_rollup (
    event_id, organizer_id, confirmed_orders, gross_paise, buyer_paid_paise,
    commission_paise, convenience_fee_paise, platform_fee_paise,
    organizer_payout_paise, refreshed_at
  )
  select o.event_id, e.organizer_id,
         count(*) filter (where o.status = 'CONFIRMED'),
         coalesce(sum(o.subtotal_paise)          filter (where o.status='CONFIRMED'), 0),
         coalesce(sum(o.total_paise)             filter (where o.status='CONFIRMED'), 0),
         coalesce(sum(o.commission_paise)        filter (where o.status='CONFIRMED'), 0),
         coalesce(sum(o.convenience_fee_paise)   filter (where o.status='CONFIRMED'), 0),
         coalesce(sum(o.platform_fee_paise)      filter (where o.status='CONFIRMED'), 0),
         coalesce(sum(o.organizer_payout_paise)  filter (where o.status='CONFIRMED'), 0),
         now()
    from public.orders o
    join public.events e on e.id = o.event_id
   where o.event_id in (select event_id from _dirty_events)
   group by o.event_id, e.organizer_id;

  delete from analytics.organizer_rollup where organizer_id in (select organizer_id from _dirty_orgs);
  insert into analytics.organizer_rollup (organizer_id, event_count, confirmed_revenue_paise, refreshed_at)
  select e.organizer_id,
         count(distinct o.event_id) filter (where o.status = 'CONFIRMED'),
         coalesce(sum(o.subtotal_paise) filter (where o.status = 'CONFIRMED'), 0),
         now()
    from public.orders o
    join public.events e on e.id = o.event_id
   where e.organizer_id in (select organizer_id from _dirty_orgs)
   group by e.organizer_id;

  -- ---- totals: always recompute (5 aggregate queries — cheap) ------------
  update analytics.totals set
    total_payments        = (select count(*) from public.orders),
    confirmed_payments    = (select count(*) from public.orders where status = 'CONFIRMED'),
    total_volume_paise    = (select coalesce(sum(total_paise),0) from public.orders where status = 'CONFIRMED'),
    avg_order_value_paise = (select coalesce(round(avg(total_paise)),0) from public.orders where status = 'CONFIRMED'),
    active_users          = (select count(*) from analytics.user_order_stats where confirmed_orders >= 1),
    returning_users       = (select count(*) from analytics.user_order_stats where confirmed_orders >= 2),
    non_returning_users   = (select count(*) from analytics.user_order_stats where confirmed_orders = 1),
    mau                   = (select count(distinct user_id) from analytics.user_activity_days where day >= current_date - 30),
    payment_methods       = coalesce((
      select jsonb_agg(jsonb_build_object('method', coalesce(payment_method,'unknown'), 'count', cnt, 'volumePaise', vol))
        from (select payment_method, count(*) cnt, sum(total_paise) vol
                from public.orders where status = 'CONFIRMED' group by payment_method) m
    ), '[]'::jsonb),
    refreshed_at          = now()
  where id = 1;

  update analytics.refresh_state set watermark = v_new_watermark where key = 'orders';
end;
$$;

revoke all on function public.refresh_analytics_rollups(integer, boolean) from public, anon, authenticated;
grant execute on function public.refresh_analytics_rollups(integer, boolean) to service_role;

-- ============================================================================
-- STEP 29 · Notification outbox (transactional external delivery seam)
-- ============================================================================
-- In-app notifications are already atomic — definer RPCs insert
-- event_notifications rows inside the payment/order transaction. External
-- channels (push/email/whatsapp) would otherwise fire post-commit from app
-- code and can be lost on crash. The outbox makes them durable:
-- sendNotification enqueues a row (same abstraction), a cron-called drain
-- claims batches and delivers. Rows self-expire after 24h so enabling a push
-- provider months later doesn't blast stale notifications.

create table if not exists public.notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  event_id        uuid references public.events(id) on delete set null,
  type            text not null,
  title           text,
  message         text not null,
  channel         text not null check (channel in ('push','email','whatsapp')),
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'PENDING'
                  check (status in ('PENDING','SENDING','SENT','FAILED','EXPIRED')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists notification_outbox_due_idx
  on public.notification_outbox (status, next_attempt_at) where status = 'PENDING';

alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from public, anon, authenticated;
grant all on public.notification_outbox to service_role;

-- Enqueue one external-channel delivery. Called by sendNotification when a
-- non-in-app channel is requested. Service-role only.
create or replace function public.enqueue_notification_outbox(
  p_user_id  uuid,
  p_event_id uuid,
  p_type     text,
  p_title    text,
  p_message  text,
  p_channel  text,
  p_payload  jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notification_outbox
    (user_id, event_id, type, title, message, channel, payload)
  values (p_user_id, p_event_id, p_type, p_title, p_message, p_channel, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.enqueue_notification_outbox(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_notification_outbox(uuid, uuid, text, text, text, text, jsonb) to service_role;

-- Atomically claim a batch of due notifications for delivery.
-- SKIP LOCKED lets multiple drainers run without double-delivery.
create or replace function public.claim_notification_outbox(p_batch integer default 50)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Anything undelivered after 24h is stale — expire it.
  update public.notification_outbox
     set status = 'EXPIRED', updated_at = now()
   where status in ('PENDING','SENDING')
     and created_at < now() - interval '24 hours';

  return query
    update public.notification_outbox o
       set status = 'SENDING', attempts = o.attempts + 1, updated_at = now()
     where o.id in (
       select id from public.notification_outbox
        where status = 'PENDING' and next_attempt_at <= now()
        order by created_at
        limit p_batch
        for update skip locked
     )
    returning o.*;
end;
$$;
revoke all on function public.claim_notification_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_outbox(integer) to service_role;

-- Complete a claimed row. Success → SENT. Failure → back to PENDING with
-- quadratic backoff (attempts² minutes); FAILED permanently after 5 attempts.
create or replace function public.complete_notification_outbox(
  p_id      uuid,
  p_success boolean,
  p_error   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
begin
  select attempts into v_attempts from public.notification_outbox where id = p_id;
  if not found then return; end if;

  if p_success then
    update public.notification_outbox
       set status = 'SENT', last_error = null, updated_at = now()
     where id = p_id;
  elsif v_attempts >= 5 then
    update public.notification_outbox
       set status = 'FAILED', last_error = p_error, updated_at = now()
     where id = p_id;
  else
    update public.notification_outbox
       set status = 'PENDING',
           last_error = p_error,
           next_attempt_at = now() + (v_attempts * v_attempts || ' minutes')::interval,
           updated_at = now()
     where id = p_id;
  end if;
end;
$$;
revoke all on function public.complete_notification_outbox(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.complete_notification_outbox(uuid, boolean, text) to service_role;

-- ============================================================================
-- STEP 30 · Admin notification types
-- ============================================================================
-- Admin-facing notification types so pending queues (KYC submissions, boost
-- requests, door-staff payments) surface in the bell for every admin.

do $$ begin alter type public.event_notification_type add value if not exists 'KYC_SUBMITTED'; exception when others then null; end $$;
do $$ begin alter type public.event_notification_type add value if not exists 'BOOST_REQUESTED'; exception when others then null; end $$;
do $$ begin alter type public.event_notification_type add value if not exists 'DOOR_STAFF_REQUESTED'; exception when others then null; end $$;
do $$ begin alter type public.event_notification_type add value if not exists 'KYC_CHANGE_REQUESTED'; exception when others then null; end $$;

-- ============================================================================
-- STEP 31 · KYC message thread
-- ============================================================================
-- Communication history between organizer and admin during KYC review.
-- Admin review card + organizer review panel both render this timeline.

create table if not exists public.kyc_messages (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  sender_role  text not null check (sender_role in ('admin','organizer','system')),
  sender_email text,
  message      text not null,
  created_at   timestamptz not null default now()
);
create index if not exists kyc_messages_org_idx on public.kyc_messages(organizer_id, created_at);

alter table public.kyc_messages enable row level security;

-- Organizer reads own thread; admin reads all; writes happen via service role
-- (actions verify the caller before inserting).
drop policy if exists "organizer reads own kyc thread" on public.kyc_messages;
create policy "organizer reads own kyc thread" on public.kyc_messages
  for select to authenticated
  using (exists (
    select 1 from public.organizers o
    where o.id = organizer_id and o.owner_id = auth.uid()
  ));

drop policy if exists "admin reads all kyc threads" on public.kyc_messages;
create policy "admin reads all kyc threads" on public.kyc_messages
  for select to authenticated
  using (public.is_current_user_admin());

revoke insert, update, delete on public.kyc_messages from anon, authenticated;
grant all on public.kyc_messages to service_role;

-- ============================================================================
-- STEP 32 · Money-table security lockdown (P0)
-- ============================================================================
-- anon/authenticated held table-level INSERT/UPDATE/DELETE on money tables via
-- Supabase default grants, plus unconstrained RLS policies — an event manager
-- could UPDATE orders SET status='CONFIRMED', mint tickets, or mark a refund
-- COMPLETED via PostgREST. All money mutations now flow through SECURITY
-- DEFINER RPCs (internal authz) or service_role only.

-- 1. Revoke write grants on money tables
revoke insert, update, delete on public.orders          from anon, authenticated;
revoke insert, update, delete on public.tickets         from anon, authenticated;
revoke insert, update, delete on public.refunds         from anon, authenticated;
revoke insert, update, delete on public.payment_ledger  from anon, authenticated;
revoke insert, update, delete on public.payout_records  from anon, authenticated;
revoke insert, update, delete on public.webhook_events  from anon, authenticated;

grant insert, update, delete on public.orders          to service_role;
grant insert, update, delete on public.tickets         to service_role;
grant insert, update, delete on public.refunds         to service_role;
grant insert, update, delete on public.payment_ledger  to service_role;
grant insert, update, delete on public.payout_records  to service_role;
grant insert, update, delete on public.webhook_events  to service_role;

-- 2. Drop unconstrained write policies (SELECT policies stay)
drop policy if exists "buyers create their own orders"      on public.orders;
drop policy if exists "organizer updates orders"            on public.orders;
drop policy if exists "organizer creates tickets"           on public.tickets;
drop policy if exists "organizer updates tickets"           on public.tickets;
drop policy if exists "organizers can create refunds"       on public.refunds;
drop policy if exists "organizers can update refund status" on public.refunds;
drop policy if exists "admins insert refunds"               on public.refunds;
drop policy if exists "admin insert payouts"                on public.payout_records;
drop policy if exists "admin update payouts"                on public.payout_records;
drop policy if exists "admin update webhook events"         on public.webhook_events;

-- 3. ticket_tiers — organizers manage tiers via direct table writes (policies
--    scope rows to their events; INSERT/DELETE stay). UPDATE restricted to
--    safe columns only: quantity_sold / quantity_reserved are RPC-only.
revoke update on public.ticket_tiers from anon, authenticated;
grant update (name, price_paise, quantity, perks, sort_order,
              tier_type, phase_order, phase_opens_at, phase_closes_at)
  on public.ticket_tiers to authenticated;

-- Hard floor: reserved + sold can never exceed capacity
alter table public.ticket_tiers drop constraint if exists ticket_tiers_capacity_check;
alter table public.ticket_tiers add constraint ticket_tiers_capacity_check
  check (quantity_sold >= 0 and quantity_reserved >= 0
         and quantity_sold + quantity_reserved <= quantity);

-- 4. Legacy manual-UPI create_paid_order overloads — removed entirely.
--    (Razorpay path uses create_reserved_order; free uses create_free_order.)
do $$
declare r record;
begin
  for r in
    select p.oid, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_paid_order'
  loop
    execute format('drop function public.create_paid_order(%s)', r.args);
  end loop;
end $$;

-- 5. Money RPC execute-scoping.
--    Service-only (cron/webhook/admin): confirmations, failure, expiry.
revoke execute on function public.confirm_razorpay_order(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.fail_razorpay_order(uuid)    from public, anon, authenticated;
revoke execute on function public.set_razorpay_order_id(uuid, text) from public, anon, authenticated;
revoke execute on function public.expire_reserved_orders()     from public, anon, authenticated;
grant  execute on function public.confirm_razorpay_order(uuid, text, text, text) to service_role;
grant  execute on function public.fail_razorpay_order(uuid)    to service_role;
grant  execute on function public.set_razorpay_order_id(uuid, text) to service_role;
grant  execute on function public.expire_reserved_orders()     to service_role;

--    User-facing but internally gated → authenticated only (never anon/public).
do $$ begin if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_reserved_order' and p.pronargs=8) then
    revoke execute on function public.create_reserved_order(uuid, uuid, integer, text, text, text, text, text) from public, anon;
  end if; end $$;
revoke execute on function public.cancel_event(uuid, text, integer) from public, anon;
revoke execute on function public.request_postponement_refund(uuid, uuid) from public, anon;
do $$ begin if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_reserved_order' and p.pronargs=8) then
    grant execute on function public.create_reserved_order(uuid, uuid, integer, text, text, text, text, text) to authenticated;
  end if; end $$;
grant  execute on function public.cancel_event(uuid, text, integer) to authenticated;
grant  execute on function public.request_postponement_refund(uuid, uuid) to authenticated;

--    Legacy manual-verification RPCs stay authenticated — they self-authorize
--    via auth.uid() + is_event_staff inside the definer body.
revoke execute on function public.approve_order(uuid)        from public, anon;
revoke execute on function public.reject_order(uuid, text)   from public, anon;


-- =============================================================================
-- STEP 38 — collaborator permission model rework
--
-- Old levels: VIEW_ONLY | ANALYTICS | SCAN | FULL
-- New levels: LIMITED | ANALYTICS | FULL
--   LIMITED   — view + orders + analytics (no money) + door-staff/scanner/
--               box-office PINs + event staff + walk-in/scan
--   ANALYTICS — LIMITED + full analytics incl. money
--   FULL      — ANALYTICS + edit event (never timing/venue/city; the app layer
--               strips those fields for collaborators)
--
-- Owner-only forever: delete, cancel, postpone, timing, venue, city.
--
-- Mechanism: is_event_staff() now includes accepted collaborators (drives
-- orders/tickets/staff/pins access). Money-adjacent tier writes repoint to a
-- new is_event_owner() so collaborators can never touch tiers directly.
-- =============================================================================

-- 1. Remap legacy permission levels
update public.event_collaborators
   set permission_level = 'LIMITED'
 where permission_level in ('VIEW_ONLY', 'SCAN');

-- 2. is_event_owner — owner or admin (the old is_event_staff body)
create or replace function public.is_event_owner(p_event_id uuid)
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

-- 3. is_event_staff v2 — owner/admin OR an accepted collaborator
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
  ) or public.is_current_user_admin()
     or exists (
    select 1
    from public.event_collaborators ec
    join public.organizers co on co.id = ec.organizer_id
    where ec.event_id = p_event_id
      and ec.status = 'ACCEPTED'
      and co.owner_id = auth.uid()
  );
$$;

-- 4. Tiers stay owner-only — collaborators must not write pricing/inventory.
drop policy if exists "tiers organizer insert" on public.ticket_tiers;
drop policy if exists "tiers organizer update" on public.ticket_tiers;
drop policy if exists "tiers organizer delete" on public.ticket_tiers;
create policy "tiers organizer insert" on public.ticket_tiers
  for insert with check (public.is_event_owner(event_id));
create policy "tiers organizer update" on public.ticket_tiers
  for update using (public.is_event_owner(event_id));
create policy "tiers organizer delete" on public.ticket_tiers
  for delete using (public.is_event_owner(event_id));

-- 5. Pin management RPCs — collaborator-aware via is_event_staff.
--    Bodies identical to schema.sql; only the auth checks change.
create or replace function public.generate_scanner_pins(
  p_event_id     uuid,
  p_staff_names  text[],
  p_staff_emails text[] default '{}',
  p_staff_phones text[] default '{}'
)
returns table (pin_code text, staff_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_organizer_id uuid;
  v_name text;
  v_email text;
  v_phone text;
  v_pin text;
  v_hash text;
  v_idx integer := 0;
begin
  select organizer_id into v_organizer_id from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if not public.is_event_staff(p_event_id) then
    raise exception 'Not authorised to manage scanner PINs for this event';
  end if;

  foreach v_name in array p_staff_names loop
    v_idx := v_idx + 1;
    v_email := coalesce(p_staff_emails[v_idx], '');
    v_phone := coalesce(p_staff_phones[v_idx], '');
    loop
      v_pin := lpad((floor(random() * 1000000))::text, 6, '0');
      v_hash := encode(digest(p_event_id::text || ':' || v_pin, 'sha256'), 'hex');
      exit when not exists (
        select 1 from public.scanner_pins sp where sp.event_id = p_event_id and sp.pin_hash = v_hash
      );
    end loop;
    insert into public.scanner_pins (event_id, organizer_id, pin_code, pin_hash, staff_name, staff_email, staff_phone)
    values (p_event_id, v_organizer_id, v_pin, v_hash, v_name, nullif(v_email, ''), nullif(v_phone, ''));
    return query select v_pin, v_name;
  end loop;
end;
$$;

create or replace function public.revoke_scanner_pin(p_pin_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin public.scanner_pins;
begin
  select * into v_pin from public.scanner_pins where id = p_pin_id;
  if not found then return false; end if;
  if not public.is_event_staff(v_pin.event_id) then
    raise exception 'Not authorised to revoke this PIN';
  end if;
  update public.scanner_pins set is_active = false where id = p_pin_id;
  return true;
end;
$$;

create or replace function public.generate_box_office_pins(
  p_event_id    uuid,
  p_staff_names text[],
  p_role        text default 'ORGANIZER'
)
returns table (pin_code text, staff_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_organizer_id uuid;
  v_name text;
  v_pin text;
  v_hash text;
begin
  select organizer_id into v_organizer_id from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  -- ADMIN role stays admin-only; ORGANIZER pins allow event staff incl. collaborators.
  if p_role = 'ADMIN' then
    if not public.is_current_user_admin() then
      raise exception 'Not authorised to create admin box office PINs';
    end if;
  else
    if not public.is_event_staff(p_event_id) then
      raise exception 'Not authorised to manage box office PINs for this event';
    end if;
  end if;

  foreach v_name in array p_staff_names loop
    loop
      v_pin := lpad((floor(random() * 1000000))::text, 6, '0');
      v_hash := encode(digest(p_event_id::text || ':' || v_pin, 'sha256'), 'hex');
      exit when not exists (
        select 1 from public.box_office_pins bp where bp.event_id = p_event_id and bp.pin_hash = v_hash
      );
    end loop;
    insert into public.box_office_pins (event_id, organizer_id, pin_code, pin_hash, staff_name, role)
    values (p_event_id, v_organizer_id, v_pin, v_hash, v_name, p_role);
    return query select v_pin, v_name;
  end loop;
end;
$$;

create or replace function public.revoke_box_office_pin(p_pin_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin public.box_office_pins;
begin
  select * into v_pin from public.box_office_pins where id = p_pin_id;
  if not found then return false; end if;
  if not public.is_event_staff(v_pin.event_id) then
    raise exception 'Not authorised to revoke this PIN';
  end if;
  update public.box_office_pins set is_active = false where id = p_pin_id;
  return true;
end;
$$;

-- 6. RLS — collaborators get event-scoped access to staff + pin tables.
--    Owner policies stay; these add the collaborator path.

drop policy if exists "collab read event staff" on public.event_staff;
create policy "collab read event staff" on public.event_staff
  for select using (public.is_event_staff(event_id));

drop policy if exists "collab insert event staff" on public.event_staff;
create policy "collab insert event staff" on public.event_staff
  for insert with check (public.is_event_staff(event_id));

drop policy if exists "collab delete event staff" on public.event_staff;
create policy "collab delete event staff" on public.event_staff
  for delete using (public.is_event_staff(event_id));

drop policy if exists "collab read scanner pins" on public.scanner_pins;
create policy "collab read scanner pins" on public.scanner_pins
  for select using (public.is_event_staff(event_id));

drop policy if exists "collab insert scanner pins" on public.scanner_pins;
create policy "collab insert scanner pins" on public.scanner_pins
  for insert with check (public.is_event_staff(event_id));

drop policy if exists "collab update scanner pins" on public.scanner_pins;
create policy "collab update scanner pins" on public.scanner_pins
  for update using (public.is_event_staff(event_id));

drop policy if exists "collab read box office pins" on public.box_office_pins;
create policy "collab read box office pins" on public.box_office_pins
  for select using (public.is_event_staff(event_id));

drop policy if exists "collab insert box office pins" on public.box_office_pins;
create policy "collab insert box office pins" on public.box_office_pins
  for insert with check (public.is_event_staff(event_id));

drop policy if exists "collab update box office pins" on public.box_office_pins;
create policy "collab update box office pins" on public.box_office_pins
  for update using (public.is_event_staff(event_id));


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
DROP FUNCTION IF EXISTS public.create_reserved_order(uuid, uuid, integer, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.create_reserved_order(p_event_id uuid, p_tier_id uuid, p_quantity integer, p_idempotency_key text DEFAULT NULL::text, p_buyer_name text DEFAULT NULL::text, p_buyer_phone text DEFAULT NULL::text, p_buyer_email text DEFAULT NULL::text, p_buyer_gender text DEFAULT NULL::text, p_invite_token text DEFAULT NULL::text)
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

  -- STEP 45: community event gating
  if coalesce(v_event.visibility, 'OPEN') = 'MEMBERS_ONLY' then
    if not exists (
      select 1 from public.community_members
      where community_id = v_event.community_id and user_id = auth.uid() and status = 'ACCEPTED'
    ) then
      raise exception 'MEMBERS_ONLY: This event is for community members only. Join the community first.';
    end if;
  elsif coalesce(v_event.visibility, 'OPEN') = 'INVITE_ONLY' then
    if coalesce(p_invite_token, '') is distinct from coalesce(v_event.invite_token, '')
       and not exists (
         select 1 from public.community_members
         where community_id = v_event.community_id and user_id = auth.uid() and status = 'ACCEPTED'
       ) then
      raise exception 'INVITE_REQUIRED: This event is invite-only. Open it via the shared link.';
    end if;
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
    v_total, v_fee_payer::fee_payer, 'RESERVED', 'ONLINE',
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
$function$;


-- ---------------------------------------------------------------------------
-- create_free_order — same cap for free RSVPs.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_free_order(uuid, uuid, integer, text, text, text, text);
DROP FUNCTION IF EXISTS public.create_free_order(uuid, uuid, integer, text, text);
CREATE OR REPLACE FUNCTION public.create_free_order(p_event_id uuid, p_tier_id uuid, p_quantity integer, p_buyer_name text DEFAULT NULL::text, p_buyer_phone text DEFAULT NULL::text, p_buyer_email text DEFAULT NULL::text, p_buyer_gender text DEFAULT NULL::text, p_invite_token text DEFAULT NULL::text)
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

  -- STEP 45: community event gating
  if coalesce(v_event.visibility, 'OPEN') = 'MEMBERS_ONLY' then
    if not exists (
      select 1 from public.community_members
      where community_id = v_event.community_id and user_id = auth.uid() and status = 'ACCEPTED'
    ) then
      raise exception 'MEMBERS_ONLY: This event is for community members only. Join the community first.';
    end if;
  elsif coalesce(v_event.visibility, 'OPEN') = 'INVITE_ONLY' then
    if coalesce(p_invite_token, '') is distinct from coalesce(v_event.invite_token, '')
       and not exists (
         select 1 from public.community_members
         where community_id = v_event.community_id and user_id = auth.uid() and status = 'ACCEPTED'
       ) then
      raise exception 'INVITE_REQUIRED: This event is invite-only. Open it via the shared link.';
    end if;
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
    coalesce(v_event.fee_payer, 'BUYER')::fee_payer, 'CONFIRMED', p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender
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
  from generate_series(1, p_quantity * greatest(1, coalesce(v_tier.admits, 1))) g;

  update public.ticket_tiers
     set quantity_sold = quantity_sold + p_quantity
   where id = p_tier_id;

  update public.events
     set registrations_count = registrations_count + p_quantity * greatest(1, coalesce(v_tier.admits, 1))
   where id = p_event_id;

  delete from public.waitlist
   where tier_id = p_tier_id and user_id = auth.uid();

  return v_order;
end;
$function$;


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
$function$;



-- =============================================================================
-- STEP 40 — payment.failed is PER-ATTEMPT, not terminal
--
-- Razorpay fires payment.failed for EVERY failed attempt inside the same
-- checkout session (with retry enabled the modal stays open and the user
-- picks another method). Failing the order/intent on the first attempt meant:
--   attempt 1 fails → order FAILED → attempt 2 captures → dispatcher sees a
--   dead order → late-capture auto-refund → phantom "refund initiated".
--
-- New semantics: payment.failed records the attempt for ops visibility but
-- leaves the order RESERVED and the intent CREATED. Terminal states are only:
--   payment.captured        → confirm/dispatch
--   reservation TTL expiry  → sweep releases inventory
--   explicit user dismiss   → client failure action
-- A capture that lands after TTL expiry still takes the auto-refund path —
-- which is correct there (money arrived after we gave up the hold).
-- =============================================================================

alter table public.payment_intents
  add column if not exists failed_attempts integer not null default 0,
  add column if not exists last_error text;

create or replace function public.apply_failed_payment(
  p_razorpay_order_id text,
  p_error text default null
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

  -- Per-attempt bookkeeping only — the order/intent stay open so a retry
  -- inside the same checkout session can still capture.
  update public.payment_intents
     set failed_attempts = failed_attempts + 1,
         last_error = left(coalesce(p_error, 'payment.failed'), 500),
         updated_at = now()
   where id = v_intent.id;

  return 'ATTEMPT_RECORDED:' || v_intent.kind;
end;
$$;

drop function if exists public.apply_failed_payment(text);
revoke execute on function public.apply_failed_payment(text, text) from public, anon, authenticated;
grant execute on function public.apply_failed_payment(text, text) to service_role;


-- =============================================================================
-- STEP 41 — abandon_payment: terminal release for user-dismissed checkout
--
-- STEP 40 made apply_failed_payment non-terminal (correct for per-attempt
-- webhook events). But the client dismiss path called the same RPC, so a
-- user who cancelled the modal got "reservation released" while the hold
-- actually stayed until the TTL cron ran. This RPC is the terminal path:
--   order RESERVED → FAILED + quantity_reserved released immediately
--   intent → FAILED
-- Still safe against races: if the payment already captured (PAID intent),
-- the abandon is a no-op and the capture path wins.
-- =============================================================================

create or replace function public.abandon_payment(
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

  -- Capture already landed — the webhook/callback owns the outcome now.
  if v_intent.status = 'PAID' then return 'ALREADY_PAID'; end if;

  if v_intent.kind = 'TICKET_ORDER' then
    -- fail_razorpay_order: RESERVED → FAILED + releases quantity_reserved
    -- back onto the tier. Idempotent — no-op if not RESERVED.
    perform public.fail_razorpay_order(v_intent.ref_id);
  end if;
  -- Other kinds (boosts, door staff, clubs): the ref row stays PENDING and
  -- inert — nothing activates it without a captured intent.

  update public.payment_intents
     set status = 'FAILED', updated_at = now()
   where id = v_intent.id and status <> 'PAID';

  return 'ABANDONED:' || v_intent.kind;
end;
$$;

revoke execute on function public.abandon_payment(text) from public, anon, authenticated;
grant execute on function public.abandon_payment(text) to service_role;

-- ---------------------------------------------------------------------------
-- ORGANIZER PREMIUM — paid analytics subscription for organizers.
-- organizers.premium_until gates premium analytics; premium purchases ride the
-- same payment_intents -> Razorpay -> apply_captured_payment pipeline as boosts.
-- ---------------------------------------------------------------------------

alter table public.organizers add column if not exists premium_until timestamptz;

create table if not exists public.organizer_premium_purchases (
  id                  uuid        primary key default gen_random_uuid(),
  organizer_id        uuid        not null references public.organizers(id) on delete cascade,
  user_id             uuid        not null references public.profiles(id) on delete cascade,
  months              integer     not null check (months in (3,6,12)),
  amount_paise        integer     not null check (amount_paise > 0),
  status              text        not null default 'PENDING' check (status in ('PENDING','PAID','CANCELLED','EXPIRED')),
  created_at          timestamptz not null default now(),
  paid_at             timestamptz
);
create index if not exists premium_purchases_org_idx on public.organizer_premium_purchases(organizer_id);

alter table public.organizer_premium_purchases enable row level security;
drop policy if exists premium_purchases_select_own on public.organizer_premium_purchases;
create policy premium_purchases_select_own on public.organizer_premium_purchases
  for select to authenticated
  using (user_id = auth.uid());
-- No direct insert/update: purchases are created + paid only through RPCs.

-- Premium settings: gate flag (0 = free for all) + per-plan prices in paise.
insert into public.platform_settings (key, value, description) values
  ('premium_analytics_gate',    'false', 'When true, premium analytics require an active organizer premium subscription'),
  ('premium_price_3m_paise',    '49900', 'Organizer premium - 3 months (paise)'),
  ('premium_price_6m_paise',    '89900', 'Organizer premium - 6 months (paise)'),
  ('premium_price_12m_paise',   '149900','Organizer premium - 12 months (paise)')
on conflict (key) do nothing;

-- payment_intents.kind check -> add ORGANIZER_PREMIUM.
alter table public.payment_intents drop constraint if exists payment_intents_kind_check;
alter table public.payment_intents
  add constraint payment_intents_kind_check
  check (kind in ('TICKET_ORDER','HERO_BOOST','SLOT_BOOST','DOOR_STAFF','CLUB_MEMBERSHIP','ORGANIZER_PREMIUM'));

-- payment_ledger.type check -> add PREMIUM_SALE.
alter table public.payment_ledger drop constraint if exists payment_ledger_type_check;
alter table public.payment_ledger
  add constraint payment_ledger_type_check
  check (type in ('TICKET_SALE','BOOST_SALE','DOOR_STAFF_SALE','CLUB_FEE','PREMIUM_SALE','REFUND','PAYOUT','ADJUSTMENT'));

-- create_premium_purchase — inserts a PENDING purchase priced server-side from
-- platform_settings. Returns the row so the caller can make a payment intent.
create or replace function public.create_premium_purchase(p_months integer)
returns public.organizer_premium_purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     public.organizers;
  v_amount  integer;
  v_row     public.organizer_premium_purchases;
begin
  if auth.uid() is null then raise exception 'Sign in to continue'; end if;
  if p_months not in (3,6,12) then raise exception 'Invalid plan'; end if;

  select * into v_org from public.organizers where owner_id = auth.uid();
  if not found then raise exception 'Create an organizer profile first'; end if;

  v_amount := public._setting_int('premium_price_' || p_months || 'm_paise', 0);
  if v_amount <= 0 then raise exception 'Plan is not priced'; end if;

  insert into public.organizer_premium_purchases (organizer_id, user_id, months, amount_paise)
  values (v_org.id, auth.uid(), p_months, v_amount)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.create_premium_purchase(integer) from public, anon;
grant  execute on function public.create_premium_purchase(integer) to authenticated;

-- create_payment_intent — add ORGANIZER_PREMIUM resolution.
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
  v_ttl_min integer := public._setting_int('reservation_ttl_minutes', 15);
begin
  if auth.uid() is null then raise exception 'Sign in to continue'; end if;

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
    -- Slot price is PER DAY — multiply by the booked duration (rounded up).
    select bsp.price_paise
           * greatest(1, ceil(extract(epoch from (b.ends_at - b.starts_at)) / 86400)::int),
           o.owner_id
      into v_amount, v_owner
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
      from public.community_members cm
      join public.communities cl on cl.id = cm.community_id
     where cm.id = p_ref_id and cm.status = 'PENDING';
    if not found or v_owner <> auth.uid() then raise exception 'Not authorized'; end if;
    if v_amount is null or v_amount <= 0 then raise exception 'This club is free — no payment needed'; end if;

  elsif p_kind = 'ORGANIZER_PREMIUM' then
    select pp.amount_paise, pp.user_id into v_amount, v_owner
      from public.organizer_premium_purchases pp
     where pp.id = p_ref_id and pp.status = 'PENDING';
    if not found or v_owner <> auth.uid() then raise exception 'Not authorized'; end if;

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

-- apply_captured_payment — dispatcher re-defined with the ORGANIZER_PREMIUM
-- branch appended. Mirrors _step34.sql + the premium arm.
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
  v_months   integer;
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

  -- Amount/currency mismatch -> never confirm, alert admins.
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
    -- expires_at = min(now + duration, event start) - matches activateHeroBoost
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
      -- Slot was taken between checkout and capture -> auto-refund + alert.
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
    update public.community_members
       set status = 'ACCEPTED'
     where id = v_intent.ref_id and status = 'PENDING';
    if found then
      update public.communities set member_count = member_count + 1
       where id = (select community_id from public.community_members where id = v_intent.ref_id);
    end if;
    insert into public.payment_ledger (
      order_id, event_id, organizer_id, type, gross_amount_paise,
      commission_paise, net_platform_paise, razorpay_payment_id, razorpay_fee_paise, notes
    ) values (
      null, null, null, 'CLUB_FEE', v_intent.amount_paise,
      v_intent.amount_paise, v_intent.amount_paise - coalesce(p_fee,0),
      p_razorpay_payment_id, coalesce(p_fee, 0), 'Club membership'
    ) on conflict (razorpay_payment_id) where razorpay_payment_id is not null do nothing;

  elsif v_intent.kind = 'ORGANIZER_PREMIUM' then
    -- Activate the purchase + extend the organizer's premium window
    -- (stacks onto any unexpired time).
    update public.organizer_premium_purchases pp
       set status = 'PAID', paid_at = now()
     where pp.id = v_intent.ref_id and pp.status = 'PENDING'
     returning organizer_id, months into v_org_id, v_months;

    update public.organizers
       set premium_until = greatest(now(), coalesce(premium_until, now()))
                           + make_interval(months => v_months)
     where id = v_org_id;

    insert into public.payment_ledger (
      order_id, event_id, organizer_id, type, gross_amount_paise,
      commission_paise, net_platform_paise, razorpay_payment_id, razorpay_fee_paise, notes
    ) values (
      null, null, v_org_id, 'PREMIUM_SALE', v_intent.amount_paise,
      v_intent.amount_paise, v_intent.amount_paise - coalesce(p_fee,0),
      p_razorpay_payment_id, coalesce(p_fee, 0),
      'Organizer premium - ' || v_months || ' months'
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

-- ---------------------------------------------------------------------------
-- Phase 0 (box-office redesign): counter walk-in sales.
--  - tier REQUIRED: the client amount is no longer trusted
--  - capacity locked (FOR UPDATE) and checked: no oversell
--  - same fee math as online sales (convenience + gateway gross-up)
--  - cash never touches a gateway, so razorpay_fee_paise = 0 and the
--    gateway portion stays with the platform (admin-side revenue)
--  - writes a TICKET_SALE ledger row so payouts and revenue include it
-- ---------------------------------------------------------------------------
create or replace function public.create_walkin_order(
  p_event_id    uuid,
  p_buyer_name  text,
  p_buyer_phone text,
  p_tier_id     uuid    default null,
  p_buyer_email text    default null,
  p_amount_paise integer default 0,
  p_mode        text    default 'WALKIN_PREEVENT',
  p_idempotency_key text default null
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
  v_convenience   integer;
  v_gateway_bps   integer;
  v_gateway       integer;
  v_platform_fee  integer;
  v_total         integer;
  v_payout        integer;
  v_order_id      uuid;
  v_ticket_id     uuid;
  v_ticket_status text;
  v_existing      public.orders;
begin
  -- Idempotency: a repeated client_sale_id returns the original sale.
  if p_idempotency_key is not null then
    select * into v_existing from public.orders
      where idempotency_key = p_idempotency_key limit 1;
    if v_existing.id is not null then
      select id into v_ticket_id from public.tickets where order_id = v_existing.id limit 1;
      return jsonb_build_object(
        'orderId', v_existing.id,
        'ticketId', v_ticket_id,
        'subtotalPaise', v_existing.subtotal_paise,
        'commissionPaise', v_existing.commission_paise,
        'payoutPaise', v_existing.organizer_payout_paise,
        'totalPaise', v_existing.total_paise,
        'ticketStatus', case when v_existing.order_source = 'WALKIN_INSTANT' then 'USED' else 'VALID' end
      );
    end if;
  end if;

  if p_mode not in ('WALKIN_PREEVENT', 'WALKIN_QR', 'WALKIN_INSTANT') then
    raise exception 'Invalid walk-in mode';
  end if;
  if p_tier_id is null then raise exception 'Select a ticket tier'; end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if v_event.status::text not in ('PUBLISHED', 'POSTPONED') then
    raise exception 'This event is not open for sales';
  end if;

  select * into v_tier from public.ticket_tiers
   where id = p_tier_id and event_id = p_event_id
   for update;
  if not found then raise exception 'Tier not found'; end if;
  if v_tier.quantity - v_tier.quantity_sold - coalesce(v_tier.quantity_reserved, 0) < 1 then
    raise exception 'Sold out for this ticket tier';
  end if;

  -- Money: same formulas as create_reserved_order (online), recomputed here.
  v_subtotal    := v_tier.price_paise;
  v_commission  := case when coalesce(v_event.commission_enabled, true)
                        then round(v_subtotal * coalesce(v_event.commission_bps, 1000) / 10000.0)
                        else 0 end;
  v_convenience := case when coalesce(v_event.convenience_fee_enabled, true)
                        then round(v_subtotal * coalesce(v_event.convenience_fee_bps, 200) / 10000.0)
                        else 0 end;
  v_gateway_bps := public._setting_int('gateway_fee_bps', 236);
  v_gateway     := round((v_subtotal + v_convenience) * v_gateway_bps / (10000.0 - v_gateway_bps));
  v_platform_fee := v_commission + v_convenience;
  if coalesce(v_event.fee_payer, 'BUYER') = 'ORGANIZER' then
    v_total  := v_subtotal;
    v_payout := v_subtotal - v_commission - v_convenience - v_gateway;
  else
    v_total  := v_subtotal + v_convenience + v_gateway;
    v_payout := v_subtotal - v_commission;
  end if;

  v_ticket_status := case when p_mode = 'WALKIN_INSTANT' then 'USED' else 'VALID' end;

  update public.ticket_tiers set quantity_sold = quantity_sold + 1
    where id = p_tier_id;

  insert into public.orders (
    event_id, tier_id, user_id, quantity, unit_price_paise,
    subtotal_paise, platform_fee_paise, commission_paise, convenience_fee_paise,
    gateway_fee_paise, organizer_payout_paise, total_paise,
    fee_payer, status, confirmed_at, buyer_name, buyer_phone, buyer_email,
    order_source, is_box_office, idempotency_key
  ) values (
    p_event_id, p_tier_id, null, 1, v_subtotal,
    v_subtotal, v_platform_fee, v_commission, v_convenience,
    v_gateway, v_payout, v_total,
    coalesce(v_event.fee_payer, 'BUYER'), 'CONFIRMED', now(), p_buyer_name, p_buyer_phone, p_buyer_email,
    p_mode, true, p_idempotency_key
  ) returning id into v_order_id;

  insert into public.tickets (
    order_id, event_id, tier_id, user_id, status, qr_hash, checked_in_at
  ) values (
    v_order_id, p_event_id, p_tier_id, null, v_ticket_status::ticket_status, gen_random_uuid()::text,
    case when p_mode = 'WALKIN_INSTANT' then now() else null end
  ) returning id into v_ticket_id;

  if v_subtotal > 0 then
    insert into public.payment_ledger (
      order_id, event_id, organizer_id, type, gross_amount_paise,
      commission_paise, convenience_fee_paise, razorpay_fee_paise,
      net_organizer_paise, net_platform_paise, razorpay_payment_id, notes
    ) values (
      v_order_id, p_event_id, v_event.organizer_id, 'TICKET_SALE', v_subtotal,
      v_commission, v_convenience + v_gateway, 0,
      v_payout, v_platform_fee + v_gateway, null, 'Box office sale'
    );
  end if;

  return jsonb_build_object(
    'orderId', v_order_id,
    'ticketId', v_ticket_id,
    'subtotalPaise', v_subtotal,
    'commissionPaise', v_commission,
    'payoutPaise', v_payout,
    'totalPaise', v_total,
    'ticketStatus', v_ticket_status
  );
end;
$$;

-- create_reserved_order: retire the obsolete 15-arg overload, then set privileges on
-- the 8-arg live signature. Kept at the end so the function exists before these run.
drop function if exists public.create_reserved_order(uuid, uuid, integer, integer, integer, integer, integer, integer, integer, integer, text, text, text, text, text);
revoke execute on function public.create_reserved_order(uuid, uuid, integer, text, text, text, text, text, text) from public, anon;
grant  execute on function public.create_reserved_order(uuid, uuid, integer, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Phase 1 (box-office redesign): named staff registry.
--  - staff_members: admin-owned (ADMIN) or organizer-owned (ORGANIZER)
--  - personal 6-digit PIN, bcrypt-hashed (pgcrypto), shown once on create/reset
--  - staff_event_assignments: which events a staff member may work
--  - RLS on, no policies: only service-role code (server actions) reads or writes
-- ---------------------------------------------------------------------------
create table if not exists public.staff_members (
  id           uuid        primary key default gen_random_uuid(),
  owner_type   text        not null check (owner_type in ('ADMIN', 'ORGANIZER')),
  organizer_id uuid        references public.organizers(id) on delete cascade,
  name         text        not null,
  email        text,
  phone        text        not null,
  pin_hash     text        not null,
  pin_set_at   timestamptz not null default now(),
  is_active    boolean     not null default true,
  created_by   uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint staff_members_owner_chk check (
    (owner_type = 'ADMIN' and organizer_id is null)
    or (owner_type = 'ORGANIZER' and organizer_id is not null)
  )
);
create unique index if not exists staff_members_admin_phone_idx
  on public.staff_members(phone) where owner_type = 'ADMIN';
create unique index if not exists staff_members_org_phone_idx
  on public.staff_members(organizer_id, phone) where owner_type = 'ORGANIZER';

create table if not exists public.staff_event_assignments (
  staff_id   uuid        not null references public.staff_members(id) on delete cascade,
  event_id   uuid        not null references public.events(id) on delete cascade,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  primary key (staff_id, event_id)
);
create index if not exists staff_event_assignments_event_idx on public.staff_event_assignments(event_id);

alter table public.staff_members enable row level security;
alter table public.staff_event_assignments enable row level security;

-- 6-digit PIN from pgcrypto's CSPRNG (no modulo-bias concern at this scale).
create or replace function public._new_staff_pin()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint & 2147483647) % 1000000)::text, 6, '0');
$$;

create or replace function public.staff_register(
  p_owner_type   text,
  p_organizer_id uuid,
  p_name         text,
  p_email        text,
  p_phone        text,
  p_actor        uuid
) returns table (staff_id uuid, pin text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin text := public._new_staff_pin();
  v_id  uuid;
begin
  insert into public.staff_members (owner_type, organizer_id, name, email, phone, pin_hash, created_by)
  values (p_owner_type, p_organizer_id, btrim(p_name), nullif(btrim(coalesce(p_email, '')), ''),
          p_phone, extensions.crypt(v_pin, extensions.gen_salt('bf', 8)), p_actor)
  returning id into v_id;
  return query select v_id, v_pin;
end;
$$;

create or replace function public.staff_reset_pin(p_staff_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin text := public._new_staff_pin();
begin
  update public.staff_members
     set pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 8)), pin_set_at = now()
   where id = p_staff_id;
  if not found then raise exception 'Staff member not found'; end if;
  return v_pin;
end;
$$;

create or replace function public.staff_set_assignment(
  p_staff_id uuid,
  p_event_id uuid,
  p_active   boolean
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
  -- Organizer-owned staff can only work their own organizer's events.
  if v_owner = 'ORGANIZER' and v_org <> v_event_org then
    raise exception 'This staff member can only be assigned to your own events';
  end if;
  insert into public.staff_event_assignments (staff_id, event_id, is_active)
  values (p_staff_id, p_event_id, p_active)
  on conflict (staff_id, event_id) do update set is_active = excluded.is_active;
end;
$$;

-- Privileges: server actions call these with the service role after authorising.
revoke execute on function public._new_staff_pin() from public, anon, authenticated;
revoke execute on function public.staff_register(text, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.staff_reset_pin(uuid) from public, anon, authenticated;
revoke execute on function public.staff_set_assignment(uuid, uuid, boolean) from public, anon, authenticated;
grant  execute on function public.staff_register(text, uuid, text, text, text, uuid) to service_role;
grant  execute on function public.staff_reset_pin(uuid) to service_role;
grant  execute on function public.staff_set_assignment(uuid, uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Phase 2 (box-office redesign): counter sales by named staff (cash channel).
--  - staff_sessions: hashed bearer tokens for counter devices (12h)
--  - orders get sale attribution (who sold, when, through which channel)
--  - cash_handovers: organizer/admin confirm cash given to them, per staff per event
-- ---------------------------------------------------------------------------
create table if not exists public.staff_sessions (
  id           uuid        primary key default gen_random_uuid(),
  staff_id     uuid        not null references public.staff_members(id) on delete cascade,
  token_hash   text        not null unique,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists staff_sessions_staff_idx on public.staff_sessions(staff_id);
alter table public.staff_sessions enable row level security;

alter table public.orders add column if not exists sold_by_staff_id uuid references public.staff_members(id) on delete set null;
alter table public.orders add column if not exists sold_at timestamptz;
alter table public.orders add column if not exists sale_channel text;
create index if not exists orders_sold_by_staff_idx on public.orders(sold_by_staff_id, event_id);

create table if not exists public.cash_handovers (
  id           uuid        primary key default gen_random_uuid(),
  event_id     uuid        not null references public.events(id) on delete cascade,
  staff_id     uuid        not null references public.staff_members(id) on delete cascade,
  amount_paise integer     not null check (amount_paise >= 0),
  order_count  integer     not null check (order_count >= 0),
  confirmed_by uuid        references auth.users(id) on delete set null,
  confirmed_at timestamptz not null default now()
);
create index if not exists cash_handovers_event_staff_idx on public.cash_handovers(event_id, staff_id);
alter table public.cash_handovers enable row level security;

-- Login: phone + personal PIN -> bearer token. Phones can repeat across owners, so
-- every active match is checked against the PIN.
-- (Drop first: the live param names changed to p_identifier/p_password in STEP 44,
--  and CREATE OR REPLACE cannot rename input params.)
drop function if exists public.staff_login_session(text, text);
create or replace function public.staff_login_session(p_phone text, p_pin text)
returns table (token text, staff_id uuid, name text, owner_type text, organizer_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_members;
  v_token text;
begin
  for v_staff in
    select * from public.staff_members where phone = p_phone and is_active = true
  loop
    if extensions.crypt(p_pin, v_staff.pin_hash) = v_staff.pin_hash then
      v_token := encode(extensions.gen_random_bytes(32), 'hex');
      insert into public.staff_sessions (staff_id, token_hash, expires_at)
      values (v_staff.id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '12 hours');
      return query select v_token, v_staff.id, v_staff.name, v_staff.owner_type, v_staff.organizer_id;
      return;
    end if;
  end loop;
  return;
end;
$$;

-- Resolve a bearer token to an active staff member (or nothing).
create or replace function public.staff_session_staff(p_token text)
returns table (staff_id uuid, name text, owner_type text, organizer_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.staff_sessions;
begin
  select * into v_session from public.staff_sessions
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and expires_at > now();
  if not found then return; end if;
  update public.staff_sessions set last_used_at = now() where id = v_session.id;
  return query
    select s.id, s.name, s.owner_type, s.organizer_id
      from public.staff_members s
     where s.id = v_session.staff_id and s.is_active = true;
end;
$$;

-- Counter cash sale: the normal walk-in pricing and capacity rules, plus attribution.
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

-- Cash still held by a staff member for an event (sales minus confirmed handovers).
create or replace function public.staff_cash_outstanding(p_staff_id uuid, p_event_id uuid)
returns table (order_count bigint, amount_paise bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(*) from public.orders o
      where o.sold_by_staff_id = p_staff_id and o.event_id = p_event_id and o.sale_channel = 'COUNTER_CASH'),
    (select coalesce(sum(o.total_paise), 0) from public.orders o
      where o.sold_by_staff_id = p_staff_id and o.event_id = p_event_id and o.sale_channel = 'COUNTER_CASH')
    - (select coalesce(sum(h.amount_paise), 0) from public.cash_handovers h
        where h.staff_id = p_staff_id and h.event_id = p_event_id);
$$;

-- Organizer/admin confirms the cash handed over. Amount is computed here, never supplied.
create or replace function public.confirm_cash_handover(
  p_staff_id uuid,
  p_event_id uuid,
  p_actor    uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count  bigint;
  v_amount bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_staff_id::text || ':' || p_event_id::text, 0));
  select order_count, amount_paise into v_count, v_amount
    from public.staff_cash_outstanding(p_staff_id, p_event_id);
  if v_amount is null or v_amount <= 0 then
    raise exception 'No cash is outstanding for this staff member and event';
  end if;
  insert into public.cash_handovers (event_id, staff_id, amount_paise, order_count, confirmed_by)
  values (p_event_id, p_staff_id, v_amount, v_count, p_actor);
  return v_amount::integer;
end;
$$;

revoke execute on function public.staff_login_session(text, text) from public, anon, authenticated;
revoke execute on function public.staff_session_staff(text) from public, anon, authenticated;
revoke execute on function public.create_counter_cash_sale(uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.staff_cash_outstanding(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.confirm_cash_handover(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function public.staff_login_session(text, text) to service_role;
grant  execute on function public.staff_session_staff(text) to service_role;
grant  execute on function public.create_counter_cash_sale(uuid, uuid, uuid, text, text, text, text, text) to service_role;
grant  execute on function public.staff_cash_outstanding(uuid, uuid) to service_role;
grant  execute on function public.confirm_cash_handover(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Phase 3 (box-office redesign): scan attribution and event-scoped scanner sessions.
--  - scan_log: one row per scan attempt (append-only in practice), with who scanned
--    and the device time. client_scan_id makes replays idempotent (Phase 4 relies on it).
--  - scanner_sessions: hashed bearer tokens minted by a door PIN for ONE event (12h).
--    The door device sends the token, never the PIN, after login.
--  - WRONG_EVENT: a ticket for a different event is reported, not hidden as INVALID.
-- ---------------------------------------------------------------------------
create table if not exists public.scan_log (
  id             uuid        primary key default gen_random_uuid(),
  event_id       uuid        not null references public.events(id) on delete cascade,
  ticket_id      uuid        references public.tickets(id) on delete set null,
  qr_hash        text        not null,
  outcome        text        not null check (outcome in ('VALID','ALREADY_USED','INVALID','WRONG_EVENT','CANCELLED','DUPLICATE_CONFLICT')),
  source         text        not null default 'ONLINE' check (source in ('ONLINE','OFFLINE_SYNC')),
  actor_type     text        not null check (actor_type in ('DOOR_PIN','STAFF','ORGANIZER')),
  actor_id       uuid,
  actor_name     text,
  client_scan_id uuid        unique,
  scanned_at     timestamptz not null default now()
);
create index if not exists scan_log_event_idx on public.scan_log(event_id, scanned_at desc);
create index if not exists scan_log_ticket_idx on public.scan_log(ticket_id);
alter table public.scan_log enable row level security;

create table if not exists public.scanner_sessions (
  id             uuid        primary key default gen_random_uuid(),
  scanner_pin_id uuid        not null references public.scanner_pins(id) on delete cascade,
  event_id       uuid        not null references public.events(id) on delete cascade,
  staff_name     text        not null,
  token_hash     text        not null unique,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);
alter table public.scanner_sessions enable row level security;

-- Door PIN -> event-scoped session token.
create or replace function public.scanner_login_session(p_event_id uuid, p_pin text)
returns table (token text, event_id uuid, staff_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin  public.scanner_pins;
  v_hash text;
  v_token text;
begin
  v_hash := encode(extensions.digest(p_event_id::text || ':' || p_pin, 'sha256'), 'hex');
  select * into v_pin from public.scanner_pins sp
   where sp.event_id = p_event_id and sp.pin_hash = v_hash and sp.is_active = true;
  if not found then return; end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.scanner_sessions (scanner_pin_id, event_id, staff_name, token_hash, expires_at)
  values (v_pin.id, p_event_id, v_pin.staff_name,
          encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '12 hours');
  update public.scanner_pins set last_used_at = now() where id = v_pin.id;
  return query select v_token, p_event_id, v_pin.staff_name;
end;
$$;

-- Token-scoped check-in. Every attempt is logged. A repeated client_scan_id returns the
-- original outcome without changing the ticket again.
create or replace function public.check_in_ticket_by_token(
  p_qr_hash      text,
  p_token        text,
  p_client_scan_id uuid default null,
  p_source       text default 'ONLINE'
)
returns table (
  outcome       text,
  event_title   text,
  tier_name     text,
  holder_name   text,
  checked_in_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.scanner_sessions;
  v_ticket  public.tickets;
  v_ticket_id uuid;
  v_outcome text;
  v_prior   text;
begin
  select * into v_session from public.scanner_sessions
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and expires_at > now();
  if not found then raise exception 'Scanner session expired. Sign in again.'; end if;

  if p_client_scan_id is not null then
    select sl.outcome into v_prior from public.scan_log sl where sl.client_scan_id = p_client_scan_id;
    if found then
      -- Replay: report the stored outcome, change nothing.
      v_outcome := v_prior;
    end if;
  end if;

  if v_outcome is null then
    select * into v_ticket from public.tickets t where t.qr_hash = p_qr_hash for update;
    if found then v_ticket_id := v_ticket.id; end if;
    if not found then
      v_outcome := 'INVALID';
    elsif v_ticket.event_id <> v_session.event_id then
      v_outcome := 'WRONG_EVENT';
    elsif v_ticket.status::text = 'CANCELLED' then
      v_outcome := 'CANCELLED';
    elsif v_ticket.status::text = 'USED' then
      v_outcome := 'ALREADY_USED';
    elsif v_ticket.status::text = 'VALID' then
      update public.tickets set status = 'USED', checked_in_at = now(), checked_in_by = null
       where id = v_ticket.id
       returning * into v_ticket;
      v_outcome := 'VALID';
    else
      v_outcome := 'INVALID';
    end if;

    insert into public.scan_log (event_id, ticket_id, qr_hash, outcome, source,
                                 actor_type, actor_id, actor_name, client_scan_id)
    values (v_session.event_id, v_ticket_id,
            p_qr_hash, v_outcome, case when p_source = 'OFFLINE_SYNC' then 'OFFLINE_SYNC' else 'ONLINE' end,
            'DOOR_PIN', v_session.scanner_pin_id, v_session.staff_name, p_client_scan_id)
    on conflict (client_scan_id) do nothing;
  end if;

  -- Ticket details for the screen. Wrong-event tickets show their real event.
  return query
    select
      v_outcome,
      e.title,
      t.name,
      coalesce(o.buyer_name, p.full_name),
      v.checked_in_at
    from (select 1) as anchor
    left join public.tickets v on v.qr_hash = p_qr_hash
    left join public.events e on e.id = v.event_id
    left join public.ticket_tiers t on t.id = v.tier_id
    left join public.orders o on o.id = v.order_id
    left join public.profiles p on p.id = v.user_id;
end;
$$;

revoke execute on function public.scanner_login_session(uuid, text) from public, anon, authenticated;
revoke execute on function public.check_in_ticket_by_token(text, text, uuid, text) from public, anon, authenticated;
grant  execute on function public.scanner_login_session(uuid, text) to service_role;
grant  execute on function public.check_in_ticket_by_token(text, text, uuid, text) to service_role;


-- Event a scanner session belongs to (null when the token is unknown or expired).
create or replace function public.scanner_session_event(p_token text)
returns uuid
language sql
security definer
set search_path = public, extensions
stable
as $$
  select s.event_id from public.scanner_sessions s
   where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and s.expires_at > now();
$$;

revoke execute on function public.scanner_session_event(text) from public, anon, authenticated;
grant  execute on function public.scanner_session_event(text) to service_role;

-- Phase 4: an offline scan that syncs after the ticket was used elsewhere is a
-- DUPLICATE_CONFLICT (two doors took the same ticket while offline), not a plain repeat.
create or replace function public.check_in_ticket_by_token(
  p_qr_hash      text,
  p_token        text,
  p_client_scan_id uuid default null,
  p_source       text default 'ONLINE'
)
returns table (
  outcome       text,
  event_title   text,
  tier_name     text,
  holder_name   text,
  checked_in_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.scanner_sessions;
  v_ticket  public.tickets;
  v_ticket_id uuid;
  v_outcome text;
  v_prior   text;
begin
  select * into v_session from public.scanner_sessions
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and expires_at > now();
  if not found then raise exception 'Scanner session expired. Sign in again.'; end if;

  if p_client_scan_id is not null then
    select sl.outcome into v_prior from public.scan_log sl where sl.client_scan_id = p_client_scan_id;
    if found then v_outcome := v_prior; end if;
  end if;

  if v_outcome is null then
    select * into v_ticket from public.tickets t where t.qr_hash = p_qr_hash for update;
    if found then v_ticket_id := v_ticket.id; end if;
    if not found then
      v_outcome := 'INVALID';
    elsif v_ticket.event_id <> v_session.event_id then
      v_outcome := 'WRONG_EVENT';
    elsif v_ticket.status::text = 'CANCELLED' then
      v_outcome := 'CANCELLED';
    elsif v_ticket.status::text = 'USED' then
      v_outcome := case when p_source = 'OFFLINE_SYNC' then 'DUPLICATE_CONFLICT' else 'ALREADY_USED' end;
    elsif v_ticket.status::text = 'VALID' then
      update public.tickets set status = 'USED', checked_in_at = now(), checked_in_by = null
       where id = v_ticket.id
       returning * into v_ticket;
      v_outcome := 'VALID';
    else
      v_outcome := 'INVALID';
    end if;

    insert into public.scan_log (event_id, ticket_id, qr_hash, outcome, source,
                                 actor_type, actor_id, actor_name, client_scan_id)
    values (v_session.event_id, v_ticket_id, p_qr_hash, v_outcome,
            case when p_source = 'OFFLINE_SYNC' then 'OFFLINE_SYNC' else 'ONLINE' end,
            case when v_session.staff_member_id is not null then 'STAFF' else 'DOOR_PIN' end,
            coalesce(v_session.staff_member_id, v_session.scanner_pin_id),
            v_session.staff_name, p_client_scan_id)
    on conflict (client_scan_id) do nothing;
  end if;

  return query
    select v_outcome, e.title, t.name, coalesce(o.buyer_name, p.full_name), v.checked_in_at
      from (select 1) as anchor
      left join public.tickets v on v.qr_hash = p_qr_hash
      left join public.events e on e.id = v.event_id
      left join public.ticket_tiers t on t.id = v.tier_id
      left join public.orders o on o.id = v.order_id
      left join public.profiles p on p.id = v.user_id;
end;
$$;

-- scan_log outcome check must allow DUPLICATE_CONFLICT (already in the table definition).

-- ---------------------------------------------------------------------------
-- Counter Razorpay sale (box-office redesign): card/UPI at the counter.
-- A guest sale with no buyer account: the reserved order and its payment
-- intent carry user_id = NULL. Authorization is the staff assignment, and the
-- confirm path (webhook or client verify) is the same apply_captured_payment
-- dispatcher online orders use - it never reads orders.user_id.
-- ---------------------------------------------------------------------------
alter table public.payment_intents alter column user_id drop not null;
-- Guest orders can late-capture into the auto-refund path, which writes
-- refunds.user_id; the refund is identified by order_id, not the (absent) user.
alter table public.refunds alter column user_id drop not null;

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
  -- Staff must be active and assigned to this event.
  if not exists (
    select 1 from public.staff_members s
      join public.staff_event_assignments a on a.staff_id = s.id
     where s.id = p_staff_id and s.is_active and a.event_id = p_event_id and a.is_active
  ) then
    raise exception 'You are not assigned to this event';
  end if;

  -- Idempotency replay: same key + staff member -> same order back.
  if p_idempotency_key is not null then
    select * into v_order from public.orders
     where idempotency_key = p_idempotency_key and sold_by_staff_id = p_staff_id;
    if found then
      if v_order.status in ('RESERVED', 'CONFIRMED') then return v_order; end if;
      -- Dead order already holds the key; free it for a fresh sale.
      p_idempotency_key := null;
    end if;
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if v_event.status not in ('PUBLISHED', 'POSTPONED') then
    raise exception 'This event is not open for sales';
  end if;
  -- No online booking cutoff: the counter sells at the venue, same as cash.

  select * into v_tier from public.ticket_tiers where id = p_tier_id for update;
  if not found then raise exception 'Ticket tier not found'; end if;
  if v_tier.event_id <> p_event_id then raise exception 'Ticket tier does not belong to this event'; end if;
  if v_tier.price_paise = 0 then raise exception 'Free tickets do not need a Razorpay payment'; end if;
  if v_tier.quantity - v_tier.quantity_sold - coalesce(v_tier.quantity_reserved, 0) < 1 then
    raise exception 'Sold out for this ticket tier';
  end if;

  -- Money: identical to create_reserved_order, gateway gross-up included -
  -- a real gateway fee is charged on card/UPI sales.
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

revoke execute on function public.create_counter_reserved_order(uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.create_counter_reserved_order(uuid, uuid, uuid, text, text, text, text, text) to service_role;

-- ============================================================================
-- BUILD A FOLLOWING (SortMyScene parity)
-- ============================================================================
-- a) Auto-follow: every ticket purchase (or free RSVP) adds the buyer to the
--    organizer's following - one trigger covers online, free, and manual-
--    approved orders. Guests (walk-in/box-office, user_id NULL) can't follow.
-- b) Launch notifications: the first time an event goes PUBLISHED, every
--    follower gets an in-app notification - the organizer's existing audience
--    is the launch base for the next event.
-- ----------------------------------------------------------------------------

-- 1. Notification type for follower launch alerts.
do $$ begin
  alter type public.event_notification_type add value if not exists 'NEW_EVENT';
exception when others then null; end $$;

-- 2. One-shot flag so re-publishing after unpublish doesn't spam followers.
alter table public.events add column if not exists followers_notified_at timestamptz;

-- 3. Auto-follow trigger on orders -> CONFIRMED.
create or replace function public.trg_orders_autofollow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if new.status <> 'CONFIRMED' or new.user_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'CONFIRMED' then
    return new; -- already counted at first confirmation
  end if;

  select organizer_id into v_org from public.events where id = new.event_id;
  if v_org is null then return new; end if;

  -- The organizer buying their own ticket doesn't become their own follower.
  if exists (select 1 from public.organizers
              where id = v_org and owner_id = new.user_id) then
    return new;
  end if;

  insert into public.organizer_follows (organizer_id, follower_id)
  values (v_org, new.user_id)
  on conflict (organizer_id, follower_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_orders_autofollow on public.orders;
create trigger trg_orders_autofollow
  after insert or update of status on public.orders
  for each row execute function public.trg_orders_autofollow();

-- 4. Fan-out helper: notify every follower once, then stamp the flag.
create or replace function public.notify_event_followers(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.events
     set followers_notified_at = now()
   where id = p_event_id
     and followers_notified_at is null;
  if not found then
    return; -- already notified (or event missing)
  end if;

  insert into public.event_notifications (event_id, user_id, type, message)
  select p_event_id, f.follower_id, 'NEW_EVENT',
         o.name || ' just launched "' || e.title || '".'
    from public.organizer_follows f
    join public.events e on e.id = p_event_id
    join public.organizers o on o.id = e.organizer_id
   where f.organizer_id = e.organizer_id;
end;
$$;

revoke execute on function public.notify_event_followers(uuid) from public, anon, authenticated;
grant  execute on function public.notify_event_followers(uuid) to service_role;

-- 5. set_event_status: fan out on the first transition to PUBLISHED.
drop function if exists public.set_event_status(uuid, text);
create or replace function public.set_event_status(
  p_event_id uuid,
  p_status   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_event_manager(p_event_id) then
    raise exception 'Not authorised to change this event status';
  end if;
  if p_status not in ('DRAFT','PUBLISHED','POSTPONED','CANCELLED','COMPLETED','SOLD_OUT') then
    raise exception 'Invalid status: %', p_status;
  end if;
  if p_status = 'CANCELLED' then
    raise exception 'Use cancel_event() - direct cancellation skips refunds and notifications';
  end if;
  update public.events set status = p_status::public.event_status
   where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;

  if p_status = 'PUBLISHED' then
    perform public.notify_event_followers(p_event_id);
  end if;
end;
$$;
grant execute on function public.set_event_status(uuid, text) to authenticated, service_role;


-- =============================================================================
-- STEP 44 — Staff password sign-in (door scanner + box office)
--
-- Staff members now get a real password chosen by the organizer/admin at
-- registration instead of a generated 6-digit PIN. Sign-in accepts the staff
-- member's phone number OR email + password and works for both /scan (door)
-- and /box-office (counter) - one credential, both tools.
-- =============================================================================

-- pin_hash is a bcrypt hash either way - rename so the schema stays honest.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'staff_members' and column_name = 'pin_hash') then
    alter table public.staff_members rename column pin_hash to password_hash;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'staff_members' and column_name = 'pin_set_at') then
    alter table public.staff_members rename column pin_set_at to password_set_at;
  end if;
end $$;

-- Door sessions can now belong to a staff member instead of a legacy event PIN.
alter table public.scanner_sessions alter column scanner_pin_id drop not null;
alter table public.scanner_sessions
  add column if not exists staff_member_id uuid references public.staff_members(id) on delete cascade;

-- staff_register: the organizer/admin supplies the password. Returns the new
-- staff id - nothing secret to display.
drop function if exists public.staff_register(text, uuid, text, text, text, uuid);
create or replace function public.staff_register(
  p_owner_type   text,
  p_organizer_id uuid,
  p_name         text,
  p_email        text,
  p_phone        text,
  p_password     text,
  p_actor        uuid
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  insert into public.staff_members (owner_type, organizer_id, name, email, phone, password_hash, created_by)
  values (p_owner_type, p_organizer_id, btrim(p_name), nullif(btrim(coalesce(p_email, '')), ''),
          p_phone, extensions.crypt(p_password, extensions.gen_salt('bf', 8)), p_actor)
  returning id into v_id;
  return v_id;
end;
$$;

-- Organizer/admin sets a new password (no generated secret to hand out).
create or replace function public.staff_set_password(p_staff_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  update public.staff_members
     set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 8)),
         password_set_at = now()
   where id = p_staff_id;
  if not found then raise exception 'Staff member not found'; end if;
end;
$$;

-- Identifier (phone digits or email, case-insensitive) + password -> staff
-- session token (12h). The token opens the counter AND the door for every
-- event the staff member is assigned to.
drop function if exists public.staff_login_session(text, text);
create or replace function public.staff_login_session(p_identifier text, p_password text)
returns table (token text, staff_id uuid, name text, owner_type text, organizer_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_members;
  v_token text;
  v_ident text := btrim(p_identifier);
  v_digits text := regexp_replace(coalesce(p_identifier, ''), '\D', '', 'g');
begin
  if v_digits like '91%' and length(v_digits) > 10 then
    v_digits := right(v_digits, 10);
  end if;
  for v_staff in
    select * from public.staff_members
     where is_active = true
       and (phone = v_digits or lower(email) = lower(v_ident))
  loop
    if extensions.crypt(p_password, v_staff.password_hash) = v_staff.password_hash then
      v_token := encode(extensions.gen_random_bytes(32), 'hex');
      insert into public.staff_sessions (staff_id, token_hash, expires_at)
      values (v_staff.id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '12 hours');
      return query select v_token, v_staff.id, v_staff.name, v_staff.owner_type, v_staff.organizer_id;
      return;
    end if;
  end loop;
  return;
end;
$$;

-- Staff token + event -> door session token (scan-only scope, 12h).
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

-- Retired PIN helpers.
drop function if exists public.staff_reset_pin(uuid);
drop function if exists public._new_staff_pin();

revoke execute on function public.staff_register(text, uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.staff_set_password(uuid, text) from public, anon, authenticated;
revoke execute on function public.staff_login_session(text, text) from public, anon, authenticated;
revoke execute on function public.staff_door_session(text, uuid) from public, anon, authenticated;
grant execute on function public.staff_register(text, uuid, text, text, text, text, uuid) to service_role;
grant execute on function public.staff_set_password(uuid, text) to service_role;
grant execute on function public.staff_login_session(text, text) to service_role;
grant execute on function public.staff_door_session(text, uuid) to service_role;

-- ===========================================================================
-- STEP 45: Communities — clubs → communities rename + community feature schema
-- (rename tables, join modes + questions, follows, referrals, member imports,
--  page views, community events, group tiers, guestlist, members-only gate)
-- ===========================================================================

-- ---------- 45.1 renames (guarded: this bundle is re-runnable) ----------
do $$ begin
  if exists (select 1 from pg_class t join pg_namespace n on n.oid = t.relnamespace
             where n.nspname='public' and t.relname='clubs' and t.relkind='r') then
    alter table public.clubs rename to communities;
  end if;
  if exists (select 1 from pg_class t join pg_namespace n on n.oid = t.relnamespace
             where n.nspname='public' and t.relname='club_members' and t.relkind='r') then
    alter table public.club_members rename to community_members;
    alter table public.community_members rename column club_id to community_id;
  end if;
end $$;

-- ---------- 45.2 membership_type -> join modes ----------
alter table public.communities drop constraint if exists clubs_membership_type_check;
alter table public.communities drop constraint if exists communities_membership_type_check;
update public.communities
   set membership_type = case when membership_type = 'AUDITION' then 'PRIVATE' else 'OPEN' end
 where membership_type not in ('OPEN','PRIVATE','INVITE_ONLY');
alter table public.communities drop constraint if exists communities_membership_check;
alter table public.communities
  add constraint communities_membership_check
  check (membership_type in ('OPEN','PRIVATE','INVITE_ONLY'));
alter table public.communities alter column membership_type set default 'OPEN';

-- ---------- 45.3 community columns ----------
alter table public.communities add column if not exists gallery_urls text[] not null default '{}';
alter table public.communities add column if not exists invite_token text;
create unique index if not exists communities_invite_token_key
  on public.communities(invite_token) where invite_token is not null;

alter table public.community_members add column if not exists referred_by_member_id uuid
  references public.community_members(id);
alter table public.community_members add column if not exists imported_from uuid;
alter table public.community_members add column if not exists imported_events_attended integer not null default 0;
alter table public.community_members add column if not exists invite_code text;
create unique index if not exists community_members_invite_code_key
  on public.community_members(invite_code) where invite_code is not null;

-- ---------- 45.4 events: community link + visibility + invite token ----------
alter table public.events add column if not exists community_id uuid
  references public.communities(id) on delete set null;
alter table public.events add column if not exists visibility text not null default 'OPEN';
alter table public.events add column if not exists invite_token text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'events_visibility_check') then
    alter table public.events add constraint events_visibility_check
      check (visibility in ('OPEN','MEMBERS_ONLY','INVITE_ONLY')
             and (community_id is not null or visibility = 'OPEN'));
  end if;
end $$;
create unique index if not exists events_invite_token_key
  on public.events(invite_token) where invite_token is not null;
create index if not exists events_community_idx
  on public.events(community_id) where community_id is not null;

-- ---------- 45.5 group tickets: one tier unit admits N ----------
alter table public.ticket_tiers add column if not exists admits integer not null default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ticket_tiers_admits_check') then
    alter table public.ticket_tiers add constraint ticket_tiers_admits_check
      check (admits between 1 and 20);
  end if;
end $$;

-- ---------- 45.6 orders: guestlist channel ----------
alter table public.orders alter column user_id drop not null;
alter table public.orders drop constraint if exists orders_order_source_check;
alter table public.orders drop constraint if exists orders_order_source_check;
alter table public.orders add constraint orders_order_source_check
  check (order_source in ('ONLINE','MANUAL_UPI','WALKIN_PREEVENT','WALKIN_QR','WALKIN_INSTANT','BOX_OFFICE','GUESTLIST'));

-- ---------- 45.6b communities cleanup: free-form city + REMOVED member status ----------
alter table public.communities drop constraint if exists clubs_city_check;
alter table public.community_members drop constraint if exists club_members_status_check;
alter table public.community_members add constraint club_members_status_check
  check (status in ('PENDING','ACCEPTED','REJECTED','REMOVED'));

-- ---------- 45.7 new enum values ----------
do $$ begin
  alter type public.event_notification_type add value if not exists 'OUTREACH';
exception when others then null; end $$;
do $$ begin
  alter type public.event_notification_type add value if not exists 'NEW_EVENT';
exception when others then null; end $$;

-- ---------- 45.8 new tables ----------
create table if not exists public.community_join_questions (
  id           uuid        primary key default gen_random_uuid(),
  community_id uuid        not null references public.communities(id) on delete cascade,
  question     text        not null,
  is_mandatory boolean     not null default false,
  sort_order   integer     not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists cjq_community_idx on public.community_join_questions(community_id, sort_order);

create table if not exists public.community_join_answers (
  id         uuid        primary key default gen_random_uuid(),
  member_id  uuid        not null references public.community_members(id) on delete cascade,
  question   text        not null,
  answer     text        not null,
  created_at timestamptz not null default now()
);
create index if not exists cja_member_idx on public.community_join_answers(member_id);

create table if not exists public.community_follows (
  community_id uuid        not null references public.communities(id) on delete cascade,
  follower_id  uuid        not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (community_id, follower_id)
);
create index if not exists community_follows_user_idx on public.community_follows(follower_id);

create table if not exists public.community_member_imports (
  id           uuid        primary key default gen_random_uuid(),
  community_id uuid        not null references public.communities(id) on delete cascade,
  organizer_id uuid        not null references public.organizers(id) on delete cascade,
  status       text        not null default 'REQUESTED'
               check (status in ('REQUESTED','APPROVED','REJECTED')),
  filename     text        not null,
  total_rows   integer     not null default 0,
  valid_rows   integer     not null default 0,
  invalid_rows integer     not null default 0,
  requested_by uuid        not null references public.profiles(id),
  reviewed_by  uuid        references public.profiles(id),
  review_note  text,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);
create index if not exists cmi_status_idx on public.community_member_imports(status);

create table if not exists public.community_import_items (
  id              uuid        primary key default gen_random_uuid(),
  import_id       uuid        not null references public.community_member_imports(id) on delete cascade,
  full_name       text        not null,
  phone           text,
  email           text,
  events_attended integer     not null default 0,
  status          text        not null default 'VALID'
                  check (status in ('VALID','INVALID','LINKED')),
  row_error       text,
  linked_user_id  uuid        references public.profiles(id),
  created_at      timestamptz not null default now()
);
create index if not exists cii_import_idx on public.community_import_items(import_id);
create index if not exists cii_phone_idx  on public.community_import_items(phone)  where phone is not null;
create index if not exists cii_email_idx  on public.community_import_items(email)  where email is not null;

create table if not exists public.page_views (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  entity_type text        not null check (entity_type in ('COMMUNITY','EVENT')),
  entity_id   uuid        not null,
  viewed_day  date        not null default (now() at time zone 'Asia/Kolkata')::date,
  created_at  timestamptz not null default now(),
  unique (user_id, entity_type, entity_id, viewed_day)
);
create index if not exists page_views_entity_idx on public.page_views(entity_type, entity_id);

alter table public.community_join_questions enable row level security;
alter table public.community_join_answers   enable row level security;
alter table public.community_follows        enable row level security;
alter table public.community_member_imports enable row level security;
alter table public.community_import_items   enable row level security;
alter table public.page_views               enable row level security;

drop policy if exists "join questions readable by everyone" on public.community_join_questions;
create policy "join questions readable by everyone" on public.community_join_questions
  for select using (true);

drop policy if exists "join answers readable by owner and self" on public.community_join_answers;
create policy "join answers readable by owner and self" on public.community_join_answers
  for select using (
    exists (select 1 from public.community_members cm
             where cm.id = member_id and cm.user_id = auth.uid())
    or exists (select 1 from public.community_members cm
                join public.communities c on c.id = cm.community_id
                join public.organizers o on o.id = c.owner_id
               where cm.id = member_id and o.owner_id = auth.uid())
  );

drop policy if exists "community follows public read" on public.community_follows;
create policy "community follows public read" on public.community_follows
  for select using (true);
drop policy if exists "community follows own insert" on public.community_follows;
create policy "community follows own insert" on public.community_follows
  for insert with check (follower_id = auth.uid());
drop policy if exists "community follows own delete" on public.community_follows;
create policy "community follows own delete" on public.community_follows
  for delete using (follower_id = auth.uid());

drop policy if exists "imports visible to community owner" on public.community_member_imports;
create policy "imports visible to community owner" on public.community_member_imports
  for select using (
    exists (select 1 from public.organizers o
             where o.id = organizer_id and o.owner_id = auth.uid())
  );
drop policy if exists "import items visible to community owner" on public.community_import_items;
create policy "import items visible to community owner" on public.community_import_items
  for select using (
    exists (select 1 from public.community_member_imports i
             join public.organizers o on o.id = i.organizer_id
            where i.id = import_id and o.owner_id = auth.uid())
  );

drop policy if exists "users log own views" on public.page_views;
create policy "users log own views" on public.page_views
  for insert with check (user_id = auth.uid());
drop policy if exists "users read own views" on public.page_views;
create policy "users read own views" on public.page_views
  for select using (user_id = auth.uid());

-- Re-create the renamed-table policies under community names (the renamed
-- policies still work; this keeps names consistent going forward).
drop policy if exists "clubs are publicly readable" on public.communities;
drop policy if exists "communities are publicly readable" on public.communities;
create policy "communities are publicly readable" on public.communities
  for select using (true);
drop policy if exists "organizers can insert clubs" on public.communities;
drop policy if exists "organizers can insert communities" on public.communities;
create policy "organizers can insert communities" on public.communities
  for insert with check (
    exists (select 1 from public.organizers o where o.id = communities.owner_id and o.owner_id = auth.uid())
  );
drop policy if exists "organizers can update own clubs" on public.communities;
drop policy if exists "organizers can update own communities" on public.communities;
create policy "organizers can update own communities" on public.communities
  for update using (
    exists (select 1 from public.organizers o where o.id = communities.owner_id and o.owner_id = auth.uid())
  );

drop policy if exists "members are visible to club owner and self" on public.community_members;
drop policy if exists "members are visible to community owner and self" on public.community_members;
create policy "members are visible to community owner and self" on public.community_members
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.communities c
                join public.organizers o on o.id = c.owner_id
               where c.id = community_id and o.owner_id = auth.uid())
  );
drop policy if exists "users can request to join" on public.community_members;
drop policy if exists "users can request to join community" on public.community_members;
create policy "users can request to join community" on public.community_members
  for insert with check (user_id = auth.uid());
drop policy if exists "users can update own membership" on public.community_members;
create policy "users can update own membership" on public.community_members
  for update using (user_id = auth.uid());
drop policy if exists "club owners can update membership status" on public.community_members;
drop policy if exists "community owners can update membership" on public.community_members;
create policy "community owners can update membership" on public.community_members
  for update using (
    exists (select 1 from public.communities c
             join public.organizers o on o.id = c.owner_id
            where c.id = community_id and o.owner_id = auth.uid())
  );

-- ---------- 45.9 RPCs ----------

-- Renamed counter helper (drop the old name).
drop function if exists public.increment_club_member_count(uuid);
create or replace function public.increment_community_member_count(p_community_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.communities set member_count = member_count + 1 where id = p_community_id;
end;
$$;
revoke execute on function public.increment_community_member_count(uuid) from public, anon;
grant execute on function public.increment_community_member_count(uuid) to authenticated, service_role;

-- join_community: mode-aware join with questions + invite token + referral code.
drop function if exists public.join_community(uuid, uuid, jsonb, text, text);
create or replace function public.join_community(
  p_user_id      uuid,
  p_community_id uuid,
  p_answers      jsonb default '[]'::jsonb,
  p_invite_token text default null,
  p_ref_code     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c        public.communities%rowtype;
  v_status   text;
  v_member   uuid;
  v_ref      uuid;
  v_missing  int;
  a          jsonb;
begin
  -- users can only join themselves; the service role may act for anyone
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Cannot join on behalf of another user';
  end if;

  select * into v_c from public.communities where id = p_community_id;
  if not found then raise exception 'Community not found'; end if;

  select id, status into v_member, v_status
    from public.community_members
   where community_id = p_community_id and user_id = p_user_id;
  if found then
    return jsonb_build_object('member_id', v_member, 'status', v_status, 'existing', true);
  end if;

  -- referral code -> referring member of this community
  if p_ref_code is not null then
    select id into v_ref from public.community_members
     where community_id = p_community_id
       and invite_code = p_ref_code
       and status = 'ACCEPTED';
  end if;

  if v_c.membership_type = 'OPEN' then
    v_status := 'ACCEPTED';
  elsif v_c.membership_type = 'PRIVATE' then
    select count(*) into v_missing
      from public.community_join_questions q
     where q.community_id = p_community_id
       and q.is_mandatory
       and not exists (
             select 1 from jsonb_array_elements(p_answers) x
              where x->>'question_id' = q.id::text
                and length(coalesce(x->>'answer','')) > 0
           );
    if v_missing > 0 then
      raise exception 'Please answer all required questions.';
    end if;
    v_status := 'PENDING';
  else -- INVITE_ONLY
    if not exists (select 1 from public.community_invites i
                    where i.community_id = p_community_id and i.token = p_invite_token) then
      raise exception 'This community is invite-only. You need an invite link.';
    end if;
    v_status := 'ACCEPTED';
  end if;

  insert into public.community_members (
    community_id, user_id, status, referred_by_member_id, invite_code
  ) values (
    p_community_id, p_user_id, v_status, v_ref,
    substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8)
  )
  on conflict (community_id, user_id) do nothing
  returning id into v_member;

  if v_member is null then
    select id, status into v_member, v_status
      from public.community_members
     where community_id = p_community_id and user_id = p_user_id;
    return jsonb_build_object('member_id', v_member, 'status', v_status, 'existing', true);
  end if;

  -- snapshot answers (question text at join time)
  for a in select * from jsonb_array_elements(p_answers) loop
    insert into public.community_join_answers (member_id, question, answer)
    select q.question, a->>'answer'
      from public.community_join_questions q
     where q.id = (a->>'question_id')::uuid;
  end loop;

  if v_status = 'ACCEPTED' then
    update public.communities set member_count = member_count + 1 where id = p_community_id;
  end if;

  return jsonb_build_object('member_id', v_member, 'status', v_status, 'existing', false);
end;
$$;
revoke execute on function public.join_community(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function public.join_community(uuid, uuid, jsonb, text, text) to authenticated, service_role;

-- Owner/admin approves or rejects a pending member.
drop function if exists public.set_community_membership(uuid, uuid, text);
create or replace function public.set_community_membership(
  p_actor_id uuid,
  p_member_id uuid,
  p_status   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.community_members%rowtype;
begin
  if p_status not in ('ACCEPTED','REJECTED') then raise exception 'Invalid status'; end if;

  select * into v_member from public.community_members where id = p_member_id;
  if not found then raise exception 'Member not found'; end if;

  if not exists (
    select 1 from public.communities c
     join public.organizers o on o.id = c.owner_id
     where c.id = v_member.community_id and o.owner_id = p_actor_id
  ) and not exists (
    select 1 from public.profiles where id = p_actor_id and is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;

  update public.community_members set status = p_status where id = p_member_id;
  if p_status = 'ACCEPTED' and v_member.status <> 'ACCEPTED' then
    update public.communities set member_count = member_count + 1
     where id = v_member.community_id;
  end if;
end;
$$;
revoke execute on function public.set_community_membership(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_community_membership(uuid, uuid, text) to service_role;

-- notify_event_followers: community events fan out to org followers +
-- community followers + ACCEPTED members (deduped); normal events unchanged.
create or replace function public.notify_event_followers(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.events%rowtype;
begin
  update public.events
     set followers_notified_at = now()
   where id = p_event_id
     and followers_notified_at is null;
  if not found then
    return; -- already notified (or event missing)
  end if;

  select * into v_e from public.events where id = p_event_id;

  insert into public.event_notifications (event_id, user_id, type, message)
  select p_event_id, uid, 'NEW_EVENT',
         o.name || ' just launched "' || v_e.title || '".'
    from (
      select f.follower_id as uid
        from public.organizer_follows f
       where f.organizer_id = v_e.organizer_id
      union
      select cf.follower_id
        from public.community_follows cf
       where cf.community_id = v_e.community_id
      union
      select cm.user_id
        from public.community_members cm
       where cm.community_id = v_e.community_id and cm.status = 'ACCEPTED'
    ) u
    join public.organizers o on o.id = v_e.organizer_id;
end;
$$;
revoke execute on function public.notify_event_followers(uuid) from public, anon, authenticated;
grant execute on function public.notify_event_followers(uuid) to service_role;

-- MEMBERS_ONLY booking gate: any new order on a members-only community event
-- must come from an ACCEPTED member (matched by user_id or buyer_phone).
create or replace function public.trg_orders_visibility_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visibility text;
  v_community  uuid;
  v_uid        uuid;
begin
  select visibility, community_id into v_visibility, v_community
    from public.events where id = new.event_id;
  if not found or v_visibility <> 'MEMBERS_ONLY' or new.order_source = 'GUESTLIST' then
    return new;
  end if;

  v_uid := new.user_id;
  if v_uid is null and new.buyer_phone is not null then
    select id into v_uid from public.profiles
     where right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10)
           = right(regexp_replace(new.buyer_phone, '\D', '', 'g'), 10)
       and phone is not null
     limit 1;
  end if;

  if v_uid is null or not exists (
    select 1 from public.community_members
     where community_id = v_community and user_id = v_uid and status = 'ACCEPTED'
  ) then
    raise exception 'This event is for community members only. Join the community first.';
  end if;
  return new;
end;
$$;
drop trigger if exists orders_visibility_gate on public.orders;
create trigger orders_visibility_gate
  before insert on public.orders
  for each row execute function public.trg_orders_visibility_gate();

-- Guestlist: organizer mints a free ticket (cap 10 per event; no ledger/payment).
drop function if exists public.create_guestlist_entry(uuid, uuid, text, text, text);
create or replace function public.create_guestlist_entry(
  p_actor_id uuid,
  p_event_id uuid,
  p_name     text,
  p_phone    text default null,
  p_email    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e      public.events%rowtype;
  v_tier   uuid;
  v_count  int;
  v_order  uuid;
  v_ticket uuid;
begin
  select * into v_e from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;

  if not exists (
    select 1 from public.organizers o
     where o.id = v_e.organizer_id and o.owner_id = p_actor_id
  ) and not exists (
    select 1 from public.profiles where id = p_actor_id and is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;

  if v_e.status <> 'PUBLISHED' then raise exception 'Event must be published first.'; end if;
  if coalesce(p_phone, p_email) is null then
    raise exception 'Phone number or email is required for a guest.';
  end if;

  select count(*) into v_count
    from public.orders
   where event_id = p_event_id and order_source = 'GUESTLIST';
  if v_count >= 10 then
    raise exception 'Guestlist is full (max 10 guests per event).';
  end if;

  select id into v_tier from public.ticket_tiers
   where event_id = p_event_id order by price_paise limit 1;
  if v_tier is null then raise exception 'Event has no ticket tier.'; end if;

  insert into public.orders (
    event_id, tier_id, user_id, quantity,
    unit_price_paise, subtotal_paise, platform_fee_paise, commission_paise,
    convenience_fee_paise, organizer_payout_paise, total_paise,
    fee_payer, status, order_source, buyer_name, buyer_phone, buyer_email, confirmed_at
  ) values (
    p_event_id, v_tier, null, 1,
    0, 0, 0, 0, 0, 0, 0,
    'ORGANIZER', 'CONFIRMED', 'GUESTLIST', p_name, p_phone, p_email, now()
  ) returning id into v_order;

  insert into public.tickets (order_id, event_id, tier_id, user_id, qr_hash)
  values (v_order, p_event_id, v_tier, null, encode(extensions.gen_random_bytes(16), 'hex'))
  returning id into v_ticket;

  return v_ticket;
end;
$$;
revoke execute on function public.create_reserved_order(uuid, uuid, integer, text, text, text, text, text, text) from public, anon;
grant  execute on function public.create_reserved_order(uuid, uuid, integer, text, text, text, text, text, text) to authenticated;
revoke execute on function public.create_free_order(uuid, uuid, integer, text, text, text, text, text) from public, anon;
grant  execute on function public.create_free_order(uuid, uuid, integer, text, text, text, text, text) to authenticated;
revoke execute on function public.create_guestlist_entry(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_guestlist_entry(uuid, uuid, text, text, text) to service_role;

-- Member import: organizer stages rows; invalid rows are recorded, not imported.
drop function if exists public.request_member_import(uuid, uuid, text, jsonb);
create or replace function public.request_member_import(
  p_actor_id     uuid,
  p_community_id uuid,
  p_filename     text,
  p_items        jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_import  uuid;
  v_valid   int := 0;
  v_invalid int := 0;
  it        jsonb;
  v_name    text;
  v_phone   text;
  v_email   text;
  v_err     text;
begin
  if not exists (
    select 1 from public.communities c
     join public.organizers o on o.id = c.owner_id
     where c.id = p_community_id and o.owner_id = p_actor_id
  ) then
    raise exception 'Not authorized';
  end if;

  insert into public.community_member_imports (
    community_id, organizer_id, filename, total_rows, requested_by
  )
  select p_community_id, c.owner_id, p_filename,
         jsonb_array_length(coalesce(p_items, '[]'::jsonb)), p_actor_id
    from public.communities c where c.id = p_community_id
  returning id into v_import;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_name  := nullif(trim(coalesce(it->>'name','')), '');
    v_phone := nullif(right(regexp_replace(coalesce(it->>'phone',''), '\D', '', 'g'), 10), '');
    v_email := nullif(lower(trim(coalesce(it->>'email',''))), '');
    v_err   := null;

    if v_name is null then
      v_err := 'Missing name';
    elsif v_phone is not null and length(v_phone) <> 10 then
      v_err := 'Invalid phone number';
      v_phone := null;
    end if;
    if v_err is null and v_phone is null
       and (v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
      v_err := 'Needs a valid phone or email';
      v_email := null;
    end if;

    if v_err is null then
      v_valid := v_valid + 1;
      insert into public.community_import_items
        (import_id, full_name, phone, email, events_attended, status)
      values (v_import, v_name, v_phone, v_email,
              greatest(0, coalesce((it->>'events_attended')::int, 0)), 'VALID');
    else
      v_invalid := v_invalid + 1;
      insert into public.community_import_items
        (import_id, full_name, phone, email, events_attended, status, row_error)
      values (v_import, coalesce(v_name,'(no name)'), v_phone, v_email, 0, 'INVALID', v_err);
    end if;
  end loop;

  update public.community_member_imports
     set valid_rows = v_valid, invalid_rows = v_invalid
   where id = v_import;

  return v_import;
end;
$$;
revoke execute on function public.request_member_import(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.request_member_import(uuid, uuid, text, jsonb) to service_role;

-- Admin approves/rejects a staged import.
drop function if exists public.review_member_import(uuid, uuid, boolean, text);
create or replace function public.review_member_import(
  p_admin_id uuid,
  p_import_id uuid,
  p_approve  boolean,
  p_note     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_import public.community_member_imports%rowtype;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and is_admin = true) then
    raise exception 'Not authorized';
  end if;

  select * into v_import from public.community_member_imports where id = p_import_id;
  if not found then raise exception 'Import not found'; end if;
  if v_import.status <> 'REQUESTED' then raise exception 'Import already reviewed'; end if;

  update public.community_member_imports
     set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
         reviewed_by = p_admin_id, review_note = p_note, reviewed_at = now()
   where id = p_import_id;

  if p_approve then
    -- imported members count toward the community total once approved
    update public.communities
       set member_count = member_count + v_import.valid_rows
     where id = v_import.community_id;
  end if;
end;
$$;
revoke execute on function public.review_member_import(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.review_member_import(uuid, uuid, boolean, text) to service_role;

-- Link approved import rows to real users when they exist (or sign up later).
drop function if exists public.link_imported_members(uuid);
create or replace function public.link_imported_members(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p    record;
  v_item record;
  v_n    int := 0;
begin
  select right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10) as phone10,
         lower(coalesce(email,'')) as email_l
    into v_p from public.profiles where id = p_user_id;
  if not found then return 0; end if;

  for v_item in
    select ii.id, ii.import_id, ii.events_attended, i.community_id
      from public.community_import_items ii
      join public.community_member_imports i on i.id = ii.import_id
     where i.status = 'APPROVED'
       and ii.status = 'VALID'
       and (
         (v_p.phone10 <> '' and ii.phone = v_p.phone10)
         or (v_p.email_l <> '' and lower(ii.email) = v_p.email_l)
       )
  loop
    insert into public.community_members (
      community_id, user_id, status, imported_from, imported_events_attended, invite_code
    ) values (
      v_item.community_id, p_user_id, 'ACCEPTED', v_item.import_id,
      v_item.events_attended, substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8)
    )
    on conflict (community_id, user_id) do update
      set imported_events_attended = greatest(community_members.imported_events_attended,
                                              excluded.imported_events_attended);
    update public.community_import_items
       set status = 'LINKED', linked_user_id = p_user_id
     where id = v_item.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.link_imported_members(uuid) from public, anon, authenticated;
grant execute on function public.link_imported_members(uuid) to service_role;

-- Trigger: link on profile insert or phone/email change.
create or replace function public.trg_profiles_link_imports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.link_imported_members(new.id);
  return new;
end;
$$;
drop trigger if exists profiles_link_imports on public.profiles;
create trigger profiles_link_imports
  after insert or update of phone, email on public.profiles
  for each row execute function public.trg_profiles_link_imports();

-- Page views (logged-in users only; dedupes per user/entity/day).
drop function if exists public.log_page_view(text, uuid);
create or replace function public.log_page_view(p_entity_type text, p_entity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.page_views (user_id, entity_type, entity_id)
  values (auth.uid(), p_entity_type, p_entity_id)
  on conflict (user_id, entity_type, entity_id, viewed_day) do nothing;
end;
$$;
revoke execute on function public.log_page_view(text, uuid) from public, anon;
grant execute on function public.log_page_view(text, uuid) to authenticated;

-- Community analytics bundle for the owner.
drop function if exists public.community_analytics(uuid);
create or replace function public.community_analytics(p_community_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'total_members', (
      select count(*) from (
        select cm.user_id from public.community_members cm
         where cm.community_id = p_community_id and cm.status = 'ACCEPTED'
        union
        select ii.linked_user_id from public.community_import_items ii
         join public.community_member_imports i on i.id = ii.import_id
         where i.community_id = p_community_id and i.status = 'APPROVED'
           and ii.status in ('VALID','LINKED')
      ) m
    ),
    'new_members_30d', (
      select count(*) from public.community_members
       where community_id = p_community_id and status = 'ACCEPTED'
         and created_at > now() - interval '30 days'
    ),
    'pending_requests', (
      select count(*) from public.community_members
       where community_id = p_community_id and status = 'PENDING'
    ),
    'events_total', (
      select count(*) from public.events where community_id = p_community_id
    ),
    'attendees', (
      select count(distinct t.user_id)
        from public.tickets t join public.events e on e.id = t.event_id
       where e.community_id = p_community_id and t.status = 'USED' and t.user_id is not null
    ),
    'repeat_attendees', (
      select count(*) from (
        select t.user_id from public.tickets t
         join public.events e on e.id = t.event_id
        where e.community_id = p_community_id and t.status = 'USED' and t.user_id is not null
        group by t.user_id having count(distinct t.event_id) >= 2
      ) r
    ),
    'views', (
      select count(distinct user_id) from public.page_views
       where entity_type = 'COMMUNITY' and entity_id = p_community_id
    ),
    'followers', (
      select count(*) from public.community_follows where community_id = p_community_id
    )
  ) into v;
  return v;
end;
$$;
revoke execute on function public.community_analytics(uuid) from public, anon, authenticated;
grant execute on function public.community_analytics(uuid) to service_role;

-- Funnel lists: users who viewed but didn't join / didn't buy.
drop function if exists public.community_non_joiners(uuid);
create or replace function public.community_non_joiners(p_community_id uuid)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select distinct v.user_id
    from public.page_views v
   where v.entity_type = 'COMMUNITY' and v.entity_id = p_community_id
     and not exists (select 1 from public.community_members m
                      where m.community_id = p_community_id
                        and m.user_id = v.user_id and m.status in ('ACCEPTED','PENDING'));
$$;

drop function if exists public.event_non_buyers(uuid);
create or replace function public.event_non_buyers(p_event_id uuid)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select distinct v.user_id
    from public.page_views v
   where v.entity_type = 'EVENT' and v.entity_id = p_event_id
     and not exists (select 1 from public.orders o
                      where o.event_id = p_event_id and o.user_id = v.user_id
                        and o.status in ('CONFIRMED','PENDING_VERIFICATION','RESERVED'));
$$;

revoke execute on function public.community_non_joiners(uuid) from public, anon, authenticated;
revoke execute on function public.event_non_buyers(uuid) from public, anon, authenticated;
grant execute on function public.community_non_joiners(uuid) to service_role;
grant execute on function public.event_non_buyers(uuid) to service_role;

-- One-click in-app outreach blast (WhatsApp/email adapters come later).
drop function if exists public.send_outreach_blast(uuid, text, uuid, text, uuid[]);
create or replace function public.send_outreach_blast(
  p_actor_id   uuid,
  p_entity_type text,
  p_entity_id  uuid,
  p_message    text,
  p_user_ids   uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  if p_entity_type = 'EVENT' then
    select exists (
      select 1 from public.events e join public.organizers o on o.id = e.organizer_id
       where e.id = p_entity_id and o.owner_id = p_actor_id
    ) into v_ok;
  else
    select exists (
      select 1 from public.communities c join public.organizers o on o.id = c.owner_id
       where c.id = p_entity_id and o.owner_id = p_actor_id
    ) into v_ok;
  end if;
  if not v_ok and not exists (select 1 from public.profiles where id = p_actor_id and is_admin = true) then
    raise exception 'Not authorized';
  end if;

  insert into public.event_notifications (event_id, user_id, type, message)
  select case when p_entity_type = 'EVENT' then p_entity_id else null end,
         u, 'OUTREACH', p_message
    from unnest(p_user_ids) u;
  return coalesce(array_length(p_user_ids, 1), 0);
end;
$$;
revoke execute on function public.send_outreach_blast(uuid, text, uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.send_outreach_blast(uuid, text, uuid, text, uuid[]) to service_role;


-- ============================================================================
-- STEP 45.9 — invite tokens are secrets, not public columns
--
-- events.invite_token + communities.invite_token were readable by anyone via
-- the public SELECT policies — an INVITE_ONLY "secret link" was scrapable.
-- Column-level revokes hide them from anon + authenticated (PostgREST simply
-- omits them from `select *`). Validation goes through SECURITY DEFINER RPCs:
--   *_invite_valid  — cheap boolean check used by public pages with ?invite=
--   get_*_invite_token — owner/admin only, to show the shareable link
-- ============================================================================

-- Move secrets to side tables: column-level revoke can't subtract from a
-- table-level SELECT grant, so the tokens move to RLS-deny tables readable
-- only by service_role (and SECURITY DEFINER functions).

create table if not exists public.event_invites (
  event_id uuid primary key references public.events(id) on delete cascade,
  token    text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.community_invites (
  community_id uuid primary key references public.communities(id) on delete cascade,
  token    text not null unique,
  created_at timestamptz not null default now()
);
alter table public.event_invites     enable row level security;
alter table public.community_invites enable row level security;
revoke all on public.event_invites     from public, anon, authenticated;
revoke all on public.community_invites from public, anon, authenticated;
grant select, insert, update, delete on public.event_invites     to service_role;
grant select, insert, update, delete on public.community_invites to service_role;

-- migrate any live tokens before dropping the public columns
insert into public.event_invites (event_id, token)
  select id, invite_token from public.events where invite_token is not null
  on conflict (event_id) do nothing;
insert into public.community_invites (community_id, token)
  select id, invite_token from public.communities where invite_token is not null
  on conflict (community_id) do nothing;

alter table public.events      drop column if exists invite_token;
alter table public.communities drop column if exists invite_token;

-- invite-token check for public pages (rate of false positives is irrelevant;
-- the token space is 80-bit random).
drop function if exists public.event_invite_valid(uuid, text);
create or replace function public.event_invite_valid(p_event_id uuid, p_token text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.events e
    join public.event_invites i on i.event_id = e.id
     where e.id = p_event_id
       and e.visibility = 'INVITE_ONLY'
       and i.token = p_token
  );
$$;
revoke execute on function public.event_invite_valid(uuid, text) from public;
grant execute on function public.event_invite_valid(uuid, text) to anon, authenticated, service_role;

drop function if exists public.community_invite_valid(uuid, text);
create or replace function public.community_invite_valid(p_community_id uuid, p_token text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.communities c
    join public.community_invites i on i.community_id = c.id
     where c.id = p_community_id
       and c.membership_type = 'INVITE_ONLY'
       and i.token = p_token
  );
$$;
revoke execute on function public.community_invite_valid(uuid, text) from public;
grant execute on function public.community_invite_valid(uuid, text) to anon, authenticated, service_role;

-- Owner/admin fetch of the shareable link (organizer manage pages).
drop function if exists public.get_event_invite_token(uuid, uuid);
create or replace function public.get_event_invite_token(p_event_id uuid, p_actor_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select i.token
    from public.event_invites i
    join public.events e on e.id = i.event_id
    join public.organizers o on o.id = e.organizer_id
   where e.id = p_event_id
     and (o.owner_id = p_actor_id
          or exists (select 1 from public.profiles where id = p_actor_id and is_admin = true)
          or exists (
            select 1 from public.event_collaborators ec
            join public.organizers eo on eo.id = ec.organizer_id
             where ec.event_id = e.id and ec.status = 'ACTIVE' and eo.owner_id = p_actor_id
          ));
$$;
revoke execute on function public.get_event_invite_token(uuid, uuid) from public, anon;
grant execute on function public.get_event_invite_token(uuid, uuid) to authenticated, service_role;

drop function if exists public.get_community_invite_token(uuid, uuid);
create or replace function public.get_community_invite_token(p_community_id uuid, p_actor_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select i.token
    from public.community_invites i
    join public.communities c on c.id = i.community_id
    join public.organizers o on o.id = c.owner_id
   where c.id = p_community_id
     and (o.owner_id = p_actor_id
          or exists (select 1 from public.profiles where id = p_actor_id and is_admin = true));
$$;
revoke execute on function public.get_community_invite_token(uuid, uuid) from public, anon;
grant execute on function public.get_community_invite_token(uuid, uuid) to authenticated, service_role;

-- Tell PostgREST to recompute its schema so the revoked columns disappear
-- from `select *` right away.
notify pgrst, 'reload schema';

-- Community creation is open (no admin approval) - verify everything.
update public.communities set verified = true where verified = false;

-- ---------- 46.x communities.category (discovery chips) ----------
alter table public.communities add column if not exists category text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'communities_category_check') then
    alter table public.communities add constraint communities_category_check check (category is null or category in (
      'FITNESS','HIP_HOP','ELECTRONIC','EXTREME_SPORTS','GAMING','FASHION','AUTOMOTIVE','ART_DESIGN'
    ));
  end if;
end $$;
create index if not exists communities_category_idx on public.communities(category);

-- ---------- 46.y organizer_bank_accounts + per-event payout account ----------
create table if not exists public.organizer_bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  organizer_id   uuid not null references public.organizers(id) on delete cascade,
  label          text,
  account_name   text not null,
  account_number text not null,
  ifsc           text not null,
  account_type   text,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now()
);
alter table public.organizer_bank_accounts enable row level security;
-- owners see/manage their own accounts; service_role for everything else
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'organizer_bank_accounts' and policyname = 'organizer_bank_accounts_owner') then
    create policy organizer_bank_accounts_owner on public.organizer_bank_accounts
      for all to authenticated
      using (organizer_id in (select id from public.organizers where owner_id = auth.uid()))
      with check (organizer_id in (select id from public.organizers where owner_id = auth.uid()));
  end if;
end $$;
grant select, insert, update, delete on public.organizer_bank_accounts to authenticated;
grant all on public.organizer_bank_accounts to service_role;

-- only one default per organizer
create unique index if not exists organizer_bank_one_default_idx
  on public.organizer_bank_accounts(organizer_id) where is_default;

-- events can pick which account the payout lands in
alter table public.events add column if not exists payout_account_id uuid references public.organizer_bank_accounts(id) on delete set null;
-- payouts can snapshot which account admin paid into
alter table public.payout_records add column if not exists bank_account_id uuid;

-- seed the table from legacy KYC bank fields so every verified organizer has a default account
insert into public.organizer_bank_accounts (organizer_id, label, account_name, account_number, ifsc, account_type, is_default)
select o.id, 'Primary account', o.bank_account_name, o.bank_account_number, o.bank_ifsc, o.bank_account_type, true
from public.organizers o
where o.bank_account_number is not null
  and o.bank_ifsc is not null
  and not exists (select 1 from public.organizer_bank_accounts a where a.organizer_id = o.id);

-- ---------- 46.z recurring community events ----------
alter table public.events add column if not exists recurrence text;
alter table public.events add column if not exists recurrence_parent_id uuid references public.events(id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'events_recurrence_check') then
    alter table public.events add constraint events_recurrence_check
      check (recurrence is null or recurrence = 'WEEKLY');
  end if;
end $$;
-- recurrence only makes sense on community events
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'events_recurrence_community_check') then
    alter table public.events add constraint events_recurrence_community_check
      check (recurrence is null or community_id is not null);
  end if;
end $$;
create index if not exists events_recurrence_parent_idx on public.events(recurrence_parent_id);
-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 47: PROMOTER PROGRAM — share-links OR promo codes, organizer-funded
-- ═══════════════════════════════════════════════════════════════════════════

-- Settings ---------------------------------------------------------------
insert into public.platform_settings (key, value) values
  ('promoter_commission_min_bps', '500'),
  ('promoter_commission_max_bps', '3000'),
  ('promo_discount_max_bps',      '1500'),
  ('promo_promoter_max_bps',      '1500'),
  ('promoter_hold_days',          '7'),
  ('promoter_min_payout_paise',   '100000'),
  ('promoter_cookie_days',        '30')
on conflict (key) do nothing;

-- Event columns ----------------------------------------------------------
alter table public.events
  add column if not exists promoter_mode text not null default 'NONE',
  add column if not exists promoter_commission_bps integer not null default 1000,
  add column if not exists promo_buyer_discount_bps integer not null default 500,
  add column if not exists promo_promoter_bps integer not null default 500;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'events_promoter_mode_check') then
    alter table public.events add constraint events_promoter_mode_check
      check (promoter_mode in ('NONE','LINK','PROMO_CODE'));
  end if;
end $$;

-- Order columns ----------------------------------------------------------
alter table public.orders
  add column if not exists promoter_id uuid,
  add column if not exists promoter_commission_paise integer not null default 0,
  add column if not exists discount_paise integer not null default 0,
  add column if not exists promoter_via text,
  add column if not exists promoter_link_id uuid,
  add column if not exists promo_code text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_promoter_via_check') then
    alter table public.orders add constraint orders_promoter_via_check
      check (promoter_via is null or promoter_via in ('LINK','PROMO_CODE'));
  end if;
end $$;

-- Tables ------------------------------------------------------------------
create table if not exists public.promoters (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references public.profiles(id) on delete cascade,
  upi_id              text,
  payout_account_name text,
  payout_account_number text,
  payout_ifsc         text,
  payout_pan          text,
  is_blocked          boolean not null default false,
  created_at          timestamptz not null default now()
);

create table if not exists public.promoter_links (
  id          uuid primary key default gen_random_uuid(),
  promoter_id uuid not null references public.promoters(id) on delete cascade,
  event_id    uuid not null references public.events(id) on delete cascade,
  slug        text not null unique,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (promoter_id, event_id)
);

create table if not exists public.promoter_promo_codes (
  id          uuid primary key default gen_random_uuid(),
  promoter_id uuid not null references public.promoters(id) on delete cascade,
  event_id    uuid not null references public.events(id) on delete cascade,
  code        text not null unique,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (promoter_id, event_id)
);

create table if not exists public.promoter_clicks (
  id         uuid primary key default gen_random_uuid(),
  link_id    uuid not null references public.promoter_links(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  ip_hash    text,
  ua_hash    text,
  referrer   text
);
create index if not exists promoter_clicks_link_idx on public.promoter_clicks(link_id, clicked_at desc);

create table if not exists public.promoter_earnings (
  id                        uuid primary key default gen_random_uuid(),
  order_id                  uuid unique references public.orders(id) on delete set null,
  promoter_id               uuid not null references public.promoters(id) on delete cascade,
  event_id                  uuid not null references public.events(id) on delete cascade,
  organizer_id              uuid not null references public.organizers(id) on delete cascade,
  via                       text not null check (via in ('LINK','PROMO_CODE')),
  link_id                   uuid references public.promoter_links(id) on delete set null,
  promo_code_id             uuid references public.promoter_promo_codes(id) on delete set null,
  ticket_subtotal_paise     integer not null default 0,
  commission_bps            integer not null default 0,
  amount_paise              integer not null,
  kind                      text not null default 'EARNING' check (kind in ('EARNING','CLAWBACK')),
  status                    text not null default 'EARNED' check (status in ('EARNED','PAID','REVERSED')),
  reversed_paise            integer not null default 0,
  payout_id                 uuid,
  refund_id                 uuid references public.refunds(id) on delete set null,
  reverses_id               uuid references public.promoter_earnings(id) on delete set null,
  created_at                timestamptz not null default now(),
  paid_at                   timestamptz
);
create index if not exists promoter_earnings_promoter_idx on public.promoter_earnings(promoter_id, status);
create index if not exists promoter_earnings_event_idx on public.promoter_earnings(event_id);

create table if not exists public.promoter_payouts (
  id               uuid primary key default gen_random_uuid(),
  promoter_id      uuid not null references public.promoters(id) on delete cascade,
  amount_paise     integer not null,
  status           text not null default 'PENDING' check (status in ('PENDING','PROCESSING','COMPLETED','FAILED')),
  payout_snapshot  jsonb not null default '{}'::jsonb,
  bank_reference   text,
  notes            text,
  initiated_at     timestamptz not null default now(),
  completed_at     timestamptz,
  created_at       timestamptz not null default now()
);

-- Default-deny everywhere; all access via service_role + SECURITY DEFINER.
do $$
declare t text;
begin
  foreach t in array array['promoters','promoter_links','promoter_promo_codes','promoter_clicks','promoter_earnings','promoter_payouts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- ═════════════════════════════════════════════════════════════════════════
-- FIX: visibility checks must read event_invites (invite_token column dropped)
-- New signature adds p_promoter_slug + p_promo_code. Drop every other
-- create_reserved_order overload so PostgREST resolves unambiguously.
-- ═════════════════════════════════════════════════════════════════════════
do $$
declare r record;
begin
  for r in
    select p.oid, pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_reserved_order'
  loop
    if r.args !~* 'p_promoter_slug' then
      execute format('drop function public.create_reserved_order(%s)', r.args);
    end if;
  end loop;
end $$;

create or replace function public.create_reserved_order(
  p_event_id              uuid,
  p_tier_id               uuid,
  p_quantity              integer,
  p_idempotency_key       text default null,
  p_buyer_name            text default null,
  p_buyer_phone           text default null,
  p_buyer_email           text default null,
  p_buyer_gender          text default null,
  p_invite_token          text default null,
  p_promoter_slug         text default null,
  p_promo_code            text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order          public.orders;
  v_tier           public.ticket_tiers;
  v_event          public.events;
  v_existing_count integer;
  v_cap            integer;
  v_subtotal       integer;
  v_commission     integer;
  v_convenience    integer;
  v_platform_fee   integer;
  v_gateway_bps    integer;
  v_gateway        integer;
  v_total          integer;
  v_payout         integer;
  v_fee_payer      text;
  v_ttl_min        integer;
  v_promoter       public.promoters;
  v_link           public.promoter_links;
  v_pcode          public.promoter_promo_codes;
  v_via            text;
  v_discount       integer := 0;
  v_promo_amt      integer := 0;
  v_net            integer;
begin
  if auth.uid() is null then raise exception 'Sign in to book tickets'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be at least 1'; end if;

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

  -- Community event gating (invite token lives in event_invites side table)
  if coalesce(v_event.visibility, 'OPEN') = 'MEMBERS_ONLY' then
    if not exists (
      select 1 from public.community_members
      where community_id = v_event.community_id and user_id = auth.uid() and status = 'ACCEPTED'
    ) then
      raise exception 'MEMBERS_ONLY: This event is for community members only. Join the community first.';
    end if;
  elsif coalesce(v_event.visibility, 'OPEN') = 'INVITE_ONLY' then
    if not exists (select 1 from public.event_invites i
                   where i.event_id = p_event_id and i.token = coalesce(p_invite_token, ''))
       and not exists (
         select 1 from public.community_members
         where community_id = v_event.community_id and user_id = auth.uid() and status = 'ACCEPTED'
       ) then
      raise exception 'INVITE_REQUIRED: This event is invite-only. Open it via the shared link.';
    end if;
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

  v_subtotal := v_tier.price_paise * p_quantity;

  -- Promoter attribution (typed code beats link cookie; one mechanism per order)
  if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    select * into v_pcode
      from public.promoter_promo_codes
     where event_id = p_event_id
       and code = upper(trim(p_promo_code))
       and is_active;
    if not found then raise exception 'Invalid promo code'; end if;
    select * into v_promoter from public.promoters where id = v_pcode.promoter_id;
    if not found or v_promoter.is_blocked or v_promoter.user_id = auth.uid()
       or coalesce(v_event.promoter_mode, 'NONE') <> 'PROMO_CODE' then
      raise exception 'Invalid promo code';
    end if;
    v_via        := 'PROMO_CODE';
    v_discount   := round(v_subtotal * least(coalesce(v_event.promo_buyer_discount_bps, 0), 1500) / 10000.0);
    v_promo_amt  := round(v_subtotal * least(coalesce(v_event.promo_promoter_bps, 0), 1500) / 10000.0);
  elsif p_promoter_slug is not null and length(trim(p_promoter_slug)) > 0
        and coalesce(v_event.promoter_mode, 'NONE') = 'LINK' then
    select * into v_link
      from public.promoter_links
     where event_id = p_event_id
       and slug = lower(trim(p_promoter_slug))
       and is_active;
    if found then
      select * into v_promoter from public.promoters where id = v_link.promoter_id;
      if found and not v_promoter.is_blocked and v_promoter.user_id <> auth.uid() then
        v_via        := 'LINK';
        v_promo_amt  := round(v_subtotal * least(greatest(coalesce(v_event.promoter_commission_bps, 1000), 500), 3000) / 10000.0);
        v_discount   := 0;
      else
        v_promoter.id := null;  -- stale/blocked/self slug → no attribution
      end if;
    end if;
  end if;

  -- Money: commission on GROSS subtotal; convenience + gateway on the
  -- discounted payable. Promoter funded from the organizer payout.
  v_net         := greatest(0, v_subtotal - v_discount);
  v_commission  := case when coalesce(v_event.commission_enabled, true)
                        then round(v_subtotal * coalesce(v_event.commission_bps, 1000) / 10000.0)
                        else 0 end;
  v_convenience := case when coalesce(v_event.convenience_fee_enabled, true)
                        then round(v_net * coalesce(v_event.convenience_fee_bps, 200) / 10000.0)
                        else 0 end;
  v_gateway_bps := public._setting_int('gateway_fee_bps', 236);
  v_gateway     := round((v_net + v_convenience) * v_gateway_bps / (10000.0 - v_gateway_bps));
  v_platform_fee := v_commission + v_convenience;
  v_fee_payer   := coalesce(v_event.fee_payer, 'BUYER');
  v_ttl_min     := public._setting_int('reservation_ttl_minutes', 15);

  if v_fee_payer = 'ORGANIZER' then
    v_total  := v_net;
    v_payout := v_net - v_commission - v_convenience - v_gateway - v_promo_amt;
  else
    v_total  := v_net + v_convenience + v_gateway;
    v_payout := v_net - v_commission - v_promo_amt;
  end if;

  if v_payout < 0 then
    raise exception 'Promo fees exceed ticket value';
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
    reserved_at, reservation_expires_at, idempotency_key,
    discount_paise, promoter_id, promoter_via, promoter_link_id, promo_code,
    promoter_commission_paise
  ) values (
    p_event_id, p_tier_id, auth.uid(), p_quantity,
    v_tier.price_paise, v_subtotal, v_platform_fee,
    v_commission, v_convenience, v_gateway, v_payout,
    v_total, v_fee_payer::fee_payer, 'RESERVED', 'ONLINE',
    p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender,
    now(), now() + make_interval(mins => v_ttl_min),
    p_idempotency_key,
    v_discount,
    case when v_via is not null then v_promoter.id else null end,
    v_via,
    case when v_via = 'LINK' then v_link.id else null end,
    case when v_via = 'PROMO_CODE' then upper(trim(p_promo_code)) else null end,
    v_promo_amt
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

grant execute on function public.create_reserved_order(uuid, uuid, integer, text, text, text, text, text, text, text, text)
  to authenticated, service_role;

-- Fix create_free_order's stale invite_token reference (side-table now).
create or replace function public.create_free_order(
  p_event_id uuid,
  p_tier_id  uuid,
  p_quantity integer,
  p_buyer_name   text default null,
  p_buyer_phone  text default null,
  p_buyer_email  text default null,
  p_buyer_gender text default null,
  p_invite_token text default null
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
  v_cap integer;
begin
  if auth.uid() is null then raise exception 'Sign in to RSVP'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be at least 1'; end if;

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

  if coalesce(v_event.visibility, 'OPEN') = 'MEMBERS_ONLY' then
    if not exists (
      select 1 from public.community_members
      where community_id = v_event.community_id and user_id = auth.uid() and status = 'ACCEPTED'
    ) then
      raise exception 'MEMBERS_ONLY: This event is for community members only. Join the community first.';
    end if;
  elsif coalesce(v_event.visibility, 'OPEN') = 'INVITE_ONLY' then
    if not exists (select 1 from public.event_invites i
                   where i.event_id = p_event_id and i.token = coalesce(p_invite_token, ''))
       and not exists (
         select 1 from public.community_members
         where community_id = v_event.community_id and user_id = auth.uid() and status = 'ACCEPTED'
       ) then
      raise exception 'INVITE_REQUIRED: This event is invite-only. Open it via the shared link.';
    end if;
  end if;

  select * into v_tier from public.ticket_tiers where id = p_tier_id for update;
  if not found then raise exception 'Ticket tier not found'; end if;
  if v_tier.event_id <> p_event_id then raise exception 'Ticket tier does not belong to this event'; end if;
  if v_tier.price_paise <> 0 then raise exception 'This function is for free tickets only'; end if;
  if v_tier.quantity - v_tier.quantity_sold - coalesce(v_tier.quantity_reserved, 0) < p_quantity then
    raise exception 'Not enough tickets available';
  end if;

  v_cap := greatest(1, least(coalesce(v_event.max_tickets_per_user, 5), 10));
  select count(*) into v_existing_count
  from public.tickets
   where event_id = p_event_id and user_id = auth.uid() and status in ('VALID','USED');
  if v_existing_count + (p_quantity * greatest(1, coalesce(v_tier.admits, 1))) > v_cap then
    raise exception 'You can hold at most % ticket(s) for this event (you already hold %)', v_cap, v_existing_count;
  end if;

  insert into public.orders (
    event_id, tier_id, user_id, quantity,
    unit_price_paise, subtotal_paise, platform_fee_paise, total_paise,
    fee_payer, status, buyer_name, buyer_phone, buyer_email, buyer_gender
  ) values (
    p_event_id, p_tier_id, auth.uid(), p_quantity,
    0, 0, 0, 0,
    coalesce(v_event.fee_payer, 'BUYER')::fee_payer, 'CONFIRMED', p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender
  )
  returning * into v_order;

  insert into public.tickets (order_id, event_id, tier_id, user_id, qr_hash)
  select
    v_order.id, p_event_id, p_tier_id, auth.uid(),
    encode(sha256((v_order.id::text || ':' || g::text || ':' || gen_random_uuid()::text)::bytea), 'hex')
  from generate_series(1, p_quantity * greatest(1, coalesce(v_tier.admits, 1))) g;

  update public.ticket_tiers set quantity_sold = quantity_sold + p_quantity where id = p_tier_id;
  update public.events set registrations_count = registrations_count + p_quantity * greatest(1, coalesce(v_tier.admits, 1)) where id = p_event_id;
  delete from public.waitlist where tier_id = p_tier_id and user_id = auth.uid();

  return v_order;
end;
$$;

grant execute on function public.create_free_order(uuid, uuid, integer, text, text, text, text, text)
  to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- Promoter RPCs
-- ═════════════════════════════════════════════════════════════════════════

-- register_event_promoter: any signed-in user can promote an opted-in event.
-- Returns the promoter's share link slug or promo code (idempotent).
create or replace function public.register_event_promoter(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event    public.events;
  v_promoter public.promoters;
  v_link     public.promoter_links;
  v_code     public.promoter_promo_codes;
  v_slug     text;
  v_name     text;
  i          integer;
begin
  if auth.uid() is null then raise exception 'Sign in to promote events'; end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if coalesce(v_event.promoter_mode, 'NONE') = 'NONE' then
    raise exception 'This event has no promoter program';
  end if;
  if v_event.status not in ('PUBLISHED', 'POSTPONED') then
    raise exception 'This event is not open';
  end if;

  -- owner + accepted collaborators can't promote their own event
  if exists (select 1 from public.organizers o
             where o.id = v_event.organizer_id and o.owner_id = auth.uid()) then
    raise exception 'Organizers can''t promote their own event';
  end if;
  if exists (select 1 from public.event_collaborators c
             join public.organizers o on o.id = c.organizer_id
             where c.event_id = p_event_id and o.owner_id = auth.uid() and c.status = 'ACCEPTED') then
    raise exception 'Collaborators can''t promote this event';
  end if;

  select * into v_promoter from public.promoters where user_id = auth.uid();
  if not found then
    insert into public.promoters (user_id) values (auth.uid()) returning * into v_promoter;
  end if;
  if v_promoter.is_blocked then raise exception 'Your promoter account is blocked'; end if;

  if v_event.promoter_mode = 'LINK' then
    select * into v_link from public.promoter_links
     where promoter_id = v_promoter.id and event_id = p_event_id;
    if found then
      if not v_link.is_active then raise exception 'Removed as promoter for this event'; end if;
      return jsonb_build_object('mode','LINK','slug',v_link.slug);
    end if;
    for i in 1..10 loop
      v_slug := lower(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8));
      begin
        insert into public.promoter_links (promoter_id, event_id, slug)
        values (v_promoter.id, p_event_id, v_slug)
        returning * into v_link;
        exit;
      exception when unique_violation then
        if i = 10 then raise; end if;
      end;
    end loop;
    return jsonb_build_object('mode','LINK','slug',v_link.slug);
  else
    select * into v_code from public.promoter_promo_codes
     where promoter_id = v_promoter.id and event_id = p_event_id;
    if found then
      if not v_code.is_active then raise exception 'Removed as promoter for this event'; end if;
      return jsonb_build_object('mode','PROMO_CODE','code',v_code.code);
    end if;
    select coalesce(left(upper(regexp_replace(full_name, '[^A-Za-z]', '', 'g')), 8), 'PROMO')
      into v_name from public.profiles where id = auth.uid();
    for i in 1..10 loop
      declare v_candidate text;
      begin
        v_candidate := v_name || '-' || upper(substr(encode(extensions.gen_random_bytes(2), 'hex'), 1, 4));
        insert into public.promoter_promo_codes (promoter_id, event_id, code)
        values (v_promoter.id, p_event_id, v_candidate)
        returning * into v_code;
        exit;
      exception when unique_violation then
        if i = 10 then raise; end if;
      end;
    end loop;
    return jsonb_build_object('mode','PROMO_CODE','code',v_code.code);
  end if;
end;
$$;

grant execute on function public.register_event_promoter(uuid) to authenticated;

-- organizer_remove_promoter: deactivate a promoter's link AND code for an event.
create or replace function public.organizer_remove_promoter(p_promoter_id uuid, p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_authorized boolean := false;
begin
  select exists (
    select 1 from public.events e
    join public.organizers o on o.id = e.organizer_id
    where e.id = p_event_id and o.owner_id = auth.uid()
  ) or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'ADMIN'
  ) into v_authorized;
  if not v_authorized then raise exception 'Not authorized'; end if;

  update public.promoter_links set is_active = false
   where promoter_id = p_promoter_id and event_id = p_event_id;
  update public.promoter_promo_codes set is_active = false
   where promoter_id = p_promoter_id and event_id = p_event_id;
end;
$$;

grant execute on function public.organizer_remove_promoter(uuid, uuid) to authenticated;

-- log_promoter_click: called by /p/<slug> (service-role path inserts directly,
-- but grant this for completeness/future client use).
create or replace function public.promoter_slug_lookup(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_link public.promoter_links;
begin
  select * into v_link from public.promoter_links l
   where l.slug = lower(p_slug) and l.is_active;
  if not found then return null; end if;
  return jsonb_build_object('link_id', v_link.id, 'event_id', v_link.event_id);
end;
$$;

grant execute on function public.promoter_slug_lookup(text) to anon, authenticated, service_role;
-- Snapshot the effective bps on the order at reservation time.
alter table public.orders add column if not exists promoter_commission_bps integer not null default 0;

update public.orders o set promoter_commission_bps =
  case when o.promoter_via = 'LINK'
       then (select e.promoter_commission_bps from public.events e where e.id = o.event_id)
       else (select e.promo_promoter_bps from public.events e where e.id = o.event_id) end
 where o.promoter_id is not null and o.promoter_commission_bps = 0;

-- ── Earning on confirmation: a confirmed paid order with a promoter mints
-- an EARNING row. Covers apply_captured_payment, admin approval, manual
-- settle — every CONFIRMED transition, idempotent via unique(order_id).
create or replace function public.trg_promoter_earning()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.promoter_id is not null
     and new.status = 'CONFIRMED'
     and new.status is distinct from old.status then
    insert into public.promoter_earnings (
      order_id, promoter_id, event_id, organizer_id, via,
      link_id, promo_code_id, ticket_subtotal_paise, commission_bps, amount_paise
    ) values (
      new.id, new.promoter_id, new.event_id,
      (select organizer_id from public.events where id = new.event_id),
      new.promoter_via,
      case when new.promoter_via = 'LINK' then new.promoter_link_id else null end,
      case when new.promoter_via = 'PROMO_CODE' then
        (select id from public.promoter_promo_codes where event_id = new.event_id and code = new.promo_code limit 1)
        else null end,
      new.subtotal_paise,
      new.promoter_commission_bps,
      new.promoter_commission_paise
    ) on conflict (order_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_promoter_earning on public.orders;
create trigger trg_promoter_earning
  after update on public.orders
  for each row execute function public.trg_promoter_earning();

-- ── Reversal on refund: every refund path (cancel, postponement, admin)
-- reverses promoter commission proportionally. Unpaid earnings claw in
-- place; paid earnings mint a negative CLAWBACK row against future payouts.
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
  if not found or v_order.promoter_id is null then return new; end if;

  select * into v_earn from public.promoter_earnings
   where order_id = new.order_id and kind = 'EARNING';
  if not found then return new; end if;

  -- proportional claw: refund.amount / order.total × earning
  v_claw := least(
    round(coalesce(new.amount_paise, 0)::numeric / nullif(greatest(v_order.total_paise, 1), 0) * v_earn.amount_paise),
    v_earn.amount_paise - v_earn.reversed_paise
  );
  if v_claw <= 0 then return new; end if;

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
  return new;
end;
$$;

drop trigger if exists trg_refund_reverse_promoter on public.refunds;
create trigger trg_refund_reverse_promoter
  after insert on public.refunds
  for each row execute function public.trg_refund_reverse_promoter();

-- admin_set_promoter_blocked
create or replace function public.admin_set_promoter_blocked(p_promoter_id uuid, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p
                 where p.id = auth.uid() and (p.is_admin or p.role = 'ADMIN')) then
    raise exception 'Admin only';
  end if;
  update public.promoters set is_blocked = p_blocked where id = p_promoter_id;
end;
$$;

grant execute on function public.admin_set_promoter_blocked(uuid, boolean) to authenticated;

-- settleable_promoter_paise: earnings older than event.ends_at + hold_days,
-- net of clawbacks. Used by the promoter dashboard + admin payout screen.
create or replace function public.promoter_payable_paise(p_promoter_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold int;
  v_sum  integer;
begin
  v_hold := public._setting_int('promoter_hold_days', 7);
  select coalesce(sum(e.amount_paise - e.reversed_paise), 0) into v_sum
    from public.promoter_earnings e
    join public.events ev on ev.id = e.event_id
   where e.promoter_id = p_promoter_id
     and e.status in ('EARNED','REVERSED')
     and ev.ends_at + make_interval(days => v_hold) <= now();
  return greatest(v_sum, 0);
end;
$$;

grant execute on function public.promoter_payable_paise(uuid) to authenticated, service_role;

-- STEP 48: community social links (youtube/x/linkedin/facebook/website)
alter table public.communities
  add column if not exists youtube_url text,
  add column if not exists x_url text,
  add column if not exists linkedin_url text,
  add column if not exists facebook_url text,
  add column if not exists website_url text;
