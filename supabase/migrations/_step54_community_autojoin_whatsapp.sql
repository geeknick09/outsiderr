-- STEP 54: community auto-join on paid booking + whatsapp channel link

-- 1) Booking an event under an OPEN community auto-joins the buyer.
create or replace function public.trg_order_community_autojoin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community uuid;
  v_type      text;
begin
  if new.status <> 'CONFIRMED' then return new; end if;
  if new.user_id is null then return new; end if;
  select e.community_id into v_community from public.events e where e.id = new.event_id;
  if v_community is null then return new; end if;
  select membership_type into v_type from public.communities where id = v_community;
  if v_type <> 'OPEN' then return new; end if;
  insert into public.community_members (community_id, user_id, status, invite_code)
  values (v_community, new.user_id, 'ACCEPTED', substr(encode(extensions.gen_random_bytes(5),'hex'),1,8))
  on conflict (community_id, user_id) do nothing;
  if found then
    update public.communities set member_count = member_count + 1 where id = v_community;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_community_autojoin on public.orders;
create trigger trg_order_community_autojoin
  after insert or update of status on public.orders
  for each row
  execute function public.trg_order_community_autojoin();

-- 2) WhatsApp channel link on communities.
alter table public.communities add column if not exists whatsapp_url text;
