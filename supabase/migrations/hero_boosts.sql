-- ============================================================
-- Hero Boosts Migration — Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add hero boost settings to platform_settings
insert into public.platform_settings (key, value, description) values
  ('hero_boost_enabled',              'true',   'Enable/disable the Hero Boost feature'),
  ('hero_boost_price',                '99900',  'Price for a 7-day Hero Boost in paise (₹999)'),
  ('hero_boost_duration_days',        '7',      'Hero Boost duration in days'),
  ('hero_rotation_interval_minutes',  '30',     'Hero carousel rotation interval in minutes'),
  ('hero_max_visible_events',         '7',      'Maximum Hero events displayed at once')
on conflict (key) do nothing;

-- 2. Add contact columns to events table
alter table public.events add column if not exists contact_email text;
alter table public.events add column if not exists contact_phone text;

-- 3. Create hero_boosts table
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

-- 4. Indexes
create index if not exists hero_boosts_event_idx     on public.hero_boosts(event_id);
create index if not exists hero_boosts_organizer_idx on public.hero_boosts(organizer_id);
create index if not exists hero_boosts_status_idx    on public.hero_boosts(status);
create index if not exists hero_boosts_expires_idx   on public.hero_boosts(expires_at);
create index if not exists hero_boosts_started_idx   on public.hero_boosts(started_at);

-- Prevent duplicate active boosts for the same event
create unique index if not exists hero_boosts_one_active_per_event
  on public.hero_boosts(event_id)
  where status = 'ACTIVE';

-- 5. RLS
alter table public.hero_boosts enable row level security;

-- Organizers can read their own boosts
drop policy if exists "organizer read own hero boosts" on public.hero_boosts;
create policy "organizer read own hero boosts" on public.hero_boosts
  for select using (
    exists (select 1 from public.organizers o
            join public.profiles p on p.id = o.owner_id
            where o.id = hero_boosts.organizer_id and p.id = auth.uid())
  );

-- Organizers can insert boosts (pending only)
drop policy if exists "organizer insert hero boosts" on public.hero_boosts;
create policy "organizer insert hero boosts" on public.hero_boosts
  for insert with check (
    exists (select 1 from public.organizers o
            join public.profiles p on p.id = o.owner_id
            where o.id = hero_boosts.organizer_id and p.id = auth.uid())
    and status = 'PENDING'
  );

-- Admins can read/update/delete all boosts
drop policy if exists "admin read hero boosts" on public.hero_boosts;
create policy "admin read hero boosts" on public.hero_boosts
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "admin update hero boosts" on public.hero_boosts;
create policy "admin update hero boosts" on public.hero_boosts
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "admin delete hero boosts" on public.hero_boosts;
create policy "admin delete hero boosts" on public.hero_boosts
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );
