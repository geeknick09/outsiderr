import Link from "next/link";

import { cn } from "@/modules/shared";
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
          <Link
            key={t.key}
            href={`/admin/compliance?tab=${t.key}`}
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
      {active === "tasks" ? <AdminComplianceContent /> : null}
      {active === "legal" ? <AdminLegalContent /> : null}
    </div>
  );
}
