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

-- 3. is_event_staff v2 — owner/admin OR named door staff OR accepted collaborator
--    (keeps the event_staff clause from the prior definition — door staff who
--    resolve via user_id must stay event staff)
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
  or exists (
    select 1
    from public.event_collaborators ec
    join public.organizers co on co.id = ec.organizer_id
    where ec.event_id = p_event_id
      and ec.status = 'ACCEPTED'
      and co.owner_id = auth.uid()
  )
  or public.is_current_user_admin();
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
