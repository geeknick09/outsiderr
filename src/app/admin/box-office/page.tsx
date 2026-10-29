import { TabLink } from "@/modules/shared";
import AdminBoxOfficeContent from "./content";
import AdminBoxOfficeStaffContent from "../box-office-staff/content";
import AdminBoxOfficePinsContent from "../box-office-pins/content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin: Box Office - Outsiderr" };

const TABS = [
  { key: "orders", label: "Orders & Sell" },
  { key: "staff", label: "Staff" },
  { key: "pins", label: "PINs" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default async function AdminBoxOfficePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active: Tab = (TABS.some((t) => t.key === tab) ? tab : "orders") as Tab;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 px-1 pt-4">
        {TABS.map((t) => (
          <TabLink key={t.key} href={`/admin/box-office?tab=${t.key}`} active={active === t.key}>
            {t.label}
          </TabLink>
        ))}
      </div>
      {active === "orders" ? <AdminBoxOfficeContent /> : null}
      {active === "staff" ? <AdminBoxOfficeStaffContent /> : null}
      {active === "pins" ? <AdminBoxOfficePinsContent /> : null}
    </div>
  );
}
