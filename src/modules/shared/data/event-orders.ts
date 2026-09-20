import "server-only";

import { createClient } from "../auth/server";
import type { Order } from "../lib/types";

export async function listEventOrders(eventId: string): Promise<Order[]> {
  // No admin guard here — RLS policies ensure organizers can only see their own events' orders
  const supabase = await createClient();
  const [{ data: rows }, { data: eventRow }] = await Promise.all([
    supabase.from("orders").select("*").eq("event_id", eventId).order("created_at", { ascending: false }),
    supabase.from("events").select("title").eq("id", eventId).single(),
  ]);
  if (!rows) return [];
  const title = eventRow?.title ?? "Event";
  const tierIds = [...new Set(rows.map((r) => r.tier_id))];
  const { data: tiers } = await supabase.from("ticket_tiers").select("id, name").in("id", tierIds);
  const tierMap = Object.fromEntries((tiers ?? []).map((t) => [t.id, t.name]));

  return rows.map((row) => ({
    id: row.id,
    eventId,
    eventTitle: title,
    tierId: row.tier_id,
    tierName: tierMap[row.tier_id] ?? "Ticket",
    userId: row.user_id,
    quantity: row.quantity,
    unitPricePaise: row.unit_price_paise,
    subtotalPaise: row.subtotal_paise,
    platformFeePaise: row.platform_fee_paise,
    commissionPaise: row.commission_paise ?? 0,
    convenienceFeePaise: row.convenience_fee_paise ?? 0,
    organizerPayoutPaise: row.organizer_payout_paise ?? 0,
    totalPaise: row.total_paise,
    feePayer: row.fee_payer,
    status: row.status,
    utrReference: row.utr_reference,
    paymentProofUrl: row.payment_proof_url,
    razorpayOrderId: row.razorpay_order_id ?? null,
    razorpayPaymentId: row.razorpay_payment_id ?? null,
    paymentMethod: row.payment_method ?? null,
    invoiceNumber: row.invoice_number ?? null,
    reservedAt: row.reserved_at ?? null,
    reservationExpiresAt: row.reservation_expires_at ?? null,
    confirmedAt: row.confirmed_at ?? null,
    buyerName: row.buyer_name,
    buyerPhone: row.buyer_phone,
    buyerEmail: row.buyer_email ?? null,
    buyerGender: row.buyer_gender ?? null,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    orderSource: row.order_source ?? null,
    isBoxOffice: (row as { is_box_office?: boolean }).is_box_office ?? false,
  }));
}
