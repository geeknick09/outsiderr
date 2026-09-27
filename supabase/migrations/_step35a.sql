-- ============================================================================
-- STEP 35a · refund_status enum values (must land before _step35.sql applies)
-- ============================================================================
do $$ begin alter type public.refund_status add value if not exists 'REQUESTED'; exception when others then null; end $$;
do $$ begin alter type public.refund_status add value if not exists 'INITIATING'; exception when others then null; end $$;
do $$ begin alter type public.refund_status add value if not exists 'REJECTED'; exception when others then null; end $$;
do $$ begin alter type public.refund_status add value if not exists 'MANUAL_SETTLED'; exception when others then null; end $$;
