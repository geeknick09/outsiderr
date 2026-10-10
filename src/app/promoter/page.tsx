import { redirect } from "next/navigation";

import { getCurrentUser } from "@/modules/shared/server";
import { getPromoterDashboard } from "@/modules/shared/server";
import { PromoterDashboardView } from "@/modules/web";

export const dynamic = "force-dynamic";
export const metadata = { title: "Promote & Earn - Outsiderr" };

export default async function PromoterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fpromoter");

  const dashboard = await getPromoterDashboard(user);
  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Promote &amp; earn</h1>
        <p className="text-sm text-muted">
          Share your links or codes - you earn a cut of every paid ticket you drive.
          Commissions settle 7 days after each event and are paid to your bank.
        </p>
      </div>
      <PromoterDashboardView dashboard={dashboard} />
    </div>
  );
}
