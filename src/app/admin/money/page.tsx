import Link from "next/link";

import { cn } from "@/modules/shared";
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

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 px-1 pt-4">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/money?tab=${t.key}`}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-bold transition-colors",
              active === t.key
                ? "bg-violet-neon text-white"
                : "border border-zinc-200 text-muted hover:border-violet-neon/50 dark:border-white/10",
            )}
          >
            {t.label}
          </Link>
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
