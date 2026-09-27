-- =============================================================================
-- STEP 36 — manual payout tracking (pre-RazorpayX)
--
-- payout_records gains: payout method, failure reason, and the admin who
-- completed it — so the admin can track "what did we send, through which
-- channel, is it done/due/failed".
-- =============================================================================

alter table public.payout_records
  add column if not exists method          text
    check (method in ('UPI','NEFT','IMPS','RTGS','CASH','OTHER')),
  add column if not exists failure_reason  text,
  add column if not exists completed_by    uuid references auth.users(id);

create index if not exists payout_status_idx on public.payout_records(status);

-- Note: payout_records writes stay service-only (admin actions call via
-- createServiceClient after requireAdmin) — no grant changes needed.
