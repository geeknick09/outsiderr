import "server-only";

import { createServiceClient } from "../../shared/auth/service";
import { requireAdminUser } from "./admin";
import type { ComplianceTaskRow } from "../../shared/db/database.types";

export type ComplianceTask = ComplianceTaskRow & { overdue: boolean };

export async function listComplianceTasks(): Promise<ComplianceTask[]> {
  await requireAdminUser();
  const service = createServiceClient();
  const { data } = await service
    .from("compliance_tasks")
    .select("*")
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  const today = new Date().toISOString().slice(0, 10);
  return ((data ?? []) as ComplianceTaskRow[]).map((t) => ({
    ...t,
    overdue: t.status === "OPEN" && !!t.due_date && t.due_date < today,
  }));
}

export interface ComplianceSignal {
  label: string;
  count: number;
  href: string;
  note: string;
}

/** Auto-derived outstanding items - things the admin should probably look at. */
export async function getComplianceSignals(): Promise<ComplianceSignal[]> {
  await requireAdminUser();
  const service = createServiceClient();

  const [
    pendingKyc,
    pendingRefunds,
    openPayouts,
    publishedNoTerms,
    approvedNoPan,
  ] = await Promise.all([
    service.from("organizers").select("id", { count: "exact", head: true }).eq("kyc_status", "PENDING"),
    service.from("refunds").select("id", { count: "exact", head: true }).in("status", ["PENDING", "INITIATED"]),
    service.from("payout_records").select("id", { count: "exact", head: true }).in("status", ["PENDING", "PROCESSING"]),
    // published events with no organizer terms acceptance
    service.from("events").select("id", { count: "exact", head: true }).in("status", ["PUBLISHED", "POSTPONED"]),
    service.from("organizers").select("id", { count: "exact", head: true }).eq("kyc_status", "APPROVED").is("pan_number", null),
  ]);

  let noTermsCount = 0;
  if ((publishedNoTerms.count ?? 0) > 0) {
    const { data: accepted } = await service.from("event_terms_acceptances").select("event_id");
    const withTerms = new Set((accepted ?? []).map((r) => r.event_id));
    const { data: published } = await service
      .from("events")
      .select("id")
      .in("status", ["PUBLISHED", "POSTPONED"]);
    noTermsCount = (published ?? []).filter((e) => !withTerms.has(e.id)).length;
  }

  return [
    { label: "KYC awaiting review", count: pendingKyc.count ?? 0, href: "/admin/kyc", note: "Organizers pending verification" },
    { label: "Refunds unresolved", count: pendingRefunds.count ?? 0, href: "/admin/refunds", note: "Pending or initiated refunds" },
    { label: "Payouts in flight", count: openPayouts.count ?? 0, href: "/admin/payouts", note: "Pending/processing settlement" },
    { label: "Events missing terms", count: noTermsCount, href: "/admin/events", note: "Published without organizer terms acceptance" },
    { label: "Organizers missing PAN", count: approvedNoPan.count ?? 0, href: "/admin/organizers", note: "Approved but no PAN on file" },
  ];
}
