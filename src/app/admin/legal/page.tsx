import { LegalPagesPanel } from "@/components/admin/legal-pages-panel";
import { listLegalPages } from "@/lib/data/legal-pages";

export const dynamic = "force-dynamic";

export const metadata = { title: "Legal Pages — Admin — Outsiderr" };

export default async function AdminLegalPage() {
  // Admin check is handled by the /admin layout
  const pages = await listLegalPages();

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <LegalPagesPanel pages={pages} />
    </div>
  );
}
