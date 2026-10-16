import "server-only";

import { createServiceClient } from "../../shared/auth/service";
import { requireAdminUser } from "./admin";

/** Views + shares recorded for an event during a boost's active window. */
export async function getBoostResults(
  eventId: string,
  windowStart: string | null,
  windowEnd: string | null,
): Promise<{ views: number; shares: number }> {
  await requireAdminUser();
  const service = createServiceClient();
  let viewsQ = service
    .from("page_views")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "EVENT")
    .eq("entity_id", eventId);
  let sharesQ = service
    .from("share_events")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "EVENT")
    .eq("entity_id", eventId);
  if (windowStart) {
    viewsQ = viewsQ.gte("created_at", windowStart);
    sharesQ = sharesQ.gte("created_at", windowStart);
  }
  if (windowEnd) {
    viewsQ = viewsQ.lte("created_at", windowEnd);
    sharesQ = sharesQ.lte("created_at", windowEnd);
  }
  const [v, s] = await Promise.all([viewsQ, sharesQ]);
  return { views: v.count ?? 0, shares: s.count ?? 0 };
}

export interface BoostInvoice {
  kind: "SLOT" | "FEATURE";
  boostId: string;
  invoiceNo: string;
  status: string;
  amountPaise: number;
  paidAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  slot: number | null;
  placement: string;
  eventTitle: string;
  eventStartsAt: string;
  organizerName: string;
  organizerEmail: string | null;
  paymentRef: string | null;
}

/** Invoice data for a boost purchase - slot or feature (hero). */
export async function getBoostInvoice(
  kind: "SLOT" | "FEATURE",
  boostId: string,
): Promise<BoostInvoice | null> {
  await requireAdminUser();
  const service = createServiceClient();

  if (kind === "SLOT") {
    const { data: b } = await service
      .from("boosts")
      .select("id, event_id, organizer_id, slot, amount_paid_paise, status, starts_at, ends_at, created_at, utr_reference, placement")
      .eq("id", boostId)
      .maybeSingle();
    if (!b) return null;
    const meta = await loadMeta(b.event_id, b.organizer_id);
    return {
      kind, boostId, invoiceNo: `INV-S-${b.id.slice(0, 8).toUpperCase()}`,
      status: b.status, amountPaise: b.amount_paid_paise, paidAt: b.created_at,
      windowStart: b.starts_at, windowEnd: b.ends_at, slot: b.slot,
      placement: b.placement ?? "HOME", ...meta,
      paymentRef: b.utr_reference,
    };
  }

  const { data: b } = await service
    .from("hero_boosts")
    .select("id, event_id, organizer_id, amount_paise, status, started_at, expires_at, created_at, razorpay_payment_id, placement")
    .eq("id", boostId)
    .maybeSingle();
  if (!b) return null;
  const meta = await loadMeta(b.event_id, b.organizer_id);
  return {
    kind, boostId, invoiceNo: `INV-F-${b.id.slice(0, 8).toUpperCase()}`,
    status: b.status, amountPaise: b.amount_paise, paidAt: b.created_at,
    windowStart: b.started_at, windowEnd: b.expires_at, slot: null,
    placement: b.placement ?? "HOME", ...meta,
    paymentRef: b.razorpay_payment_id,
  };
}

async function loadMeta(eventId: string, organizerId: string) {
  const service = createServiceClient();
  const [{ data: ev }, { data: org }] = await Promise.all([
    service.from("events").select("title, starts_at").eq("id", eventId).maybeSingle(),
    service.from("organizers").select("name, owner_id").eq("id", organizerId).maybeSingle(),
  ]);
  let email: string | null = null;
  if (org?.owner_id) {
    const { data: prof } = await service.from("profiles").select("email").eq("id", org.owner_id).maybeSingle();
    email = prof?.email ?? null;
  }
  return {
    eventTitle: ev?.title ?? "Event",
    eventStartsAt: ev?.starts_at ?? "",
    organizerName: org?.name ?? "Organizer",
    organizerEmail: email,
  };
}
