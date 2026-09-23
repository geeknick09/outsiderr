
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
