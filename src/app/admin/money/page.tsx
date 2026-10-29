import { formatPaise, TabLink } from "@/modules/shared";
import { createServiceClient } from "@/modules/shared/server";
import AdminRevenuePage from "../revenue/content";
import AdminPaymentsPage from "../payments/content";
import AdminRefundsPage from "../refunds/content";
import AdminPayoutsPage from "../payouts/content";
import AdminPromotersPage from "../promoters/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin: Money - Outsiderr" };

const TABS = [
  { key: "revenue", label: "Revenue" },
  { key: "payments", label: "Payments" },
  { key: "refunds", label: "Refunds" },
  { key: "payouts", label: "Organizer Payouts" },
  { key: "promoters", label: "Promoter Payouts" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default async function AdminMoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  const { tab, status } = await searchParams;
  const active: Tab = (TABS.some((t) => t.key === tab) ? tab : "payouts") as Tab;

  // Money in/out snapshot - the full cash picture at a glance.
  const supabase = createServiceClient();
  const [
    { data: orders },
    { data: refundRows },
    { data: payouts },
    { data: promoterPayouts },
    { data: earnings },
  ] = await Promise.all([
    supabase.from("orders").select("total_paise, commission_paise, convenience_fee_paise, organizer_payout_paise, status").eq("status", "CONFIRMED"),
    supabase.from("refunds").select("amount_paise"),
    supabase.from("payout_records").select("amount_paise, status"),
    supabase.from("promoter_payouts").select("amount_paise, status"),
    supabase.from("promoter_earnings").select("amount_paise, reversed_paise, kind, via"),
  ]);

  const collected = (orders ?? []).reduce((s, o) => s + o.total_paise, 0);
  const refunded = (refundRows ?? []).reduce((s, r) => s + r.amount_paise, 0);
  const kept = (orders ?? []).reduce((s, o) => s + o.commission_paise + o.convenience_fee_paise, 0);
  const orgLiability = (orders ?? []).reduce((s, o) => s + o.organizer_payout_paise, 0);
  const orgPaid = (payouts ?? []).filter((p) => p.status === "COMPLETED").reduce((s, p) => s + p.amount_paise, 0);
  const promoterPaid = (promoterPayouts ?? []).filter((p) => p.status === "COMPLETED").reduce((s, p) => s + p.amount_paise, 0);
  const promoterEarned = (earnings ?? []).filter((e) => e.kind === "EARNING").reduce((s, e) => s + e.amount_paise - e.reversed_paise, 0);
  const promoterReferral = (earnings ?? []).filter((e) => e.via === "ORG_REFERRAL").reduce((s, e) => s + e.amount_paise - e.reversed_paise, 0);

  const summary = [
    { label: "Collected from buyers", value: collected, hint: "gross on confirmed orders" },
    { label: "Refunded out", value: -refunded, hint: "returned to buyers" },
    { label: "Platform keeps", value: kept, hint: "commission + convenience fees" },
    { label: "Organizers - paid / owed", value: orgPaid, hint: `${formatPaise(Math.max(0, orgLiability - orgPaid))} outstanding` },
    { label: "Promoters - paid / earned", value: promoterPaid, hint: `${formatPaise(Math.max(0, promoterEarned - promoterPaid))} outstanding` },
    { label: "Referral cost (ours)", value: promoterReferral, hint: "organizer-referral share of commission" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 px-1 pt-4 sm:grid-cols-3 lg:grid-cols-6">
        {summary.map((s) => (
          <div key={s.label} className="glass rounded-2xl p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{s.label}</p>
            <p className="mt-1 text-lg font-black">{formatPaise(s.value)}</p>
            <p className="text-[10px] text-muted">{s.hint}</p>
          </div>
        ))}
      </div>
      <div className="mb-4 mt-4 flex flex-wrap gap-2 px-1">
        {TABS.map((t) => (
          <TabLink key={t.key} href={`/admin/money?tab=${t.key}`} active={active === t.key}>
            {t.label}
          </TabLink>
        ))}
      </div>

      {active === "revenue" ? <AdminRevenuePage /> : null}
      {active === "payments" ? <AdminPaymentsPage /> : null}
      {active === "refunds" ? <AdminRefundsPage searchParams={Promise.resolve({ status })} /> : null}
      {active === "payouts" ? <AdminPayoutsPage /> : null}
      {active === "promoters" ? <AdminPromotersPage /> : null}
    </div>
  );
}
