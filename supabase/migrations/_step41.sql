-- =============================================================================
-- STEP 41 — abandon_payment: terminal release for user-dismissed checkout
--
-- STEP 40 made apply_failed_payment non-terminal (correct for per-attempt
-- webhook events). But the client dismiss path called the same RPC, so a
-- user who cancelled the modal got "reservation released" while the hold
-- actually stayed until the TTL cron ran. This RPC is the terminal path:
--   order RESERVED → FAILED + quantity_reserved released immediately
--   intent → FAILED
-- Still safe against races: if the payment already captured (PAID intent),
-- the abandon is a no-op and the capture path wins.
-- =============================================================================

create or replace function public.abandon_payment(
  p_razorpay_order_id text
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

  -- Capture already landed — the webhook/callback owns the outcome now.
  if v_intent.status = 'PAID' then return 'ALREADY_PAID'; end if;

  if v_intent.kind = 'TICKET_ORDER' then
    -- fail_razorpay_order: RESERVED → FAILED + releases quantity_reserved
    -- back onto the tier. Idempotent — no-op if not RESERVED.
    perform public.fail_razorpay_order(v_intent.ref_id);
  end if;
  -- Other kinds (boosts, door staff, clubs): the ref row stays PENDING and
  -- inert — nothing activates it without a captured intent.

  update public.payment_intents
     set status = 'FAILED', updated_at = now()
   where id = v_intent.id and status <> 'PAID';

  return 'ABANDONED:' || v_intent.kind;
end;
$$;

revoke execute on function public.abandon_payment(text) from public, anon, authenticated;
grant execute on function public.abandon_payment(text) to service_role;
