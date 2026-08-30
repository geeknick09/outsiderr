-- Outsider (outsiderr.in) — Phase 1 schema.
-- Run with: supabase db reset  (or paste into the Supabase SQL editor).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
do $$ begin
  create type event_category as enum ('CYPHER_BATTLE','SKATE_STUNT','MEETUP_RUN','JAM_GIG','WORKSHOP','OTHER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type city as enum ('KOLKATA','MUMBAI','DELHI','BENGALURU');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fee_payer as enum ('BUYER','ORGANIZER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_status as enum ('DRAFT','PUBLISHED','CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('PENDING_VERIFICATION','CONFIRMED','REJECTED','CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('VALID','USED','VOID');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- tables
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  theme_preference text not null default 'dark' check (theme_preference in ('dark','light','system')),
  is_organizer boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.organizers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  bio text,
  avatar_url text,
  upi_id text,
  upi_qr_url text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists organizers_owner_idx on public.organizers(owner_id);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  title text not null,
  description text not null default '',
  things_to_know text[] not null default '{}',
  category event_category not null,
  city city not null,
  venue_name text not null,
  venue_address text not null default '',
  latitude double precision,
  longitude double precision,
  starts_at timestamptz not null,
  ends_at timestamptz,
  card_poster_url text,
  banner_poster_url text,
  fee_payer fee_payer not null default 'BUYER',
  status event_status not null default 'PUBLISHED',
  is_featured boolean not null default false,
  needs_door_staff boolean not null default false,
  terms text[] not null default '{}',
  registrations_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists events_city_starts_idx on public.events(city, starts_at);
create index if not exists events_category_idx on public.events(category);
create index if not exists events_featured_idx on public.events(is_featured) where is_featured;

create table if not exists public.ticket_tiers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  price_paise integer not null check (price_paise >= 0),
  quantity integer not null check (quantity >= 0),
  quantity_sold integer not null default 0 check (quantity_sold >= 0),
  perks text[] not null default '{}',
  sort_order integer not null default 0,
  constraint ticket_tiers_not_oversold check (quantity_sold <= quantity)
);
create index if not exists ticket_tiers_event_idx on public.ticket_tiers(event_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  tier_id uuid not null references public.ticket_tiers(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 5),
  unit_price_paise integer not null check (unit_price_paise >= 0),
  subtotal_paise integer not null,
  platform_fee_paise integer not null,
  total_paise integer not null,
  fee_payer fee_payer not null,
  status order_status not null default 'PENDING_VERIFICATION',
  utr_reference text,
  payment_proof_url text,
  buyer_name text,
  buyer_phone text,
  rejection_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders(user_id, created_at desc);
create index if not exists orders_event_status_idx on public.orders(event_id, status);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  tier_id uuid not null references public.ticket_tiers(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  qr_hash text not null unique,
  status ticket_status not null default 'VALID',
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists tickets_event_idx on public.tickets(event_id);
create index if not exists tickets_user_idx on public.tickets(user_id);

-- ---------------------------------------------------------------- helpers
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
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.phone,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- rpc
-- Confirms a manually verified UPI payment: mints ticket QR hashes,
-- decrements tier availability and bumps the event registration counter.
create or replace function public.approve_order(p_order_id uuid)
returns setof public.tickets
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
  if not public.is_event_staff(v_order.event_id) then
    raise exception 'Not authorised to review this order';
  end if;
  if v_order.status <> 'PENDING_VERIFICATION' then
    raise exception 'Order is already %', v_order.status;
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
  select v_order.id,
         v_order.event_id,
         v_order.tier_id,
         v_order.user_id,
         encode(sha256((v_order.id::text || ':' || g::text || ':' || gen_random_uuid()::text)::bytea), 'hex')
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
  if not public.is_event_staff(v_order.event_id) then
    raise exception 'Not authorised to review this order';
  end if;

  update public.orders
     set status = 'REJECTED',
         rejection_reason = p_reason,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- Door scanner: single round-trip validate + check-in.
create or replace function public.check_in_ticket(p_qr_hash text)
returns table (
  outcome text,
  event_title text,
  tier_name text,
  holder_name text,
  checked_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
begin
  select * into v_ticket from public.tickets where qr_hash = p_qr_hash for update;

  if not found then
    return query select 'INVALID'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if not public.is_event_staff(v_ticket.event_id) then
    raise exception 'Not authorised to scan tickets for this event';
  end if;

  if v_ticket.status <> 'VALID' then
    return query
      select case when v_ticket.status = 'USED' then 'ALREADY_USED' else 'INVALID' end,
             e.title, t.name, p.full_name, v_ticket.checked_in_at
        from public.events e
        join public.ticket_tiers t on t.id = v_ticket.tier_id
        left join public.profiles p on p.id = v_ticket.user_id
       where e.id = v_ticket.event_id;
    return;
  end if;

  update public.tickets
     set status = 'USED', checked_in_at = now(), checked_in_by = auth.uid()
   where id = v_ticket.id
  returning * into v_ticket;

  return query
    select 'VALID'::text, e.title, t.name, p.full_name, v_ticket.checked_in_at
      from public.events e
      join public.ticket_tiers t on t.id = v_ticket.tier_id
      left join public.profiles p on p.id = v_ticket.user_id
     where e.id = v_ticket.event_id;
end;
$$;

-- ---------------------------------------------------------------- rls
alter table public.profiles enable row level security;
alter table public.organizers enable row level security;
alter table public.events enable row level security;
alter table public.ticket_tiers enable row level security;
alter table public.orders enable row level security;
alter table public.tickets enable row level security;

drop policy if exists "profiles are self readable" on public.profiles;
create policy "profiles are self readable" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles are self writable" on public.profiles;
create policy "profiles are self writable" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "organizers are public" on public.organizers;
create policy "organizers are public" on public.organizers for select using (true);

drop policy if exists "organizers are owner managed" on public.organizers;
create policy "organizers are owner managed" on public.organizers
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "published events are public" on public.events;
create policy "published events are public" on public.events
  for select using (status = 'PUBLISHED' or public.is_event_staff(id));

drop policy if exists "events are organizer managed" on public.events;
create policy "events are organizer managed" on public.events
  for all using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );

drop policy if exists "tiers are public" on public.ticket_tiers;
create policy "tiers are public" on public.ticket_tiers for select using (true);

drop policy if exists "tiers are organizer managed" on public.ticket_tiers;
create policy "tiers are organizer managed" on public.ticket_tiers
  for all using (public.is_event_staff(event_id)) with check (public.is_event_staff(event_id));

drop policy if exists "orders are visible to buyer and organizer" on public.orders;
create policy "orders are visible to buyer and organizer" on public.orders
  for select using (auth.uid() = user_id or public.is_event_staff(event_id));

drop policy if exists "buyers create their own orders" on public.orders;
create policy "buyers create their own orders" on public.orders
  for insert with check (auth.uid() = user_id);

drop policy if exists "tickets are visible to holder and organizer" on public.tickets;
create policy "tickets are visible to holder and organizer" on public.tickets
  for select using (auth.uid() = user_id or public.is_event_staff(event_id));

-- ---------------------------------------------------------------- 2025 migration — v2 features

-- profiles: admin flag
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- events: tags + photo gallery
alter table public.events add column if not exists tags text[] not null default '{}';
alter table public.events add column if not exists photo_urls text[] not null default '{}';

-- ---------------------------------------------------------------- waitlist
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position integer not null,
  status text not null default 'WAITING' check (status in ('WAITING','OFFERED','EXPIRED')),
  offered_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint waitlist_unique_user_tier unique (tier_id, user_id)
);
create index if not exists waitlist_tier_pos_idx on public.waitlist(tier_id, position);
create index if not exists waitlist_user_idx on public.waitlist(user_id);

-- ---------------------------------------------------------------- push_subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);
create index if not exists push_subs_user_idx on public.push_subscriptions(user_id);

-- ---------------------------------------------------------------- boosts
create table if not exists public.boosts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  slot integer not null check (slot between 1 and 10),
  amount_paid_paise integer not null check (amount_paid_paise > 0),
  status text not null default 'PENDING'
    check (status in ('PENDING','ACTIVE','EXPIRED','REJECTED')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  utr_reference text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists boosts_status_slot_idx on public.boosts(status, slot);
create index if not exists boosts_event_idx on public.boosts(event_id);

-- ---------------------------------------------------------------- boost_slot_prices (admin-configurable)
create table if not exists public.boost_slot_prices (
  slot integer primary key check (slot between 1 and 10),
  price_paise integer not null check (price_paise > 0)
);
insert into public.boost_slot_prices (slot, price_paise) values
  (1,500000),(2,400000),(3,300000),(4,250000),(5,200000),
  (6,175000),(7,150000),(8,125000),(9,100000),(10,75000)
on conflict do nothing;

-- ---------------------------------------------------------------- RLS for new tables
alter table public.waitlist enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.boosts enable row level security;
alter table public.boost_slot_prices enable row level security;

drop policy if exists "waitlist self or staff" on public.waitlist;
create policy "waitlist self or staff" on public.waitlist
  for select using (auth.uid() = user_id or public.is_event_staff(event_id));

drop policy if exists "waitlist self insert" on public.waitlist;
create policy "waitlist self insert" on public.waitlist
  for insert with check (auth.uid() = user_id);

drop policy if exists "waitlist self delete" on public.waitlist;
create policy "waitlist self delete" on public.waitlist
  for delete using (auth.uid() = user_id);

drop policy if exists "push subs self" on public.push_subscriptions;
create policy "push subs self" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "boosts active public" on public.boosts;
create policy "boosts active public" on public.boosts
  for select using (status = 'ACTIVE' or public.is_event_staff(event_id));

drop policy if exists "boosts organizer insert" on public.boosts;
create policy "boosts organizer insert" on public.boosts
  for insert with check (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );

drop policy if exists "boost prices public" on public.boost_slot_prices;
create policy "boost prices public" on public.boost_slot_prices
  for select using (true);

-- ---------------------------------------------------------------- RPC: offer next person on waitlist
create or replace function public.offer_waitlist_next(p_tier_id uuid)
returns void
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
  if not found then return; end if;
  update public.waitlist
  set status = 'OFFERED',
      offered_at = now(),
      expires_at = now() + interval '24 hours'
  where id = v_next.id;
end;
$$;
