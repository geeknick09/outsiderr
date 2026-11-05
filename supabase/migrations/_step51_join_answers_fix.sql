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
    select v_member, q.question, a->>'answer'
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
