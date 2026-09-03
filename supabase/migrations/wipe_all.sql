-- ============================================================
-- WIPE ALL DATA — Start fresh
-- Run this in the Supabase SQL Editor to clear all tables.
-- This does NOT drop the schema — only the data.
-- After running this, the first user to sign up will auto-become admin.
-- ============================================================

-- Disable RLS temporarily so we don't hit policy issues
set session_replication_role = 'replica';

-- Wipe auth tables (deletes all users, sessions, etc.)
-- Note: can't use "restart identity" on auth tables — Supabase restricts sequence ownership
delete from auth.sessions;
delete from auth.users;

-- Wipe in reverse dependency order (children first, parents last)
truncate table public.club_members restart identity cascade;
truncate table public.clubs restart identity cascade;
truncate table public.hero_boosts restart identity cascade;
truncate table public.boosts restart identity cascade;
truncate table public.boost_slot_prices restart identity cascade;
truncate table public.door_staff_orders restart identity cascade;
truncate table public.event_terms_acceptances restart identity cascade;
truncate table public.legal_pages restart identity cascade;
truncate table public.platform_settings restart identity cascade;
truncate table public.event_notifications restart identity cascade;
truncate table public.refunds restart identity cascade;
truncate table public.push_subscriptions restart identity cascade;
truncate table public.waitlist restart identity cascade;
truncate table public.tickets restart identity cascade;
truncate table public.orders restart identity cascade;
truncate table public.ticket_tiers restart identity cascade;
truncate table public.events restart identity cascade;
truncate table public.organizers restart identity cascade;
truncate table public.profiles restart identity cascade;

-- Re-enable RLS
set session_replication_role = 'origin';

-- ============================================================
-- Re-seed essential default data
-- ============================================================

-- Boost slot prices (10 slots, decreasing price)
insert into public.boost_slot_prices (slot, price_paise) values
  (1, 500000), (2, 400000), (3, 300000), (4, 250000), (5, 200000),
  (6, 175000), (7, 150000), (8, 125000), (9, 100000), (10, 75000)
on conflict (slot) do update set price_paise = excluded.price_paise;

-- Platform settings (defaults)
insert into public.platform_settings (key, value, description) values
  ('platform_fee_bps', '500', 'Legacy flat fee bps (now tiered)'),
  ('cancellation_charge_percent', '20', 'Cancellation charge %'),
  ('postponement_charge_percent', '10', 'Postponement charge %'),
  ('door_staff_pricing', '{"1":1500,"2":2500,"3":3500,"4":5000,"5":6500}', 'Door staff pricing tiers'),
  ('door_staff_max', '5', 'Max door staff per event'),
  ('door_staff_available', '10', 'Available door staff slots'),
  ('max_tickets_per_order', '1', 'Max tickets per order'),
  ('terms_version', '"organizer-v1.0"', 'Current terms version'),
  ('venue_announcement_deadline_hours', '48', 'Hours before event to announce venue'),
  ('organizer_whatsapp_number', '"7980085212"', 'Organizer support WhatsApp number'),
  ('hero_boost_enabled', 'true', 'Enable Hero Boost feature'),
  ('hero_boost_price', '99900', 'Hero Boost price in paise (₹999)'),
  ('hero_boost_duration_days', '7', 'Hero Boost duration in days'),
  ('hero_rotation_interval_minutes', '30', 'Hero carousel rotation interval'),
  ('hero_max_visible_events', '7', 'Max Hero Boost events visible'),
  ('tagline_header', '"Find what''s happening outside the mainstream."', 'Homepage header tagline'),
  ('tagline_subheader', '"Discover raw events happening today near you."', 'Homepage subheader tagline'),
  ('tagline_footer', '"Cyphers, battles, stunts, skates, jams & real communities."', 'Footer tagline')
on conflict (key) do update set value = excluded.value;

-- Legal pages (defaults)
insert into public.legal_pages (slug, title, content) values
  ('terms', 'Terms of Service', '# Terms of Service

By using Outsiderr, you agree to these terms.'),
  ('privacy', 'Privacy Policy', '# Privacy Policy

We respect your privacy.'),
  ('cancellation', 'Cancellation & Refund Policy', '# Cancellation & Refund Policy

Refunds are handled manually by the organizer.'),
  ('organizer', 'Organizer Agreement', '# Organizer Agreement

By creating events on Outsiderr, you agree to these terms.')
on conflict (slug) do update set content = excluded.content;

-- ============================================================
-- Auto-promote first user to admin via trigger
-- Fires after every profile insert. If no admin exists, the
-- first user becomes admin automatically.
-- ============================================================

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

-- ============================================================
-- DONE — All tables are now empty and re-seeded.
-- The first user to sign up will automatically become admin.
-- ============================================================
