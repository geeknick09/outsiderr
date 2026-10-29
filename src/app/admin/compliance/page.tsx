import { TabLink } from "@/modules/shared";
import AdminComplianceContent from "./content";
import AdminLegalContent from "../legal/content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin: Compliance - Outsiderr" };

const TABS = [
  { key: "tasks", label: "Tasks" },
  { key: "legal", label: "Legal Pages" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default async function AdminCompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active: Tab = (TABS.some((t) => t.key === tab) ? tab : "tasks") as Tab;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 px-1 pt-4">
        {TABS.map((t) => (
          <TabLink key={t.key} href={`/admin/compliance?tab=${t.key}`} active={active === t.key}>
            {t.label}
          </TabLink>
        ))}
      </div>
      {active === "tasks" ? <AdminComplianceContent /> : null}
      {active === "legal" ? <AdminLegalContent /> : null}
    </div>
  );
}
