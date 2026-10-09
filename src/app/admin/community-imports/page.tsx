import { redirect } from "next/navigation";
import Link from "next/link";
import { FileUp } from "lucide-react";

import { AdminCommunityImportActions } from "@/modules/admin";
import { Badge } from "@/modules/shared";
import { createServiceClient } from "@/modules/shared/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Community Imports - Admin" };

export default async function AdminCommunityImportsPage() {
  // /admin/* is already admin-gated by middleware.
  const supabase = createServiceClient();
  const { data: rows } = await supabase
    .from("community_member_imports")
    .select("id, organizer_id, community_id, status, filename, total_rows, valid_rows, invalid_rows, review_note, created_at")
    .order("created_at", { ascending: false });

  const orgIds = [...new Set((rows ?? []).map((r) => r.organizer_id))];
  const commIds = [...new Set((rows ?? []).map((r) => r.community_id))];
  const [{ data: orgs }, { data: comms }, { data: items }] = await Promise.all([
    supabase.from("organizers_public").select("id, name").in("id", orgIds),
    supabase.from("communities").select("id, name").in("id", commIds),
    supabase.from("community_import_items").select("import_id, full_name").eq("status", "VALID"),
  ]);
  const orgMap = Object.fromEntries((orgs ?? []).map((o) => [o.id, o.name]));
  const commMap = Object.fromEntries((comms ?? []).map((c) => [c.id, c.name]));
  const sampleNames = Object.fromEntries(
    (items ?? []).map((i) => [i.import_id, i.full_name]),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Community Member Imports</h1>
        <p className="mt-1 text-sm text-muted">
          Organizers can bulk-import existing member lists. Approve to commit members (duplicates are skipped).
        </p>
      </div>

      <div className="space-y-2">
        {(rows ?? []).map((imp) => (
          <div key={imp.id} className="glass space-y-2 rounded-3xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold">
                  {orgMap[imp.organizer_id] ?? imp.organizer_id.slice(0, 8)} → {commMap[imp.community_id] ?? "community"}
                </p>
                <p className="text-xs text-muted">
                  {imp.valid_rows}/{imp.total_rows} valid · {imp.invalid_rows} invalid ·{" "}
                  {new Date(imp.created_at).toLocaleDateString("en-IN")}
                </p>
                {sampleNames[imp.id] ? (
                  <p className="mt-0.5 text-xs text-muted">Sample: {sampleNames[imp.id]}</p>
                ) : null}
                {imp.review_note ? <p className="mt-0.5 text-xs italic text-muted">Admin note: {imp.review_note}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  tone={
                    imp.status === "APPROVED" ? "success"
                    : imp.status === "REJECTED" ? "danger"
                    : imp.status === "REQUESTED" ? "warning"
                    : "neutral"
                  }
                >
                  {imp.status.toLowerCase()}
                </Badge>
                <Link href={`/admin/communities`} className="text-xs text-muted underline">
                  community
                </Link>
              </div>
            </div>
            {imp.status === "REQUESTED" ? (
              <AdminCommunityImportActions importId={imp.id} />
            ) : null}
          </div>
        ))}
        {!(rows ?? []).length ? (
          <div className="glass rounded-3xl p-8 text-center">
            <FileUp className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-2 text-sm text-muted">No imports yet.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
