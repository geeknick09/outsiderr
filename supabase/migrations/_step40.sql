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

revoke execute on function public.apply_failed_payment(text) from public, anon, authenticated;
revoke execute on function public.apply_failed_payment(text, text) from public, anon, authenticated;
grant execute on function public.apply_failed_payment(text, text) to service_role;
