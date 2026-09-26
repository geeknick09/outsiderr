-- ================================================================
-- Outsiderr — complete schema (idempotent, safe to re-run)
-- Paste into the Supabase SQL Editor and click Run.
--
-- The schema will also create the "event-media" storage bucket and
-- its RLS policies automatically (see the Storage section below).
-- ================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------- Supabase Realtime
-- Enable Postgres Changes (CDC) on key tables for live UI updates.
-- The browser client subscribes via websockets to receive INSERT/UPDATE
-- events. RLS policies are enforced — users only see changes for rows
-- they are authorized to access.
-- NOTE: The actual ALTER PUBLICATION statements are at the bottom of this
-- file, after all tables exist. Running them here would fail because the
-- tables haven't been created yet.

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
  create type public.event_notification_type as enum (
    'CANCELLATION','POSTPONEMENT','RESCHEDULE','WAITLIST_OFFER','VENUE_CHANGE','CITY_CHANGE','TIME_CHANGE',
    'PAYMENT_SUCCESS','PAYMENT_FAILED','REFUND_INITIATED','REFUND_COMPLETED','PAYOUT_COMPLETED'
  );
exception when duplicate_object then null; end $$;

-- Add new notification types if the enum already exists (idempotent)
do $$ begin
  alter type public.event_notification_type add value if not exists 'PAYMENT_SUCCESS';
exception when others then null; end $$;
do $$ begin
  alter type public.event_notification_type add value if not exists 'PAYMENT_FAILED';
exception when others then null; end $$;
do $$ begin
  alter type public.event_notification_type add value if not exists 'REFUND_INITIATED';
exception when others then null; end $$;
do $$ begin
  alter type public.event_notification_type add value if not exists 'REFUND_COMPLETED';
exception when others then null; end $$;
do $$ begin
  alter type public.event_notification_type add value if not exists 'PAYOUT_COMPLETED';
exception when others then null; end $$;
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
do $$ begin
  create type event_category as enum (
    'CYPHER_BATTLE','SKATE_STUNT','FITNESS','JAM_GIG','HIP_HOP_PARTY','CAR_BIKE_MEET','WORKSHOP','OTHER'
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
alter type event_category add value if not exists 'HIP_HOP_PARTY';
alter type event_category add value if not exists 'CAR_BIKE_MEET';
alter type event_category add value if not exists 'GAMING';
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
    'PENDING_VERIFICATION','CONFIRMED','REJECTED','CANCELLED',
    'REFUNDED','RESERVED','EXPIRED','FAILED'
  );
exception when duplicate_object then null; end $$;

-- Add new enum values if the type already exists (idempotent)
do $$ begin
  alter type order_status add value if not exists 'REFUNDED';
  alter type order_status add value if not exists 'RESERVED';
  alter type order_status add value if not exists 'EXPIRED';
  alter type order_status add value if not exists 'FAILED';
  alter type order_status add value if not exists 'REFUND_REQUESTED';
exception when others then null; end $$;

do $$ begin
  create type ticket_status as enum ('VALID','USED','VOID');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id               uuid        primary key references auth.users(id) on delete cascade,
  full_name        text,
  email            text,
  phone            text,
  avatar_url       text,
  birth_date       date,
  gender           text        check (gender in ('male','female','non-binary','other')),
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
-- Ensure email column exists on older DBs
alter table public.profiles add column if not exists email text;

create table if not exists public.organizers (
  id                  uuid        primary key default gen_random_uuid(),
  owner_id            uuid        not null references public.profiles(id) on delete cascade,
  name                text        not null,
  bio                 text,
  description         text,
  organizer_intent    text,
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
  pan_document_url    text,
  gst_number          text,
  gst_business_name   text,
  bank_account_number text,
  bank_ifsc           text,
  bank_account_name   text,
  bank_account_type   text,        -- SAVINGS | CURRENT
  bank_document_url   text,
  kyc_submitted       boolean     not null default false,
  kyc_status          text        not null default 'NOT_SUBMITTED',  -- NOT_SUBMITTED | PENDING | APPROVED | REJECTED | CLARIFICATION_NEEDED
  kyc_reviewed_at     timestamptz,
  kyc_review_note     text,                   -- admin note on rejection/clarification
  kyc_response_note   text,
  kyc_response_document_url text,
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
  categories          text[]          not null default '{}',  -- multi-category support
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
  teaser_video_url    text,
  fee_payer           fee_payer       not null default 'BUYER',
  status              event_status    not null default 'PUBLISHED',
  is_featured         boolean         not null default false,
  needs_door_staff    boolean         not null default false,
  waitlist_enabled    boolean         not null default true,
  allow_booking_during_event boolean not null default false,
  terms               text[]          not null default '{}',
  registrations_count integer         not null default 0,
  pricing_mode        text            not null default 'PAID'
                      constraint events_pricing_mode_check check (pricing_mode in ('FREE','FLAT','PAID','PHASED')),
  commission_bps          integer     not null default 1000,  -- 10% organizer commission
  commission_enabled      boolean     not null default true,
  convenience_fee_bps     integer     not null default 200,   -- 2% buyer convenience fee
  convenience_fee_enabled boolean     not null default true,
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

-- Razorpay: track reserved (held but not yet paid) inventory separately.
-- available = quantity - quantity_sold - quantity_reserved
alter table public.ticket_tiers add column if not exists quantity_reserved integer not null default 0;
alter table public.ticket_tiers add constraint if not exists ticket_tiers_not_overreserved
  check (quantity_sold + quantity_reserved <= quantity);

create table if not exists public.orders (
  id                  uuid         primary key default gen_random_uuid(),
  event_id            uuid         not null references public.events(id) on delete cascade,
  tier_id             uuid         not null references public.ticket_tiers(id) on delete restrict,
  user_id             uuid         not null references public.profiles(id) on delete cascade,
  quantity            integer      not null check (quantity between 1 and 5),
  unit_price_paise    integer      not null check (unit_price_paise >= 0),
  subtotal_paise      integer      not null,
  platform_fee_paise  integer      not null,
  commission_paise    integer      not null default 0,    -- organizer commission
  convenience_fee_paise integer    not null default 0,   -- buyer convenience fee
  organizer_payout_paise integer   not null default 0,   -- what organizer receives
  total_paise         integer      not null,
  fee_payer           fee_payer    not null,
  status              order_status not null default 'PENDING_VERIFICATION',
  utr_reference       text,                               -- legacy: manual UPI flow
  payment_proof_url   text,                               -- legacy: manual UPI flow
  -- Razorpay integration columns
  razorpay_order_id   text,                               -- rzp_order_xxx
  razorpay_payment_id text,                               -- rzp_pay_xxx
  razorpay_signature  text,                               -- verified signature from checkout
  payment_method      text,                               -- 'upi','card','netbanking','wallet', etc.
  reserved_at         timestamptz,                        -- when inventory was reserved
  reservation_expires_at timestamptz,                     -- 15 min after reserved_at
  confirmed_at        timestamptz,                        -- when payment was confirmed
  invoice_number      text,                               -- OUT-YYYYMM-XXXXX
  buyer_name          text,
  buyer_phone         text,
  buyer_email         text,
  buyer_gender        text,
  rejection_reason    text,
  reviewed_by         uuid         references public.profiles(id),
  reviewed_at         timestamptz,
  order_source        text         not null default 'ONLINE'
                       check (order_source in ('ONLINE','WALKIN_PREEVENT','WALKIN_QR','WALKIN_INSTANT')),
  is_box_office       boolean      not null default false,
  idempotency_key     text,                               -- client-generated UUID to prevent duplicate orders
  created_at          timestamptz  not null default now()
);
create index if not exists orders_user_idx         on public.orders(user_id, created_at desc);
create index if not exists orders_event_status_idx on public.orders(event_id, status);
create unique index if not exists orders_idempotency_idx on public.orders(idempotency_key) where idempotency_key is not null;
-- Razorpay unique indexes prevent duplicate payment/order binding
create unique index if not exists orders_razorpay_order_id_idx
  on public.orders(razorpay_order_id) where razorpay_order_id is not null;
create unique index if not exists orders_razorpay_payment_id_idx
  on public.orders(razorpay_payment_id) where razorpay_payment_id is not null;
-- Index for fast reservation expiry cleanup
create index if not exists orders_reservation_expires_idx
  on public.orders(reservation_expires_at) where status = 'RESERVED';

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
  completed_at        timestamptz,
  -- Razorpay integration columns
  razorpay_refund_id  text,
  razorpay_payment_id text,
  refund_type         text          default 'FULL' check (refund_type in ('FULL','PARTIAL')),
  initiated_by        uuid          references auth.users(id),
  gateway_fee_paise   integer       not null default 0   -- non-refundable Razorpay fee (deducted from organizer payout)
);
create index if not exists refunds_event_idx  on public.refunds(event_id);
create index if not exists refunds_user_idx   on public.refunds(user_id);
create index if not exists refunds_order_idx  on public.refunds(order_id);
create index if not exists refunds_status_idx on public.refunds(status);

-- Event notifications — informs users of cancellations/postponements/reschedules
create table if not exists public.event_notifications (
  id          uuid                       primary key default gen_random_uuid(),
  event_id    uuid                       references public.events(id) on delete cascade,
  user_id     uuid                       not null references auth.users(id) on delete cascade,
  type        event_notification_type    not null,
  message     text                       not null default '',
  read        boolean                    not null default false,
  created_at  timestamptz                not null default now()
);
create index if not exists event_notif_user_idx  on public.event_notifications(user_id, read);
create index if not exists event_notif_event_idx on public.event_notifications(event_id);

-- ------------------------------------------------------- event_subscriptions
-- Per-event "Update Me" subscriptions.
-- Users can subscribe to events they haven't booked yet to receive
-- notifications about changes, reminders, and ticket availability.
create table if not exists public.event_subscriptions (
  id          uuid        primary key default gen_random_uuid(),
  event_id    uuid        not null references public.events(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists event_sub_user_idx  on public.event_subscriptions(user_id);
create index if not exists event_sub_event_idx on public.event_subscriptions(event_id);

-- ------------------------------------------------------- organizer_follows
-- Follow/unfollow organizers. Follower count is visible publicly.
-- No notifications are sent for follows (per product decision).
create table if not exists public.organizer_follows (
  id            uuid        primary key default gen_random_uuid(),
  organizer_id  uuid        not null references public.organizers(id) on delete cascade,
  follower_id   uuid        not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (organizer_id, follower_id)
);
create index if not exists org_follow_organizer_idx on public.organizer_follows(organizer_id);
create index if not exists org_follow_follower_idx  on public.organizer_follows(follower_id);

-- ------------------------------------------------------- event_collaborators
-- Event co-hosting / collaboration.
-- An organizer can invite another organizer to collaborate on an event.
-- Status: PENDING → ACCEPTED / REJECTED.
-- Accepted collaborators are shown alongside the primary organizer on the event page.
create table if not exists public.event_collaborators (
  id               uuid        primary key default gen_random_uuid(),
  event_id         uuid        not null references public.events(id) on delete cascade,
  organizer_id     uuid        not null references public.organizers(id) on delete cascade,
  invited_by       uuid        not null references public.organizers(id) on delete cascade,
  status           text        not null default 'PENDING',  -- PENDING | ACCEPTED | REJECTED
  permission_level text        not null default 'VIEW_ONLY', -- VIEW_ONLY | ANALYTICS | SCAN | FULL
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (event_id, organizer_id)
);
create index if not exists event_collab_event_idx     on public.event_collaborators(event_id);
create index if not exists event_collab_org_idx       on public.event_collaborators(organizer_id);
create index if not exists event_collab_invited_idx  on public.event_collaborators(invited_by);

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

-- ------------------------------------------------------- admin_change_log
-- Audit trail for all admin overrides (commission, convenience fee, etc.)
-- Records who changed what, from what value, to what value, and why.
create table if not exists public.admin_change_log (
  id          uuid        primary key default gen_random_uuid(),
  admin_id    uuid        not null references auth.users(id),
  table_name  text        not null,           -- e.g. 'events', 'platform_settings'
  entity_id   text,                           -- e.g. event UUID or settings key
  field_name  text        not null,           -- e.g. 'commission_bps'
  old_value   text,
  new_value   text,
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists admin_change_log_created_idx on public.admin_change_log(created_at desc);
create index if not exists admin_change_log_entity_idx on public.admin_change_log(table_name, entity_id);

-- RLS for admin_change_log — only admins can read/insert
alter table public.admin_change_log enable row level security;
drop policy if exists "admins read change log" on public.admin_change_log;
create policy "admins read change log" on public.admin_change_log
  for select to authenticated using (public.is_current_user_admin());
drop policy if exists "admins insert change log" on public.admin_change_log;
create policy "admins insert change log" on public.admin_change_log
  for insert to authenticated with check (public.is_current_user_admin());

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
  ('tagline_footer',                  '"Cyphers, battles, stunts, skates, jams & real communities. Discover raw events happening today near you."', 'Footer brand tagline'),
  -- Commission tier settings (tiered commission based on ticket price)
  ('commission_tier1_max_paise',      '50000',  'Tier 1 threshold: tickets below this price use tier 1 rate (paise)'),
  ('commission_tier2_max_paise',      '300000', 'Tier 2 threshold: tickets up to this price use tier 2 rate (paise)'),
  ('commission_tier1_bps',            '1000',   'Tier 1 commission rate in bps (1000 = 10%)'),
  ('commission_tier2_bps',            '700',    'Tier 2 commission rate in bps (700 = 7%)'),
  ('commission_tier3_bps',            '500',    'Tier 3 commission rate in bps (500 = 5%)'),
  -- Platform-level defaults
  ('default_commission_bps',          '1000',   'Default organizer commission in basis points (10%)'),
  ('default_convenience_fee_bps',     '200',    'Default buyer convenience fee in basis points (2%)'),
  ('max_popular_per_city',            '4',      'Max popular events shown per city on homepage'),
  ('max_sponsored_per_city',          '4',      'Max sponsored/featured events shown per city on homepage')
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

-- --------------------------------------------------- event_staff
-- Door staff assigned by the organizer to scan tickets at the door.
-- Staff users can ONLY access the /scan endpoint — no organizer dashboard or analytics.
-- The organizer adds staff by email and/or phone; the user_id is resolved
-- when that person logs in with a matching email/phone.
create table if not exists public.event_staff (
  id             uuid        primary key default gen_random_uuid(),
  event_id       uuid        not null references public.events(id) on delete cascade,
  organizer_id   uuid        not null references public.organizers(id) on delete cascade,
  email          text,
  phone          text,
  user_id        uuid        references auth.users(id) on delete set null,  -- resolved on login
  display_name   text        not null default '',
  created_at     timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create index if not exists event_staff_event_idx     on public.event_staff(event_id);
create index if not exists event_staff_org_idx       on public.event_staff(organizer_id);
create index if not exists event_staff_user_idx      on public.event_staff(user_id);
create index if not exists event_staff_email_idx     on public.event_staff(email);
create index if not exists event_staff_phone_idx     on public.event_staff(phone);

-- --------------------------------------------------- scanner_pins
-- PIN-based door scanner access. Organizers generate 6-digit PINs for door staff.
-- Staff enter PIN at /scan — no Supabase account needed.
create table if not exists public.scanner_pins (
  id           uuid        primary key default gen_random_uuid(),
  event_id     uuid        not null references public.events(id) on delete cascade,
  organizer_id uuid        not null references public.organizers(id) on delete cascade,
  pin_code     text        not null,  -- plaintext kept only for organizer display; verify via pin_hash
  pin_hash     text        not null,  -- SHA-256 of (event_id::text || ':' || pin_code)
  staff_name   text        not null,
  staff_email  text,                   -- optional contact email for door staff
  staff_phone  text,                   -- optional contact phone for door staff
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  unique(event_id, pin_hash)
);
create index if not exists scanner_pins_event_idx on public.scanner_pins(event_id);
create index if not exists scanner_pins_org_idx   on public.scanner_pins(organizer_id);

-- --------------------------------------------------- box_office_pins
-- PIN-based box office access. Organizers and admins generate 6-digit PINs.
-- Staff enter PIN at /organizer/box-office or /admin/box-office.
-- role = 'ORGANIZER' (organizer-managed) or 'ADMIN' (admin-managed).
create table if not exists public.box_office_pins (
  id           uuid        primary key default gen_random_uuid(),
  event_id     uuid        not null references public.events(id) on delete cascade,
  organizer_id uuid        references public.organizers(id) on delete cascade,
  pin_code     text        not null,  -- plaintext kept only for organizer display; verify via pin_hash
  pin_hash     text        not null,  -- SHA-256 of (event_id::text || ':' || pin_code)
  staff_name   text        not null,
  role         text        not null default 'ORGANIZER' check (role in ('ORGANIZER','ADMIN')),
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  unique(event_id, pin_hash)
);
create index if not exists box_office_pins_event_idx on public.box_office_pins(event_id);
create index if not exists box_office_pins_org_idx   on public.box_office_pins(organizer_id);

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
  utr_reference   text,                                   -- legacy: manual UPI flow
  -- Razorpay integration columns
  razorpay_order_id   text,
  razorpay_payment_id text,
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
-- Razorpay unique index for hero boosts
create unique index if not exists hero_boosts_razorpay_order_idx
  on public.hero_boosts(razorpay_order_id) where razorpay_order_id is not null;
insert into public.boost_slot_prices (slot, price_paise) values
  (1,500000),(2,400000),(3,300000),(4,250000),(5,200000),
  (6,175000),(7,150000),(8,125000),(9,100000),(10,75000)
on conflict do nothing;

-- ------------------------------------------------------- Razorpay tables
-- Webhook events table — idempotency for Razorpay webhooks.
-- Each Razorpay event has a unique event_id; we store the full payload
-- and track whether it has been processed.
create table if not exists public.webhook_events (
  id                  uuid        primary key default gen_random_uuid(),
  razorpay_event_id   text        not null unique,
  event_type          text        not null,                -- 'payment.captured','refund.processed', etc.
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

-- Payment ledger — immutable record of every financial movement.
-- One row per: ticket sale, boost sale, refund, payout, manual adjustment.
create table if not exists public.payment_ledger (
  id                      uuid        primary key default gen_random_uuid(),
  order_id                uuid        references public.orders(id),
  event_id                uuid        references public.events(id),
  organizer_id            uuid        references public.organizers(id),
  type                    text        not null check (type in (
    'TICKET_SALE','BOOST_SALE','REFUND','PAYOUT','ADJUSTMENT'
  )),
  gross_amount_paise      integer     not null,
  commission_paise        integer     not null default 0,
  convenience_fee_paise   integer     not null default 0,
  razorpay_fee_paise      integer     not null default 0,   -- informational: Razorpay's processing fee
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

-- Payout records — tracks manual bank transfers to organizers.
-- Outsiderr admin initiates these after events conclude.
create table if not exists public.payout_records (
  id                uuid        primary key default gen_random_uuid(),
  organizer_id      uuid        not null references public.organizers(id) on delete cascade,
  event_id          uuid        references public.events(id),             -- null = cross-event payout
  amount_paise      integer     not null check (amount_paise > 0),
  status            text        not null default 'PENDING'
                    check (status in ('PENDING','PROCESSING','COMPLETED','FAILED')),
  bank_reference    text,                                                 -- NEFT/IMPS reference
  notes             text,
  initiated_by      uuid        references auth.users(id),
  initiated_at      timestamptz not null default now(),
  completed_at      timestamptz
);
create index if not exists payout_organizer_idx on public.payout_records(organizer_id);
create index if not exists payout_event_idx     on public.payout_records(event_id);
create index if not exists payout_status_idx    on public.payout_records(status);

-- Invoice number sequence — format: OUT-YYYYMM-XXXXX
create sequence if not exists invoice_number_seq start with 10001;

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

-- ================================================================
-- Event Reviews (checked-in attendees only)
-- ================================================================
-- One review per user per event.
-- Only users with a USED ticket (checked in) can review.
-- Reviews aggregate on the organizer's public profile.
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

-- RLS for event_reviews
alter table public.event_reviews enable row level security;

-- Anyone can read reviews (public)
drop policy if exists "public read on event_reviews" on public.event_reviews;
create policy "public read on event_reviews"
  on public.event_reviews for select
  using (true);

-- Users can insert a review only if they have a USED ticket for the event
-- (i.e., they checked in at the door)
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

-- Users can only delete their own reviews
drop policy if exists "users delete own reviews" on public.event_reviews;
create policy "users delete own reviews"
  on public.event_reviews for delete
  using (user_id = auth.uid());

-- Admins can delete any review (moderation)
drop policy if exists "admins delete any review" on public.event_reviews;
create policy "admins delete any review"
  on public.event_reviews for delete
  using (public.is_current_user_admin());

-- Add event_reviews to realtime publication
do $$ begin
  alter publication supabase_realtime add table public.event_reviews;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- column migrations (idempotent)
-- Add any columns that older live DBs might be missing
alter table public.profiles       add column if not exists is_admin     boolean not null default false;
alter table public.events         add column if not exists tags         text[]  not null default '{}';
alter table public.events         add column if not exists photo_urls   text[]  not null default '{}';
alter table public.events         add column if not exists pricing_mode text    not null default 'PAID' check (pricing_mode in ('FREE','FLAT','PAID','PHASED'));
alter table public.events         add column if not exists google_maps_link text;
alter table public.events         add column if not exists linked_past_event_ids uuid[] not null default '{}';
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
  )
  or exists (
    select 1
    from public.event_staff es
    where es.event_id = p_event_id and es.user_id = auth.uid()
  )
  or public.is_current_user_admin();
$$;

-- Check if the current user is door staff for any organizer (for /scan access)
create or replace function public.is_door_staff_any()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_staff es
    where es.user_id = auth.uid()
  ) or public.is_current_user_admin();
$$;

-- Get the organizer IDs that the current user is door staff for
create or replace function public.get_staff_organizer_ids()
returns table (organizer_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct es.organizer_id
    from public.event_staff es
   where es.user_id = auth.uid()
   union
  select o.id
    from public.organizers o
   where o.owner_id = auth.uid()
  ;
$$;

-- --------------------------------------------------- Scanner PIN RPCs
-- Verify a door scanner PIN and return event info + valid ticket count.
-- No Supabase auth required — PIN is the credential.
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
  -- Update last_used_at
  update public.scanner_pins set last_used_at = now() where id = v_pin.id;
  -- Return event info + counts
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

-- Bulk generate scanner PINs for an event.
-- Pass an array of staff names; returns generated PINs.
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
  -- Verify caller owns this event
  if not public.is_current_user_admin() and not exists (
    select 1 from public.organizers where id = v_organizer_id and owner_id = auth.uid()
  ) then
    raise exception 'Not authorised to manage scanner PINs for this event';
  end if;

  foreach v_name in array p_staff_names loop
    v_idx := v_idx + 1;
    v_email := coalesce(p_staff_emails[v_idx], '');
    v_phone := coalesce(p_staff_phones[v_idx], '');
    -- Generate unique 6-digit PIN
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

-- Revoke a scanner PIN (set is_active = false)
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
  -- Verify caller owns this event or is admin
  if not public.is_current_user_admin() and not exists (
    select 1 from public.organizers o where o.id = v_pin.organizer_id and o.owner_id = auth.uid()
  ) then
    raise exception 'Not authorised to revoke this PIN';
  end if;
  update public.scanner_pins set is_active = false where id = p_pin_id;
  return true;
end;
$$;

-- --------------------------------------------------- Box Office PIN RPCs
-- Verify a box office PIN and return event info + tiers.
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

-- Bulk generate box office PINs for an event.
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
  -- ORGANIZER role: caller must own the event. ADMIN role: caller must be admin.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-promote the first registered user to admin via trigger.
-- Fires every time a new profile is inserted. If no admin exists yet,
-- the first user becomes admin automatically. Works after wipe_all.sql.
create or replace function public.auto_promote_first_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

  -- Clear the user's waitlist entry for this tier — they got the ticket.
  delete from public.waitlist
   where tier_id = p_tier_id and user_id = auth.uid();

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
  -- Verify the PIN is valid for this event
  select * into v_pin from public.scanner_pins sp
   where sp.event_id = p_event_id and sp.pin_code = p_pin and sp.is_active = true
   for update;
  if not found then
    raise exception 'Invalid or inactive scanner PIN';
  end if;
  update public.scanner_pins set last_used_at = now() where id = v_pin.id;

  -- Find the ticket
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
         checked_in_by = null  -- PIN-based, no user account
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

-- Offer the next person on a tier's waitlist.
-- created_at breaks position ties so arrival order wins for any legacy dup positions.
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

-- Join a tier's waitlist with a strictly-FIFO position.
-- Serializes on the tier row lock so concurrent joins can't collide on position,
-- and assigns position = max(position)+1 so freed/removed slots never reuse a
-- number that already exists further up the queue. Idempotent per user+tier.
create or replace function public.join_waitlist(p_event_id uuid, p_tier_id uuid)
returns public.waitlist
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.waitlist;
begin
  -- Idempotent: already waitlisted → return the existing entry.
  select * into v_entry
    from public.waitlist
   where tier_id = p_tier_id and user_id = auth.uid();
  if found then return v_entry; end if;

  -- Serialize joins per tier so concurrent inserts can't read the same max(position).
  perform 1 from public.ticket_tiers where id = p_tier_id for update;

  insert into public.waitlist (event_id, tier_id, user_id, position)
  values (
    p_event_id, p_tier_id, auth.uid(),
    (select coalesce(max(position), 0) + 1 from public.waitlist where tier_id = p_tier_id)
  )
  on conflict (tier_id, user_id) do nothing
  returning * into v_entry;

  -- Lost a concurrent-insert race on (tier_id, user_id) → return the existing row.
  if not found then
    select * into v_entry
      from public.waitlist
     where tier_id = p_tier_id and user_id = auth.uid();
  end if;

  return v_entry;
end;
$$;

-- Re-queue an expired OFFERED entry to the BACK of the tier's waitlist.
-- Serializes on the tier lock and assigns position = max(position)+1 so the
-- user genuinely goes to the end rather than keeping their old front position.
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

  -- Serialize against joins/other requeues on this tier.
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

  -- Release reserved inventory for RESERVED orders (Razorpay flow: payment not yet completed)
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

-- ---------------------------------------------------------------------------
-- Postponement refund: a user requests a refund for a postponed event.
-- The user's ticket is cancelled and a refund record is created.
-- The order is marked REFUND_REQUESTED so the admin can process the Razorpay refund.
-- Returns the refund details for the calling code to trigger Razorpay.
-- ---------------------------------------------------------------------------
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
  -- Verify the event is postponed
  if not exists (select 1 from public.events where id = p_event_id and status = 'POSTPONED') then
    raise exception 'Event is not postponed';
  end if;

  -- Find the user's confirmed order for this event
  select id, total_paise, platform_fee_paise
    into v_order
    from public.orders
   where event_id = p_event_id and user_id = p_user_id and status = 'CONFIRMED'
   limit 1;

  if not found then
    raise exception 'No confirmed order found for this event';
  end if;

  -- Mark order as REFUND_REQUESTED
  update public.orders set status = 'REFUND_REQUESTED' where id = v_order.id;

  -- Cancel the user's tickets
  update public.tickets set status = 'CANCELLED' where order_id = v_order.id;

  -- Create a refund record
  insert into public.refunds (order_id, event_id, user_id, amount_paise, platform_fee_paise, status, reason, initiated_at, initiated_by)
  values (v_order.id, p_event_id, p_user_id, v_order.total_paise, v_order.platform_fee_paise, 'PENDING', 'Postponement refund requested by user', now(), p_user_id)
  returning id into v_refund_id;

  -- Notify the user
  insert into public.event_notifications (event_id, user_id, type, message)
  values (p_event_id, p_user_id, 'REFUND_INITIATED', 'Your refund request for the postponed event has been submitted. You will receive your refund shortly.');

  -- Get the Razorpay payment ID for the calling code to process the refund
  return query
    select v_order.id, v_order.total_paise, o.razorpay_payment_id, true
    from public.orders o where o.id = v_order.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Razorpay: Reserve inventory + create RESERVED order (replaces create_paid_order for new flow).
-- Inventory is held (quantity_reserved += qty) but NOT sold until payment is confirmed.
-- Reservation expires after 15 minutes via expire_reserved_orders() cron.
-- ---------------------------------------------------------------------------
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
  -- Lock the tier row to prevent concurrent overbooking
  select * into v_tier from public.ticket_tiers where id = p_tier_id for update;
  if not found then
    raise exception 'Ticket tier not found';
  end if;
  if v_tier.price_paise = 0 then
    raise exception 'Use the free order flow for free tickets';
  end if;

  -- Check available inventory (sold + reserved)
  if v_tier.quantity - v_tier.quantity_sold - v_tier.quantity_reserved < p_quantity then
    raise exception 'Not enough tickets available';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found';
  end if;

  -- Prevent double booking: check for existing active/reserved orders by this user for this event
  select count(*) into v_existing_count
  from public.orders
  where event_id = p_event_id
    and user_id = auth.uid()
    and status in ('CONFIRMED', 'RESERVED', 'PENDING_VERIFICATION');
  if v_existing_count > 0 then
    raise exception 'You already have an active booking for this event';
  end if;

  -- Reserve inventory
  update public.ticket_tiers
     set quantity_reserved = quantity_reserved + p_quantity
   where id = p_tier_id;

  -- Insert order as RESERVED with 15-minute reservation window
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

-- ---------------------------------------------------------------------------
-- Walk-in / manual check-in: organizer registers a walk-in attendee.
-- Creates a CONFIRMED order with convenience_fee = 0 (they didn't use the
-- platform to register). Commission is still deducted from the organizer payout.
-- p_mode: 'WALKIN_PREEVENT' (before event, mints VALID ticket)
--         'WALKIN_QR'       (during event, mints VALID ticket for scanning)
--         'WALKIN_INSTANT'  (during event, auto check-in, ticket = USED)
-- If p_tier_id is null, uses p_amount_paise as the subtotal and the first
-- tier of the event as a placeholder for the FK constraint.
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

  -- Determine tier and amount
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

  -- Commission (no convenience fee for walk-ins)
  v_commission := case when v_event.commission_enabled
    then round(v_subtotal * v_event.commission_bps / 10000.0)
    else 0 end;
  v_payout := v_subtotal - v_commission;

  -- Ticket status: USED for instant check-in, VALID otherwise
  v_ticket_status := case when p_mode = 'WALKIN_INSTANT' then 'USED' else 'VALID' end;

  -- Create confirmed order (user_id = NULL so it doesn't appear in My Tickets)
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

  -- Mint ticket (VALID for pre-event/QR, USED for instant)
  -- user_id = NULL so it doesn't appear in My Tickets
  insert into public.tickets (
    order_id, event_id, tier_id, user_id, status, qr_hash,
    checked_in_at
  ) values (
    v_order_id, p_event_id, v_tier_id, null, v_ticket_status::ticket_status, gen_random_uuid()::text,
    case when p_mode = 'WALKIN_INSTANT' then now() else null end
  ) returning id into v_ticket_id;

  -- Increment tier quantity_sold
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

-- ---------------------------------------------------------------------------
-- Walk-in order update: organizer edits an existing walk-in record
-- (name, phone, email, amount). Recalculates commission/payout if amount
-- changes. Only allowed for walk-in orders (not online orders).
-- ---------------------------------------------------------------------------
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
-- Idempotent: if already CONFIRMED, returns existing tickets without re-minting.
-- Converts reserved inventory → sold, mints tickets, generates invoice number.
-- ---------------------------------------------------------------------------
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
  -- Lock the order row to prevent race between callback and webhook
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;

  -- Idempotency: if already confirmed, return existing tickets
  if v_order.status = 'CONFIRMED' then
    return query select * from public.tickets where order_id = p_order_id;
    return;
  end if;

  if v_order.status <> 'RESERVED' then
    raise exception 'Order is %, cannot confirm', v_order.status;
  end if;

  -- Lock tier and convert reservation to sold
  select * into v_tier from public.ticket_tiers where id = v_order.tier_id for update;
  update public.ticket_tiers
     set quantity_reserved = greatest(quantity_reserved - v_order.quantity, 0),
         quantity_sold = quantity_sold + v_order.quantity
   where id = v_order.tier_id;

  -- Generate invoice number: OUT-YYYYMM-XXXXX
  v_invoice := 'OUT-' || to_char(now(), 'YYYYMM') || '-' || nextval('invoice_number_seq');

  -- Update order to CONFIRMED with payment details
  update public.orders
     set status = 'CONFIRMED',
         razorpay_payment_id = p_razorpay_payment_id,
         razorpay_signature = p_razorpay_signature,
         payment_method = p_payment_method,
         confirmed_at = now(),
         invoice_number = v_invoice
   where id = p_order_id;

  -- Update event registration count
  update public.events
     set registrations_count = registrations_count + v_order.quantity
   where id = v_order.event_id;

  -- Clear the user's waitlist entry for this tier — they got the ticket.
  delete from public.waitlist
   where tier_id = v_order.tier_id and user_id = v_order.user_id;

  -- Mint tickets with unique SHA-256 QR hashes
  return query
    insert into public.tickets (order_id, event_id, tier_id, user_id, qr_hash)
    select
      v_order.id, v_order.event_id, v_order.tier_id, v_order.user_id,
      encode(sha256((v_order.id::text || ':' || g::text || ':' || gen_random_uuid()::text)::bytea), 'hex')
    from generate_series(1, v_order.quantity) g
    returning *;
end;
$$;

-- ---------------------------------------------------------------------------
-- Razorpay: Mark a RESERVED order as FAILED and release reserved inventory.
-- Idempotent: no-op if order is not RESERVED.
-- ---------------------------------------------------------------------------
create or replace function public.fail_razorpay_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
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

-- ---------------------------------------------------------------------------
-- Razorpay: Expire all RESERVED orders whose reservation window has passed.
-- Releases reserved inventory. Called by pg_cron or Vercel Cron every minute.
-- Uses SKIP LOCKED to avoid blocking on long-running transactions.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Razorpay: Update order with Razorpay order ID after creating Razorpay order.
-- Called by the server action after razorpay.orders.create() succeeds.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------- RLS

-- ---------------------------------------------------------------- performance indexes
-- Additional indexes for production query performance.
-- These complement the indexes created inline above.

-- Events: filter by status (admin dashboard, public listing)
create index if not exists events_status_idx on public.events (status);
-- Events: filter by city (public listing)
create index if not exists events_city_idx on public.events (city);
-- Events: filter by is_featured (homepage Front Row)
create index if not exists events_is_featured_idx on public.events (is_featured);
-- Events: GIN index on categories array for .contains() queries
create index if not exists events_categories_gin_idx on public.events using gin (categories);
-- Events: trigram indexes for ilike search on title, venue_name
create index if not exists events_title_trgm_idx on public.events using gin (title gin_trgm_ops);
create index if not exists events_venue_name_trgm_idx on public.events using gin (venue_name gin_trgm_ops);

-- Orders: filter by status alone (admin dashboard, pending orders)
create index if not exists orders_status_idx on public.orders (status);
-- Orders: filter by status + created_at (analytics, daily charts)
create index if not exists orders_status_created_at_idx on public.orders (status, created_at);
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

-- ---------------------------------------------------------------- RLS (continued)

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
-- Razorpay tables
alter table public.webhook_events    enable row level security;
alter table public.payment_ledger    enable row level security;
alter table public.payout_records    enable row level security;

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
  for insert with check (auth.uid() = owner_id or public.is_current_user_admin());
create policy "organizers owner update" on public.organizers
  for update using (auth.uid() = owner_id or public.is_current_user_admin())
  with check (auth.uid() = owner_id or public.is_current_user_admin());
create policy "organizers owner delete" on public.organizers
  for delete using (auth.uid() = owner_id or public.is_current_user_admin());

-- events
drop policy if exists "published events are public" on public.events;
create policy "published events are public" on public.events
  for select using (status in ('PUBLISHED', 'POSTPONED') or public.is_event_staff(id));

-- Organizers can see ALL their own events (including DRAFT, CANCELLED, POSTPONED)
drop policy if exists "organizers see own events" on public.events;
create policy "organizers see own events" on public.events
  for select using (
    exists (select 1 from public.organizers o
      where o.id = events.organizer_id and o.owner_id = auth.uid())
  );

-- Admins can see ALL events
drop policy if exists "admins see all events" on public.events;
create policy "admins see all events" on public.events
  for select using (public.is_current_user_admin());

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

drop policy if exists "boost prices admin update" on public.boost_slot_prices;
create policy "boost prices admin update" on public.boost_slot_prices
  for update using (public.is_current_user_admin());

-- clubs
drop policy if exists "clubs are publicly readable" on public.clubs;
create policy "clubs are publicly readable" on public.clubs
  for select using (true);

drop policy if exists "organizers can insert clubs" on public.clubs;
create policy "organizers can insert clubs" on public.clubs
  for insert with check (
    exists (
      select 1 from public.organizers o
      where o.id = clubs.owner_id and o.owner_id = auth.uid()
    )
  );

drop policy if exists "organizers can update own clubs" on public.clubs;
create policy "organizers can update own clubs" on public.clubs
  for update using (
    exists (
      select 1 from public.organizers o
      where o.id = clubs.owner_id and o.owner_id = auth.uid()
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

-- Active hero boosts are publicly visible (for homepage carousel)
drop policy if exists "active hero boosts are public" on public.hero_boosts;
create policy "active hero boosts are public" on public.hero_boosts
  for select using (status = 'ACTIVE');

-- Organizers can read their own boosts
drop policy if exists "organizer read own hero boosts" on public.hero_boosts;
create policy "organizer read own hero boosts" on public.hero_boosts
  for select using (
    exists (select 1 from public.organizers o
      where o.id = hero_boosts.organizer_id and o.owner_id = auth.uid())
  );

-- Organizers can insert boosts (pending only)
drop policy if exists "organizer insert hero boosts" on public.hero_boosts;
create policy "organizer insert hero boosts" on public.hero_boosts
  for insert with check (
    exists (select 1 from public.organizers o
      where o.id = hero_boosts.organizer_id and o.owner_id = auth.uid())
    and status = 'PENDING'
  );

-- Admins can read all boosts
drop policy if exists "admin read hero boosts" on public.hero_boosts;
create policy "admin read hero boosts" on public.hero_boosts
  for select using (public.is_current_user_admin());

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

-- --------------------------------------------------- event_staff RLS
alter table public.event_staff enable row level security;

-- Organizers can read staff for their events
drop policy if exists "organizers read own event staff" on public.event_staff;
create policy "organizers read own event staff" on public.event_staff
  for select using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );

-- Organizers can add staff to their events
drop policy if exists "organizers insert event staff" on public.event_staff;
create policy "organizers insert event staff" on public.event_staff
  for insert with check (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );

-- Organizers can remove staff from their events
drop policy if exists "organizers delete own event staff" on public.event_staff;
create policy "organizers delete own event staff" on public.event_staff
  for delete using (
    exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = auth.uid())
  );

-- Staff users can read their own staff assignments (to know which events they can scan for)
drop policy if exists "staff read own assignments" on public.event_staff;
create policy "staff read own assignments" on public.event_staff
  for select using (user_id = auth.uid());

-- Staff users can update their own user_id resolution (auto-resolve on login)
drop policy if exists "staff update own user_id" on public.event_staff;
create policy "staff update own user_id" on public.event_staff
  for update using (user_id = auth.uid() or user_id is null);

-- Admins can read all event staff
drop policy if exists "admin read all event staff" on public.event_staff;
create policy "admin read all event staff" on public.event_staff
  for select using (public.is_current_user_admin());

-- Admins can delete event staff
drop policy if exists "admin delete event staff" on public.event_staff;
create policy "admin delete event staff" on public.event_staff
  for delete using (public.is_current_user_admin());

-- --------------------------------------------------- scanner_pins RLS
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

-- --------------------------------------------------- box_office_pins RLS
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

-- --------------------------------------------- webhook_events RLS
-- Only admins can read webhook events; inserts happen via service role (webhook route)
drop policy if exists "admin read webhook events" on public.webhook_events;
create policy "admin read webhook events" on public.webhook_events
  for select using (public.is_current_user_admin());

drop policy if exists "admin update webhook events" on public.webhook_events;
create policy "admin update webhook events" on public.webhook_events
  for update using (public.is_current_user_admin());

-- --------------------------------------------- payment_ledger RLS
-- Admins can read all ledger entries; organizers can read their own
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

-- --------------------------------------------- payout_records RLS
-- Admins can read/update all payouts; organizers can read their own
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

-- --------------------------------------------- event_subscriptions RLS
alter table public.event_subscriptions enable row level security;

-- Users can read their own subscriptions
drop policy if exists "users read own subscriptions" on public.event_subscriptions;
create policy "users read own subscriptions" on public.event_subscriptions
  for select using (user_id = auth.uid());

-- Users can subscribe to events (insert own)
drop policy if exists "users can subscribe" on public.event_subscriptions;
create policy "users can subscribe" on public.event_subscriptions
  for insert with check (user_id = auth.uid());

-- Users can unsubscribe (delete own)
drop policy if exists "users can unsubscribe" on public.event_subscriptions;
create policy "users can unsubscribe" on public.event_subscriptions
  for delete using (user_id = auth.uid());

-- Organizers can see who subscribed to their events (for analytics)
drop policy if exists "organizers read event subscriptions" on public.event_subscriptions;
create policy "organizers read event subscriptions" on public.event_subscriptions
  for select using (
    exists (
      select 1 from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = event_subscriptions.event_id and o.owner_id = auth.uid()
    )
  );

-- --------------------------------------------- organizer_follows RLS
alter table public.organizer_follows enable row level security;

-- Anyone can read follows (public follower counts)
drop policy if exists "public read follows" on public.organizer_follows;
create policy "public read follows" on public.organizer_follows
  for select using (true);

-- Users can follow (insert own)
drop policy if exists "users can follow" on public.organizer_follows;
create policy "users can follow" on public.organizer_follows
  for insert with check (follower_id = auth.uid());

-- Users can unfollow (delete own)
drop policy if exists "users can unfollow" on public.organizer_follows;
create policy "users can unfollow" on public.organizer_follows
  for delete using (follower_id = auth.uid());

-- --------------------------------------------- event_collaborators RLS
alter table public.event_collaborators enable row level security;

-- Anyone can read accepted collaborators (shown on public event page)
drop policy if exists "public read accepted collaborators" on public.event_collaborators;
create policy "public read accepted collaborators" on public.event_collaborators
  for select using (status = 'ACCEPTED');

-- Organizers can read collaborations they're involved in
drop policy if exists "organizers read own collaborations" on public.event_collaborators;
create policy "organizers read own collaborations" on public.event_collaborators
  for select using (
    exists (select 1 from public.organizers o
            where (o.id = event_collaborators.organizer_id or o.id = event_collaborators.invited_by)
            and o.owner_id = auth.uid())
  );

-- Event owner can invite collaborators (insert)
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

-- Invited organizer can update their own collaboration status (accept/reject)
drop policy if exists "organizers update own collaboration" on public.event_collaborators;
create policy "organizers update own collaboration" on public.event_collaborators
  for update using (
    exists (select 1 from public.organizers o
            where o.id = event_collaborators.organizer_id and o.owner_id = auth.uid())
  );

-- Event owner can delete collaborations
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

-- ================================================================
-- Backups bucket (private — only service-role can access)
-- ================================================================
-- Stores automated database backups (gzip JSON) from the backup cron.
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- Only service-role can read backups (no RLS for anon/authenticated)
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
-- Realtime publication
-- ================================================================
-- Add tables to the supabase_realtime publication so the browser client
-- can subscribe via websockets. Must run AFTER all tables exist.
-- Wrapped in DO blocks with exception handling for idempotency.

do $$ begin
  alter publication supabase_realtime add table public.event_notifications;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.ticket_tiers;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.tickets;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.event_staff;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.scanner_pins;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.box_office_pins;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.event_subscriptions;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.organizer_follows;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.event_collaborators;
exception when duplicate_object then null; end $$;
-- STEP 21: Security hardening sweep (QA audit fixes, 2026-09-22)
-- Fixes: RPC lockdown (free-ticket mints), privileged-column writes
-- (self-admin / self-KYC / fee evasion), staff self-claim, collaborator
-- escalation, refund races, missing inventory release, ledger gaps.
-- ================================================================

-- ---- 1. Missing columns (schema drift — code references them; never migrated)
alter table public.clubs add column if not exists cover_url text;
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
revoke execute on function public.increment_club_member_count(uuid) from public, anon;

grant execute on function public.confirm_razorpay_order(uuid, text, text, text) to service_role;
grant execute on function public.fail_razorpay_order(uuid) to service_role;
grant execute on function public.create_walkin_order(uuid, text, text, uuid, text, integer, text, text) to service_role;
grant execute on function public.update_walkin_order(uuid, text, text, text, integer) to service_role;
grant execute on function public.update_walkin_order(uuid, text, text, text, integer) to service_role;
grant execute on function public.expire_reserved_orders() to service_role;
grant execute on function public.set_razorpay_order_id(uuid, text) to service_role;
grant execute on function public.requeue_waitlist_entry(uuid) to service_role;
grant execute on function public.offer_waitlist_next(uuid) to authenticated, service_role;
grant execute on function public.increment_club_member_count(uuid) to authenticated, service_role;

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
grant update (name, bio, description, avatar_url, cover_url, instagram_url, youtube_url,
              x_url, facebook_url, linkedin_url, upi_id, upi_qr_url,
              pan_number, pan_name, pan_document_url, gst_number, gst_business_name,
              bank_account_number, bank_ifsc, bank_account_name, bank_account_type,
              bank_document_url, kyc_response_note, kyc_response_document_url)
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
create or replace function public.submit_kyc(p_organizer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.organizers
    where id = p_organizer_id and owner_id = auth.uid()
  ) and not public.is_current_user_admin() then
    raise exception 'Not authorised to submit KYC for this organizer';
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
     set registrations_count = registrations_count + v_order.quantity
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
    from generate_series(1, v_order.quantity) g
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
    v_event.fee_payer, 'CONFIRMED', p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender
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
  from generate_series(1, p_quantity) g;

  update public.ticket_tiers
     set quantity_sold = quantity_sold + p_quantity
   where id = p_tier_id;

  update public.events
     set registrations_count = registrations_count + p_quantity
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
              'PENDING', 'Payment captured after order ' || lower(v_order.status) || ' — auto-refund', now());
      insert into public.event_notifications (event_id, user_id, type, message)
      values (v_order.event_id, v_order.user_id, 'REFUND_INITIATED',
              'Your payment was received after the booking window closed — a refund has been initiated automatically.');
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
     set registrations_count = registrations_count + v_order.quantity
   where id = v_order.event_id;
  delete from public.waitlist
   where tier_id = v_order.tier_id and user_id = v_order.user_id;
  insert into public.event_notifications (event_id, user_id, type, message)
  values (v_order.event_id, v_order.user_id, 'ORDER_CONFIRMED', 'Payment confirmed — your ticket is ready.');
  return query
    insert into public.tickets (order_id, event_id, tier_id, user_id, qr_hash)
    select
      v_order.id, v_order.event_id, v_order.tier_id, v_order.user_id,
      encode(sha256((v_order.id::text || ':' || g::text || ':' || gen_random_uuid()::text)::bytea), 'hex')
    from generate_series(1, v_order.quantity) g
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
    v_event.fee_payer, 'CONFIRMED', p_buyer_name, p_buyer_phone, p_buyer_email, p_buyer_gender
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
  from generate_series(1, p_quantity) g;

  update public.ticket_tiers
     set quantity_sold = quantity_sold + p_quantity
   where id = p_tier_id;

  update public.events
     set registrations_count = registrations_count + p_quantity
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
