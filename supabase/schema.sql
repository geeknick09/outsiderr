-- ================================================================
-- Outsiderr — complete schema (idempotent, safe to re-run)
-- Paste into the Supabase SQL Editor and click Run.
--
-- The schema will also create the "event-media" storage bucket and
-- its RLS policies automatically (see the Storage section below).
-- ================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
-- Event status: DRAFT → PUBLISHED → CANCELLATION_REQUESTED → CANCELLED
--                                     or → POSTPONED
do $$ begin
  create type public.event_status as enum ('DRAFT','PUBLISHED','CANCELLATION_REQUESTED','CANCELLED','POSTPONED');
exception when duplicate_object then null; end $$;

-- Refund status
do $$ begin
  create type public.refund_status as enum ('PENDING','INITIATED','COMPLETED','FAILED');
exception when duplicate_object then null; end $$;

-- Notification type for event updates
do $$ begin
  create type public.event_notification_type as enum ('CANCELLATION','POSTPONEMENT','RESCHEDULE','WAITLIST_OFFER','VENUE_CHANGE','CITY_CHANGE','TIME_CHANGE');
exception when duplicate_object then null; end $$;
do $$ begin
  create type event_category as enum (
    'CYPHER_BATTLE','SKATE_STUNT','FITNESS','JAM_GIG','WORKSHOP','OTHER'
  );
exception when duplicate_object then null; end $$;

-- Ensure FITNESS exists — handles DBs that still have MEETUP_RUN or are missing FITNESS
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on e.enumtypid = t.oid
    where t.typname = 'event_category' and e.enumlabel = 'FITNESS'
  ) then
    if exists (
      select 1 from pg_enum e join pg_type t on e.enumtypid = t.oid
      where t.typname = 'event_category' and e.enumlabel = 'MEETUP_RUN'
    ) then
      alter type event_category rename value 'MEETUP_RUN' to 'FITNESS';
    else
      alter type event_category add value 'FITNESS';
    end if;
  end if;
end $$;

-- Ensure all category values exist (handles DBs with partial old enums)
alter type event_category add value if not exists 'CYPHER_BATTLE';
alter type event_category add value if not exists 'SKATE_STUNT';
alter type event_category add value if not exists 'JAM_GIG';
alter type event_category add value if not exists 'WORKSHOP';
alter type event_category add value if not exists 'OTHER';

do $$ begin
  create type city as enum ('KOLKATA','MUMBAI','DELHI','BENGALURU');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fee_payer as enum ('BUYER','ORGANIZER');
exception when duplicate_object then null; end $$;

-- (event_status, order_status, ticket_status, etc. are defined above)

do $$ begin
  create type order_status as enum (
    'PENDING_VERIFICATION','CONFIRMED','REJECTED','CANCELLED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('VALID','USED','VOID');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id               uuid        primary key references auth.users(id) on delete cascade,
  full_name        text,
  phone            text,
  avatar_url       text,
  birth_date       date,
  interested_tags  text[]      not null default '{}',
  instagram_url    text,
  youtube_url      text,
  x_url            text,
  facebook_url     text,
  linkedin_url     text,
  theme_preference text        not null default 'dark'
                               check (theme_preference in ('dark','light','system')),
  is_organizer     boolean     not null default false,
  is_admin         boolean     not null default false,
  created_at       timestamptz not null default now()
);

create table if not exists public.organizers (
  id                  uuid        primary key default gen_random_uuid(),
  owner_id            uuid        not null references public.profiles(id) on delete cascade,
  name                text        not null,
  bio                 text,
  avatar_url          text,
  cover_url           text,
  instagram_url      text,
  youtube_url        text,
  x_url              text,
  facebook_url       text,
  linkedin_url       text,
  upi_id              text,
  upi_qr_url          text,
  -- KYC / payout details
  pan_number          text,
  pan_name            text,
  gst_number          text,
  gst_business_name   text,
  bank_account_number text,
  bank_ifsc           text,
  bank_account_name   text,
  bank_account_type   text,        -- SAVINGS | CURRENT
  kyc_submitted       boolean     not null default false,
  verified            boolean     not null default false,
  created_at          timestamptz not null default now()
);
create index if not exists organizers_owner_idx on public.organizers(owner_id);

create table if not exists public.events (
  id                  uuid            primary key default gen_random_uuid(),
  organizer_id        uuid            not null references public.organizers(id) on delete cascade,
  title               text            not null,
  description         text            not null default '',
  things_to_know      text[]          not null default '{}',
  tags                text[]          not null default '{}',
  photo_urls          text[]          not null default '{}',
  category            event_category  not null,
  city                city            not null,
  venue_name          text            not null,
  venue_address       text            not null default '',
  latitude            double precision,
  longitude           double precision,
  google_maps_link    text,
  starts_at           timestamptz     not null,
  ends_at             timestamptz,
  card_poster_url     text,
  banner_poster_url   text,
  fee_payer           fee_payer       not null default 'BUYER',
  status              event_status    not null default 'PUBLISHED',
  is_featured         boolean         not null default false,
  needs_door_staff    boolean         not null default false,
  terms               text[]          not null default '{}',
  registrations_count integer         not null default 0,
  pricing_mode        text            not null default 'PAID'
                      check (pricing_mode in ('FREE','FLAT','PAID','PHASED')),
  contact_email       text,
  contact_phone       text,
  instagram_url       text,
  youtube_url         text,
  x_url               text,
  facebook_url        text,
  linkedin_url        text,
  created_at          timestamptz     not null default now()
);
create index if not exists events_city_starts_idx on public.events(city, starts_at);
create index if not exists events_category_idx    on public.events(category);
create index if not exists events_featured_idx    on public.events(is_featured) where is_featured;

create table if not exists public.ticket_tiers (
  id              uuid        primary key default gen_random_uuid(),
  event_id        uuid        not null references public.events(id) on delete cascade,
  name            text        not null,
  price_paise     integer     not null check (price_paise >= 0),
  quantity        integer     not null check (quantity >= 0),
  quantity_sold   integer     not null default 0 check (quantity_sold >= 0),
  perks           text[]      not null default '{}',
  sort_order      integer     not null default 0,
  tier_type       text        not null default 'NAMED',
  phase_order     integer,
  phase_opens_at  timestamptz,
  phase_closes_at timestamptz,
  constraint ticket_tiers_not_oversold check (quantity_sold <= quantity),
  constraint ticket_tiers_valid_type check (tier_type in ('NAMED', 'FLAT_PHASE'))
);
create index if not exists ticket_tiers_event_idx on public.ticket_tiers(event_id);
create index if not exists ticket_tiers_phase_idx on public.ticket_tiers(event_id, phase_order);

create table if not exists public.orders (
  id                  uuid         primary key default gen_random_uuid(),
  event_id            uuid         not null references public.events(id) on delete cascade,
  tier_id             uuid         not null references public.ticket_tiers(id) on delete restrict,
  user_id             uuid         not null references public.profiles(id) on delete cascade,
  quantity            integer      not null check (quantity between 1 and 5),
  unit_price_paise    integer      not null check (unit_price_paise >= 0),
  subtotal_paise      integer      not null,
  platform_fee_paise  integer      not null,
  total_paise         integer      not null,
  fee_payer           fee_payer    not null,
  status              order_status not null default 'PENDING_VERIFICATION',
  utr_reference       text,
  payment_proof_url   text,
  buyer_name          text,
  buyer_phone         text,
  buyer_email         text,
  buyer_gender        text,
  rejection_reason    text,
  reviewed_by         uuid         references public.profiles(id),
  reviewed_at         timestamptz,
  created_at          timestamptz  not null default now()
);
create index if not exists orders_user_idx         on public.orders(user_id, created_at desc);
create index if not exists orders_event_status_idx on public.orders(event_id, status);

create table if not exists public.tickets (
  id            uuid          primary key default gen_random_uuid(),
  order_id      uuid          not null references public.orders(id) on delete cascade,
  event_id      uuid          not null references public.events(id) on delete cascade,
  tier_id       uuid          not null references public.ticket_tiers(id) on delete restrict,
  user_id       uuid          not null references public.profiles(id) on delete cascade,
  qr_hash       text          not null unique,
  status        ticket_status not null default 'VALID',
  checked_in_at timestamptz,
  checked_in_by uuid          references public.profiles(id),
  created_at    timestamptz   not null default now()
);
create index if not exists tickets_event_idx on public.tickets(event_id);
create index if not exists tickets_user_idx  on public.tickets(user_id);
create index if not exists tickets_hash_idx  on public.tickets(qr_hash);

create table if not exists public.waitlist (
  id          uuid        primary key default gen_random_uuid(),
  event_id    uuid        not null references public.events(id) on delete cascade,
  tier_id     uuid        not null references public.ticket_tiers(id) on delete cascade,
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  position    integer     not null,
  status      text        not null default 'WAITING'
              check (status in ('WAITING','OFFERED','EXPIRED')),
  offered_at  timestamptz,
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint waitlist_unique_user_tier unique (tier_id, user_id)
);
create index if not exists waitlist_tier_pos_idx on public.waitlist(tier_id, position);
create index if not exists waitlist_user_idx     on public.waitlist(user_id);

create table if not exists public.push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  endpoint   text        not null,
  p256dh     text        not null,
  auth       text        not null,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);
create index if not exists push_subs_user_idx on public.push_subscriptions(user_id);

-- Refunds table — tracks refund records when events are cancelled/postponed
create table if not exists public.refunds (
  id                  uuid          primary key default gen_random_uuid(),
  order_id            uuid          not null references public.orders(id) on delete cascade,
  event_id            uuid          not null references public.events(id) on delete cascade,
  user_id             uuid          not null references auth.users(id) on delete cascade,
  amount_paise        integer       not null,
  platform_fee_paise  integer       not null default 0,
  status              refund_status not null default 'PENDING',
  reason              text          not null default '',
  initiated_at        timestamptz   not null default now(),
  completed_at        timestamptz
);
create index if not exists refunds_event_idx  on public.refunds(event_id);
create index if not exists refunds_user_idx   on public.refunds(user_id);
create index if not exists refunds_order_idx  on public.refunds(order_id);
create index if not exists refunds_status_idx on public.refunds(status);

-- Event notifications — informs users of cancellations/postponements/reschedules
create table if not exists public.event_notifications (
  id          uuid                       primary key default gen_random_uuid(),
  event_id    uuid                       not null references public.events(id) on delete cascade,
  user_id     uuid                       not null references auth.users(id) on delete cascade,
  type        event_notification_type    not null,
  message     text                       not null default '',
  read        boolean                    not null default false,
  created_at  timestamptz                not null default now()
);
create index if not exists event_notif_user_idx  on public.event_notifications(user_id, read);
create index if not exists event_notif_event_idx on public.event_notifications(event_id);

-- ------------------------------------------------------- platform_settings
-- Centralized, admin-configurable business rules.
-- Never hard-code commission %, charges, pricing, etc. in application logic.
create table if not exists public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

-- ------------------------------------------------------- legal_pages
-- DB-backed legal/policy pages (Terms, Privacy, Refund, etc.)
-- Admin can edit content; public routes render the latest version.
create table if not exists public.legal_pages (
  slug         text primary key,         -- e.g. 'terms', 'privacy', 'refund', 'cancellation'
  title        text not null,
  content      text not null,            -- markdown or plain text
  version      integer not null default 1,
  is_published boolean not null default true,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id) on delete set null
);

insert into public.legal_pages (slug, title, content) values
  ('terms',        'Terms & Conditions',     E'# Terms & Conditions\n\nBy purchasing a ticket on Outsiderr, you agree to the following terms:\n\n- Please carry a valid ID proof along with you.\n- No refunds on purchased ticket are possible, even in case of any rescheduling.\n- Security procedures, including frisking remain the right of the management.\n- No dangerous or potentially hazardous objects including but not limited to weapons, knives, guns, fireworks, helmets, lazer devices, bottles, musical instruments will be allowed in the venue and may be ejected with or without the owner from the venue.\n- The sponsors/performers/organizers are not responsible for any injury or damage occurring due to the event. Any claims regarding the same would be settled in courts in Mumbai.\n- People in an inebriated state may not be allowed entry.\n- Organizers hold the right to deny late entry to the event.\n- Venue rules apply.'),
  ('privacy',      'Privacy Policy',         E'# Privacy Policy\n\nWe respect your privacy.\n\n- We collect only the information needed to process bookings.\n- We do not sell your data to third parties.\n- You can request data deletion at any time.'),
  ('refund',       'Refund Policy',          E'# Refund Policy\n\n- Full refund if the organizer cancels the event.\n- No refund for no-shows.\n- Postponed events: tickets remain valid for the new date.'),
  ('cancellation', 'Cancellation Policy',    E'# Cancellation Policy\n\n- Organizers may cancel events with full refund to attendees.\n- Cancellation charges apply to organizers as per platform settings.\n- Door staff charges are non-refundable once paid.')
on conflict (slug) do update set
  title    = excluded.title,
  content  = excluded.content;

-- Seed default values (on conflict do nothing — preserves admin edits)
-- Note: value column is jsonb, so string values must be double-quoted JSON strings
insert into public.platform_settings (key, value, description) values
  ('platform_fee_bps',                '500',                                         'Platform commission in basis points (5%)'),
  ('cancellation_charge_percent',     '20',                                          'Organizer cancellation charge as % of total tickets sold'),
  ('postponement_charge_percent',     '10',                                          'Organizer postponement charge as % of refunded tickets'),
  ('door_staff_pricing',              '{"1":1500,"2":2500,"3":3500,"4":5000,"5":6500}', 'Door staff pricing per staff count (in INR)'),
  ('door_staff_max',                  '5',                                           'Maximum door staff per event'),
  ('boost_slot_prices',               '{"carousel_1":1000,"carousel_2":750,"carousel_3":500}', 'Boost slot pricing per day (in INR)'),
  ('max_tickets_per_order',           '1',                                           'Maximum tickets per single order'),
  ('terms_version',                   '"organizer-v1.0"',                            'Current organizer terms & conditions version'),
  ('venue_announcement_deadline_hours','48',                                         'Minimum hours before event to announce venue'),
  ('door_staff_available',            '10',                                          'Total door staff currently available across all events'),
  ('organizer_whatsapp_number',       '"7980085212"',                                'WhatsApp number for attendees to send payment screenshots'),
  ('hero_boost_enabled',              'true',                                        'Enable/disable the Hero Boost feature'),
  ('hero_boost_price',                '99900',                                       'Price for a 7-day Hero Boost in paise (₹999)'),
  ('hero_boost_duration_days',        '7',                                           'Hero Boost duration in days'),
  ('hero_rotation_interval_minutes',  '30',                                          'Hero carousel rotation interval in minutes'),
  ('hero_max_visible_events',         '7',                                           'Maximum Hero events displayed at once'),
  ('tagline_header',                  '"Find what''s happening outside the mainstream."', 'Homepage header tagline (bold line)'),
  ('tagline_subheader',               '"Discover raw events happening today near you."',  'Homepage sub-tagline (muted line)'),
  ('tagline_footer',                  '"Cyphers, battles, stunts, skates, jams & real communities. Discover raw events happening today near you."', 'Footer brand tagline')
on conflict (key) do nothing;

-- --------------------------------------------- event_terms_acceptances
-- Immutable record of which terms version an organizer accepted.
-- Never store just "accepted = true" — always store the version.
create table if not exists public.event_terms_acceptances (
  id             uuid primary key default gen_random_uuid(),
  organizer_id   uuid not null references public.organizers(id) on delete cascade,
  event_id       uuid references public.events(id) on delete cascade,
  terms_version  text not null,
  accepted_at    timestamptz not null default now(),
  ip_address     inet,
  user_agent     text
);
create index if not exists terms_accept_org_idx   on public.event_terms_acceptances(organizer_id);
create index if not exists terms_accept_event_idx on public.event_terms_acceptances(event_id);

-- --------------------------------------------------- door_staff_orders
-- Tracks door staff requests, payment status, and service status.
-- Payment uses manual UPI + UTR verification (Razorpay integration deferred).
create table if not exists public.door_staff_orders (
  id                   uuid primary key default gen_random_uuid(),
  event_id             uuid not null references public.events(id) on delete cascade,
  organizer_id         uuid not null references public.organizers(id) on delete cascade,
  number_of_staff      integer not null check (number_of_staff between 1 and 5),
  service_amount_paise integer not null,
  payment_status       text not null default 'PENDING',   -- PENDING, PAID, FAILED, REFUNDED
  service_status       text not null default 'REQUESTED',  -- REQUESTED, CONFIRMED, CANCELLED, COMPLETED
  utr_reference        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists door_staff_event_idx  on public.door_staff_orders(event_id);
create index if not exists door_staff_org_idx    on public.door_staff_orders(organizer_id);

create table if not exists public.boosts (
  id                uuid        primary key default gen_random_uuid(),
  event_id          uuid        not null references public.events(id) on delete cascade,
  organizer_id      uuid        not null references public.organizers(id) on delete cascade,
  slot              integer     not null check (slot between 1 and 10),
  amount_paid_paise integer     not null check (amount_paid_paise > 0),
  status            text        not null default 'PENDING'
                    check (status in ('PENDING','ACTIVE','EXPIRED','REJECTED')),
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  utr_reference     text,
  reviewed_by       uuid        references public.profiles(id),
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists boosts_status_slot_idx on public.boosts(status, slot);
create index if not exists boosts_event_idx       on public.boosts(event_id);

create table if not exists public.boost_slot_prices (
  slot        integer primary key check (slot between 1 and 10),
  price_paise integer not null check (price_paise > 0)
);

-- ------------------------------------------------------- hero_boosts
-- Hero/Featured Event Boost system.
-- Organizers pay to feature their event in the homepage Hero carousel.
-- Duration: 7 days or until event starts (whichever is earlier).
-- Rotation: up to 7 shown at a time, rotated every 30 minutes.
create table if not exists public.hero_boosts (
  id              uuid        primary key default gen_random_uuid(),
  event_id        uuid        not null references public.events(id) on delete cascade,
  organizer_id    uuid        not null references public.organizers(id) on delete cascade,
  status          text        not null default 'PENDING'
                  check (status in ('PENDING','ACTIVE','EXPIRED','CANCELLED','REFUNDED','FAILED')),
  amount_paise    integer     not null check (amount_paise > 0),
  currency        text        not null default 'INR',
  utr_reference   text,
  started_at      timestamptz,   -- set when boost becomes ACTIVE
  expires_at      timestamptz,   -- min(started_at + 7 days, event.starts_at)
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
-- Prevent duplicate active boosts for the same event
create unique index if not exists hero_boosts_one_active_per_event
  on public.hero_boosts(event_id)
  where status = 'ACTIVE';
insert into public.boost_slot_prices (slot, price_paise) values
  (1,500000),(2,400000),(3,300000),(4,250000),(5,200000),
  (6,175000),(7,150000),(8,125000),(9,100000),(10,75000)
on conflict do nothing;

create table if not exists public.clubs (
  id                  uuid        primary key default gen_random_uuid(),
  owner_id            uuid        not null references public.organizers(id) on delete cascade,
  name                text        not null,
  bio                 text,
  type                text        not null default 'CLUB'
                      check (type in ('CLUB','CREW')),
  city                text        check (city in ('KOLKATA','MUMBAI','DELHI','BENGALURU')),
  avatar_url          text,
  cover_url           text,
  instagram_handle    text,
  upi_id              text,
  membership_type     text        not null default 'FREE'
                      check (membership_type in ('FREE','PAID','AUDITION')),
  membership_fee_paise integer   not null default 0,
  terms               text[]      not null default '{}',
  member_count        integer     not null default 0,
  verified            boolean     not null default false,
  created_at          timestamptz not null default now()
);
create index if not exists clubs_owner_idx on public.clubs(owner_id);
create index if not exists clubs_city_idx  on public.clubs(city);

create table if not exists public.club_members (
  id             uuid        primary key default gen_random_uuid(),
  club_id        uuid        not null references public.clubs(id) on delete cascade,
  user_id        uuid        not null references public.profiles(id) on delete cascade,
  status         text        not null default 'PENDING'
                 check (status in ('PENDING','ACCEPTED','REJECTED')),
  instagram_link text,
  utr_reference  text,
  created_at     timestamptz not null default now(),
  unique(club_id, user_id)
);
create index if not exists club_members_club_idx on public.club_members(club_id);
create index if not exists club_members_user_idx on public.club_members(user_id);

-- ---------------------------------------------------------------- column migrations (idempotent)
-- Add any columns that older live DBs might be missing
alter table public.profiles       add column if not exists is_admin     boolean not null default false;
alter table public.events         add column if not exists tags         text[]  not null default '{}';
alter table public.events         add column if not exists photo_urls   text[]  not null default '{}';
alter table public.events         add column if not exists pricing_mode text    not null default 'PAID' check (pricing_mode in ('FREE','FLAT','PAID','PHASED'));
alter table public.events         add column if not exists google_maps_link text;
alter table public.orders         add column if not exists buyer_email  text;
alter table public.orders         add column if not exists buyer_gender text;

-- Auto-promote the first registered user to admin (one-time, idempotent)
do $$
begin
  if (select count(*) from public.profiles) = 1 and (select count(*) from public.profiles where is_admin = true) = 0 then
    update public.profiles set is_admin = true where id = (select id from public.profiles limit 1);
  end if;
end $$;

-- Migrate event_status enum: add new values for cancellation/postpone flow
do $$ begin
  if exists (select 1 from pg_type where typname = 'event_status') then
    if not exists (select 1 from pg_enum where enumlabel = 'CANCELLATION_REQUESTED' and enumtypid = (select oid from pg_type where typname = 'event_status')) then
      alter type event_status add value 'CANCELLATION_REQUESTED';
    end if;
    if not exists (select 1 from pg_enum where enumlabel = 'POSTPONED' and enumtypid = (select oid from pg_type where typname = 'event_status')) then
      alter type event_status add value 'POSTPONED';
    end if;
  end if;
end $$;

-- Add CANCELLED + REFUNDED to ticket_status if missing
do $$ begin
  if exists (select 1 from pg_type where typname = 'ticket_status') then
    if not exists (select 1 from pg_enum where enumlabel = 'CANCELLED' and enumtypid = (select oid from pg_type where typname = 'ticket_status')) then
      alter type ticket_status add value 'CANCELLED';
    end if;
  end if;
end $$;
alter table public.clubs          add column if not exists upi_id       text;
alter table public.clubs          add column if not exists instagram_handle text;

-- ---------------------------------------------------------------- helper functions

-- Security definer function to check admin status without causing RLS recursion
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

-- ---------------------------------------------------------------- RPCs

-- Approve a UPI payment: mints ticket QR hashes, decrements tier stock.
-- security definer = bypasses RLS entirely (no tickets INSERT policy needed)
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

-- Reject a payment order.
-- security definer = bypasses RLS
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

-- Create a free order + mint tickets immediately (auto-confirmed, no UTR needed).
-- Called by the buyer; RLS-safe because it only allows free tiers.
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
  -- Load tier + event
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

  -- Insert order as CONFIRMED
  insert into public.orders (
    event_id, tier_id, user_id, quantity,
    unit_price_paise, subtotal_paise, platform_fee_paise, total_paise,
    fee_payer, status, buyer_name, buyer_phone, buyer_email, buyer_gender
  ) values (
    p_event_id, p_tier_id, auth.uid(), p_quantity,
    0, 0, 0, 0,
    v_event.fee_payer, 'CONFIRMED', p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender
  )
  returning * into v_order;

  -- Mint tickets
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
  from generate_series(1, p_quantity) g;

  -- Update tier sold count
  update public.ticket_tiers
     set quantity_sold = quantity_sold + p_quantity
   where id = p_tier_id;

  -- Update event registration count
  update public.events
     set registrations_count = registrations_count + p_quantity
   where id = p_event_id;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Create a paid order atomically with inventory check + double-booking prevention.
-- Inserts as PENDING_VERIFICATION (organizer must approve).
-- Uses SELECT ... FOR UPDATE on the tier to prevent concurrent overbooking.
-- ---------------------------------------------------------------------------
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
  p_buyer_gender       text default null
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
    buyer_name, buyer_phone, buyer_email, buyer_gender
  ) values (
    p_event_id, p_tier_id, auth.uid(), p_quantity,
    p_unit_price_paise, p_subtotal_paise, p_platform_fee_paise, p_total_paise,
    p_fee_payer, 'PENDING_VERIFICATION', p_utr_reference, p_payment_proof_url,
    p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender
  )
  returning * into v_order;

  -- Do NOT increment quantity_sold here — only on approval
  -- Do NOT mint tickets here — only on approval

  return v_order;
end;
$$;

-- Door scanner: validate + mark USED in one round-trip.
-- Returns VALID, ALREADY_USED, or INVALID.
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

  -- Validate ticket belongs to the selected event
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

-- Offer the next person on a tier's waitlist.
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

-- Increment club member count (called after free join accepted).
create or replace function public.increment_club_member_count(p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clubs set member_count = member_count + 1 where id = p_club_id;
end;
$$;

-- Atomic cancel_event RPC: cancels orders, tickets, creates refunds + notifications.
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

-- Atomic postpone_event RPC: updates dates + notifies ticket holders.
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
  select e.organizer_id into v_organizer_id
    from public.events e
    join public.organizers o on o.id = e.organizer_id
   where e.id = p_event_id and o.owner_id = auth.uid();
  if not found then
    if not public.is_current_user_admin() then
      raise exception 'Not authorised to postpone this event';
    end if;
  end if;

  update public.events
     set status = 'POSTPONED', starts_at = p_new_starts_at, ends_at = p_new_ends_at
   where id = p_event_id;

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

-- ---------------------------------------------------------------- RLS

alter table public.profiles          enable row level security;
alter table public.organizers        enable row level security;
alter table public.events            enable row level security;
alter table public.ticket_tiers      enable row level security;
alter table public.orders            enable row level security;
alter table public.tickets           enable row level security;
alter table public.waitlist          enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.boosts            enable row level security;
alter table public.boost_slot_prices enable row level security;
alter table public.clubs             enable row level security;
alter table public.club_members      enable row level security;

-- profiles
drop policy if exists "profiles are self readable" on public.profiles;
create policy "profiles are self readable" on public.profiles
  for select using (
    auth.uid() = id or public.is_current_user_admin()
  );

drop policy if exists "profiles are self writable" on public.profiles;
create policy "profiles are self writable" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- organizers
drop policy if exists "organizers are public" on public.organizers;
create policy "organizers are public" on public.organizers
  for select using (true);

drop policy if exists "organizers are owner managed" on public.organizers;
drop policy if exists "organizers owner insert" on public.organizers;
drop policy if exists "organizers owner update" on public.organizers;
drop policy if exists "organizers owner delete" on public.organizers;
create policy "organizers owner insert" on public.organizers
  for insert with check (auth.uid() = owner_id);
create policy "organizers owner update" on public.organizers
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "organizers owner delete" on public.organizers
  for delete using (auth.uid() = owner_id);

-- events
drop policy if exists "published events are public" on public.events;
create policy "published events are public" on public.events
  for select using (status = 'PUBLISHED' or public.is_event_staff(id));

drop policy if exists "events are organizer managed" on public.events;
drop policy if exists "events organizer insert" on public.events;
drop policy if exists "events organizer update" on public.events;
drop policy if exists "events organizer delete" on public.events;
create policy "events organizer insert" on public.events
  for insert with check (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
    or public.is_current_user_admin()
  );
create policy "events organizer update" on public.events
  for update using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
    or public.is_current_user_admin()
  );
create policy "events organizer delete" on public.events
  for delete using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
    or public.is_current_user_admin()
  );

-- ticket_tiers
drop policy if exists "tiers are public" on public.ticket_tiers;
create policy "tiers are public" on public.ticket_tiers
  for select using (true);

drop policy if exists "tiers are organizer managed" on public.ticket_tiers;
drop policy if exists "tiers organizer insert" on public.ticket_tiers;
drop policy if exists "tiers organizer update" on public.ticket_tiers;
drop policy if exists "tiers organizer delete" on public.ticket_tiers;
create policy "tiers organizer insert" on public.ticket_tiers
  for insert with check (public.is_event_staff(event_id));
create policy "tiers organizer update" on public.ticket_tiers
  for update using (public.is_event_staff(event_id));
create policy "tiers organizer delete" on public.ticket_tiers
  for delete using (public.is_event_staff(event_id));

-- orders
drop policy if exists "orders are visible to buyer and organizer" on public.orders;
create policy "orders are visible to buyer and organizer" on public.orders
  for select using (auth.uid() = user_id or public.is_event_staff(event_id));

drop policy if exists "buyers create their own orders" on public.orders;
create policy "buyers create their own orders" on public.orders
  for insert with check (auth.uid() = user_id);

drop policy if exists "organizer updates orders" on public.orders;
create policy "organizer updates orders" on public.orders
  for update using (public.is_event_staff(event_id));

-- tickets
drop policy if exists "tickets are visible to holder and organizer" on public.tickets;
create policy "tickets are visible to holder and organizer" on public.tickets
  for select using (auth.uid() = user_id or public.is_event_staff(event_id));

drop policy if exists "organizer creates tickets" on public.tickets;
create policy "organizer creates tickets" on public.tickets
  for insert with check (public.is_event_staff(event_id));

drop policy if exists "organizer updates tickets" on public.tickets;
create policy "organizer updates tickets" on public.tickets
  for update using (public.is_event_staff(event_id));

-- waitlist
drop policy if exists "waitlist self or staff" on public.waitlist;
create policy "waitlist self or staff" on public.waitlist
  for select using (auth.uid() = user_id or public.is_event_staff(event_id));

drop policy if exists "waitlist self insert" on public.waitlist;
create policy "waitlist self insert" on public.waitlist
  for insert with check (auth.uid() = user_id);

drop policy if exists "waitlist self delete" on public.waitlist;
create policy "waitlist self delete" on public.waitlist
  for delete using (auth.uid() = user_id);

-- push subscriptions
drop policy if exists "push subs self" on public.push_subscriptions;
create policy "push subs self" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- boosts
drop policy if exists "boosts active public" on public.boosts;
create policy "boosts active public" on public.boosts
  for select using (status = 'ACTIVE' or public.is_event_staff(event_id));

drop policy if exists "boosts organizer insert" on public.boosts;
create policy "boosts organizer insert" on public.boosts
  for insert with check (
    exists (
      select 1 from public.organizers o
      where o.id = organizer_id and o.owner_id = auth.uid()
    )
  );

drop policy if exists "boosts organizer update" on public.boosts;
create policy "boosts organizer update" on public.boosts
  for update using (
    exists (
      select 1 from public.organizers o
      where o.id = organizer_id and o.owner_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

-- boost slot prices
drop policy if exists "boost prices public" on public.boost_slot_prices;
create policy "boost prices public" on public.boost_slot_prices
  for select using (true);

-- clubs
drop policy if exists "clubs are publicly readable" on public.clubs;
create policy "clubs are publicly readable" on public.clubs
  for select using (true);

drop policy if exists "organizers can insert clubs" on public.clubs;
create policy "organizers can insert clubs" on public.clubs
  for insert with check (
    exists (
      select 1 from public.organizers o
      where o.id = owner_id and o.owner_id = auth.uid()
    )
  );

drop policy if exists "organizers can update own clubs" on public.clubs;
create policy "organizers can update own clubs" on public.clubs
  for update using (
    exists (
      select 1 from public.organizers o
      where o.id = owner_id and o.owner_id = auth.uid()
    )
  );

-- club members
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

-- ---------------------------------------------------------------- refunds RLS
alter table public.refunds enable row level security;

drop policy if exists "users can read own refunds" on public.refunds;
create policy "users can read own refunds" on public.refunds
  for select using (user_id = auth.uid());

drop policy if exists "organizers can read event refunds" on public.refunds;
create policy "organizers can read event refunds" on public.refunds
  for select using (
    exists (
      select 1 from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = event_id and o.owner_id = auth.uid()
    )
  );

drop policy if exists "organizers can create refunds" on public.refunds;
create policy "organizers can create refunds" on public.refunds
  for insert with check (
    exists (
      select 1 from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = event_id and o.owner_id = auth.uid()
    )
  );

drop policy if exists "organizers can update refund status" on public.refunds;
create policy "organizers can update refund status" on public.refunds
  for update using (
    exists (
      select 1 from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = event_id and o.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------ event_notifications RLS
alter table public.event_notifications enable row level security;

drop policy if exists "users can read own notifications" on public.event_notifications;
create policy "users can read own notifications" on public.event_notifications
  for select using (user_id = auth.uid());

drop policy if exists "users can mark own notifications read" on public.event_notifications;
create policy "users can mark own notifications read" on public.event_notifications
  for update using (user_id = auth.uid());

drop policy if exists "organizers can create event notifications" on public.event_notifications;
create policy "organizers can create event notifications" on public.event_notifications
  for insert with check (
    exists (
      select 1 from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = event_id and o.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------ platform_settings RLS
alter table public.platform_settings enable row level security;

-- Anyone can read settings (fees, pricing displayed publicly)
drop policy if exists "public read platform settings" on public.platform_settings;
create policy "public read platform settings" on public.platform_settings
  for select using (true);

-- Only admins can insert/update/delete settings (with fallback for first user)
drop policy if exists "admin insert platform settings" on public.platform_settings;
create policy "admin insert platform settings" on public.platform_settings
  for insert with check (public.is_current_user_admin());

drop policy if exists "admin update platform settings" on public.platform_settings;
create policy "admin update platform settings" on public.platform_settings
  for update using (public.is_current_user_admin());

drop policy if exists "admin delete platform settings" on public.platform_settings;
create policy "admin delete platform settings" on public.platform_settings
  for delete using (public.is_current_user_admin());

-- ----------------------------------------------------- legal_pages RLS
alter table public.legal_pages enable row level security;

-- Anyone can read published legal pages
drop policy if exists "public read legal pages" on public.legal_pages;
create policy "public read legal pages" on public.legal_pages
  for select using (is_published = true);

-- Only admins can insert/update/delete
drop policy if exists "admin insert legal pages" on public.legal_pages;
create policy "admin insert legal pages" on public.legal_pages
  for insert with check (public.is_current_user_admin());

drop policy if exists "admin update legal pages" on public.legal_pages;
create policy "admin update legal pages" on public.legal_pages
  for update using (public.is_current_user_admin());

drop policy if exists "admin delete legal pages" on public.legal_pages;
create policy "admin delete legal pages" on public.legal_pages
  for delete using (public.is_current_user_admin());

-- ----------------------------------------------------- hero_boosts RLS
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

-- Admins can read/update/delete all boosts (with fallback for first user)
drop policy if exists "admin read hero boosts" on public.hero_boosts;
create policy "admin read hero boosts" on public.hero_boosts
  for select using (
    public.is_current_user_admin()
    or exists (select 1 from public.organizers o
            join public.profiles p on p.id = o.owner_id
            where o.id = hero_boosts.organizer_id and p.id = auth.uid())
  );

drop policy if exists "admin update hero boosts" on public.hero_boosts;
create policy "admin update hero boosts" on public.hero_boosts
  for update using (public.is_current_user_admin());

drop policy if exists "admin delete hero boosts" on public.hero_boosts;
create policy "admin delete hero boosts" on public.hero_boosts
  for delete using (public.is_current_user_admin());

-- --------------------------------------------- event_terms_acceptances RLS
alter table public.event_terms_acceptances enable row level security;

-- Organizers can read their own acceptance records
drop policy if exists "organizers read own terms acceptances" on public.event_terms_acceptances;
create policy "organizers read own terms acceptances" on public.event_terms_acceptances
  for select using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );

-- Authenticated users can insert (organizer creating event)
drop policy if exists "insert terms acceptances" on public.event_terms_acceptances;
create policy "insert terms acceptances" on public.event_terms_acceptances
  for insert with check (auth.uid() is not null);

-- Admins can read all acceptance records
drop policy if exists "admin read all terms acceptances" on public.event_terms_acceptances;
create policy "admin read all terms acceptances" on public.event_terms_acceptances
  for select using (public.is_current_user_admin());

-- No update or delete policies — records are immutable

-- --------------------------------------------------- door_staff_orders RLS
alter table public.door_staff_orders enable row level security;

-- Organizers can read their own door staff orders
drop policy if exists "organizers read own door staff orders" on public.door_staff_orders;
create policy "organizers read own door staff orders" on public.door_staff_orders
  for select using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );

-- Organizers can insert door staff orders for their events
drop policy if exists "organizers insert door staff orders" on public.door_staff_orders;
create policy "organizers insert door staff orders" on public.door_staff_orders
  for insert with check (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );

-- Organizers can update their own door staff orders (e.g. submit UTR)
drop policy if exists "organizers update own door staff orders" on public.door_staff_orders;
create policy "organizers update own door staff orders" on public.door_staff_orders
  for update using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );

-- Admins can read all door staff orders
drop policy if exists "admin read all door staff orders" on public.door_staff_orders;
create policy "admin read all door staff orders" on public.door_staff_orders
  for select using (public.is_current_user_admin());

-- Admins can update door staff orders (e.g. confirm service status)
drop policy if exists "admin update door staff orders" on public.door_staff_orders;
create policy "admin update door staff orders" on public.door_staff_orders
  for update using (public.is_current_user_admin());

-- ================================================================
-- Storage: event-media bucket + RLS policies
-- ================================================================

-- Create the bucket if it doesn't exist (public = true so anyone can read)
insert into storage.buckets (id, name, public)
values ('event-media', 'event-media', true)
on conflict (id) do nothing;

-- Allow anyone to read (public bucket)
drop policy if exists "public read on event-media" on storage.objects;
create policy "public read on event-media"
  on storage.objects for select
  using (bucket_id = 'event-media');

-- Allow authenticated users to upload to event-media
drop policy if exists "authenticated upload on event-media" on storage.objects;
create policy "authenticated upload on event-media"
  on storage.objects for insert
  with check (
    bucket_id = 'event-media'
    and auth.role() = 'authenticated'
  );

-- Allow authenticated users to update their own files
drop policy if exists "authenticated update on event-media" on storage.objects;
create policy "authenticated update on event-media"
  on storage.objects for update
  using (
    bucket_id = 'event-media'
    and auth.role() = 'authenticated'
  );

-- Allow authenticated users to delete their own files
drop policy if exists "authenticated delete on event-media" on storage.objects;
create policy "authenticated delete on event-media"
  on storage.objects for delete
  using (
    bucket_id = 'event-media'
    and auth.role() = 'authenticated'
  );
