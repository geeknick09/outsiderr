import { redirect } from "next/navigation";

import { LegalPagesPanel } from "@/components/admin/legal-pages-panel";
import { getCurrentUser } from "@/lib/auth";
import { listLegalPages } from "@/lib/data/legal-pages";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Legal Pages — Admin — Outsiderr" };

export default async function AdminLegalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fadmin%2Flegal");

  // Admin check
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_admin", true);
    if (count && count > 0) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.is_admin) redirect("/");
    }
  }

  const pages = await listLegalPages();

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <LegalPagesPanel pages={pages} />
    </div>
  );
}
