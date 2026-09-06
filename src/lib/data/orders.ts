import "server-only";

import { MAX_TICKETS_PER_ORDER } from "@/lib/constants";
import { getEvent } from "@/lib/data/events";
import { calculatePrice } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";
import type { Order, ScanResult, Ticket } from "@/lib/types";

export interface CreateOrderInput {
  eventId: string;
  tierId: string;
  quantity: number;
  utrReference: string;
  paymentProofUrl: string | null;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string | null;
  buyerGender: string | null;
}

export interface CreateFreeOrderInput {
  eventId: string;
  tierId: string;
  quantity: number;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string | null;
  buyerGender: string | null;
}

export async function createOrder(
  user: CurrentUser,
  input: CreateOrderInput,
): Promise<Order> {
  if (input.quantity < 1 || input.quantity > MAX_TICKETS_PER_ORDER) {
    throw new Error(`Choose between 1 and ${MAX_TICKETS_PER_ORDER} tickets.`);
  }

  const event = await getEvent(input.eventId);
  const tier = event?.tiers.find((candidate) => candidate.id === input.tierId);
  if (!event || !tier) throw new Error("This ticket tier is no longer available.");
  if (tier.quantity - tier.quantitySold < input.quantity) {
    throw new Error("Not enough tickets left in this tier.");
  }

  const supabase = await createClient();

  // Use per-event commission + convenience fee config
  const price = calculatePrice(tier.pricePaise, input.quantity, event.feePayer, undefined, {
    commissionBps: event.commissionBps,
    commissionEnabled: event.commissionEnabled,
    convenienceFeeBps: event.convenienceFeeBps,
    convenienceFeeEnabled: event.convenienceFeeEnabled,
  });

  // Use atomic RPC to prevent concurrent overbooking + double booking race condition.
  // The RPC locks the tier row (SELECT FOR UPDATE), checks inventory, checks for
  // existing active orders, and inserts — all in one transaction.
  const { data, error } = await supabase.rpc("create_paid_order", {
    p_event_id: event.id,
    p_tier_id: tier.id,
    p_quantity: input.quantity,
    p_unit_price_paise: tier.pricePaise,
    p_subtotal_paise: price.subtotalPaise,
    p_platform_fee_paise: price.platformFeePaise,
    p_total_paise: price.totalPaise,
    p_fee_payer: event.feePayer,
    p_utr_reference: input.utrReference,
    p_payment_proof_url: input.paymentProofUrl,
    p_buyer_name: input.buyerName || null,
    p_buyer_phone: input.buyerPhone || null,
    p_buyer_email: input.buyerEmail || null,
    p_buyer_gender: input.buyerGender || null,
  });

  if (error) throw new Error(error.message || "Failed to create order.");
  if (!data) throw new Error("Failed to create order.");

  return {
    id: data.id,
    eventId: event.id,
    eventTitle: event.title,
    tierId: tier.id,
    tierName: tier.name,
    userId: data.user_id,
    quantity: data.quantity,
    unitPricePaise: data.unit_price_paise,
    subtotalPaise: data.subtotal_paise,
    platformFeePaise: data.platform_fee_paise,
    totalPaise: data.total_paise,
    feePayer: data.fee_payer,
    status: data.status,
    utrReference: data.utr_reference,
    paymentProofUrl: data.payment_proof_url,
    buyerName: data.buyer_name,
    buyerPhone: data.buyer_phone,
    buyerEmail: data.buyer_email ?? null,
    buyerGender: data.buyer_gender ?? null,
    rejectionReason: data.rejection_reason,
    createdAt: data.created_at,
  };
}

/**
 * Create a free order — auto-confirmed with tickets minted immediately.
 * No UTR, no organizer verification needed.
 */
export async function createFreeOrder(
  user: CurrentUser,
  input: CreateFreeOrderInput,
): Promise<Order> {
  if (input.quantity < 1 || input.quantity > MAX_TICKETS_PER_ORDER) {
    throw new Error(`Choose between 1 and ${MAX_TICKETS_PER_ORDER} tickets.`);
  }

  const event = await getEvent(input.eventId);
  const tier = event?.tiers.find((candidate) => candidate.id === input.tierId);
  if (!event || !tier) throw new Error("This ticket tier is no longer available.");
  if (tier.pricePaise !== 0) throw new Error("This tier is not free.");
  if (tier.quantity - tier.quantitySold < input.quantity) {
    throw new Error("Not enough tickets left.");
  }

  // Prevent double booking — 1 ticket per user per event (unless MAX_TICKETS_PER_ORDER > 1)
  const supabase = await createClient();
  if (MAX_TICKETS_PER_ORDER === 1) {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("user_id", user.id)
      .in("status", ["CONFIRMED", "PENDING_VERIFICATION"]);
    if (count && count > 0) {
      throw new Error("You have already booked a ticket for this event.");
    }
  }

  // Supabase: use the create_free_order RPC (auto-confirms + mints tickets)
  const { data, error } = await supabase.rpc("create_free_order", {
    p_event_id: input.eventId,
    p_tier_id: input.tierId,
    p_quantity: input.quantity,
    p_buyer_name: input.buyerName || null,
    p_buyer_phone: input.buyerPhone || null,
    p_buyer_email: input.buyerEmail || null,
    p_buyer_gender: input.buyerGender || null,
  });
  if (error) throw error;

  return {
    id: data.id,
    eventId: event.id,
    eventTitle: event.title,
    tierId: tier.id,
    tierName: tier.name,
    userId: data.user_id,
    quantity: data.quantity,
    unitPricePaise: data.unit_price_paise,
    subtotalPaise: data.subtotal_paise,
    platformFeePaise: data.platform_fee_paise,
    totalPaise: data.total_paise,
    feePayer: data.fee_payer,
    status: data.status,
    utrReference: data.utr_reference,
    paymentProofUrl: data.payment_proof_url,
    buyerName: data.buyer_name,
    buyerPhone: data.buyer_phone,
    buyerEmail: data.buyer_email ?? null,
    buyerGender: data.buyer_gender ?? null,
    rejectionReason: data.rejection_reason,
    createdAt: data.created_at,
  };
}

async function hydrateOrders(
  rows: {
    id: string;
    event_id: string;
    tier_id: string;
    user_id: string | null;
    quantity: number;
    unit_price_paise: number;
    subtotal_paise: number;
    platform_fee_paise: number;
    total_paise: number;
    fee_payer: Order["feePayer"];
    status: Order["status"];
    utr_reference: string | null;
    payment_proof_url: string | null;
    buyer_name: string | null;
    buyer_phone: string | null;
    buyer_email: string | null;
    buyer_gender: string | null;
    rejection_reason: string | null;
    created_at: string;
  }[],
): Promise<Order[]> {
  const supabase = await createClient();
  const eventIds = [...new Set(rows.map((row) => row.event_id))];
  const tierIds = [...new Set(rows.map((row) => row.tier_id))];

  const [{ data: events }, { data: tiers }] = await Promise.all([
    supabase.from("events").select("id, title").in("id", eventIds),
    supabase.from("ticket_tiers").select("id, name").in("id", tierIds),
  ]);

  return rows.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    eventTitle: events?.find((event) => event.id === row.event_id)?.title ?? "Event",
    tierId: row.tier_id,
    tierName: tiers?.find((tier) => tier.id === row.tier_id)?.name ?? "Ticket",
    userId: row.user_id,
    quantity: row.quantity,
    unitPricePaise: row.unit_price_paise,
    subtotalPaise: row.subtotal_paise,
    platformFeePaise: row.platform_fee_paise,
    totalPaise: row.total_paise,
    feePayer: row.fee_payer,
    status: row.status,
    utrReference: row.utr_reference,
    paymentProofUrl: row.payment_proof_url,
    buyerName: row.buyer_name,
    buyerPhone: row.buyer_phone,
    buyerEmail: row.buyer_email ?? null,
    buyerGender: row.buyer_gender ?? null,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
  }));
}

export async function listMyOrders(user: CurrentUser): Promise<Order[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return hydrateOrders(data ?? []);
}

/** Orders awaiting manual UPI verification for every event the organizer runs. */
export async function listPendingOrders(): Promise<Order[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("*")
    .eq("status", "PENDING_VERIFICATION")
    .order("created_at", { ascending: true });

  return hydrateOrders(data ?? []);
}

export async function listMyTickets(user: CurrentUser): Promise<Ticket[]> {
  const supabase = await createClient();
  const { data: tickets } = await supabase
    .from("tickets")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (!tickets || tickets.length === 0) return [];

  const eventIds = [...new Set(tickets.map((ticket) => ticket.event_id))];
  const [{ data: eventRows }, { data: tiers }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, starts_at, venue_name, contact_email")
      .in("id", eventIds),
    supabase
      .from("ticket_tiers")
      .select("id, name")
      .in("id", [...new Set(tickets.map((ticket) => ticket.tier_id))]),
  ]);

  return tickets.map((ticket) => {
    const event = eventRows?.find((candidate) => candidate.id === ticket.event_id);
    return {
      id: ticket.id,
      orderId: ticket.order_id,
      eventId: ticket.event_id,
      eventTitle: event?.title ?? "Event",
      tierName: tiers?.find((tier) => tier.id === ticket.tier_id)?.name ?? "Ticket",
      qrHash: ticket.qr_hash,
      status: ticket.status,
      checkedInAt: ticket.checked_in_at,
      startsAt: event?.starts_at ?? new Date().toISOString(),
      venueName: event?.venue_name ?? "",
      organizerContactEmail: event?.contact_email ?? null,
    };
  });
}

/**
 * Returns events the user has booked that are happening today (and haven't ended yet).
 * Used for the "Your Events Today" homepage section.
 */
export async function getMyEventsToday(user: CurrentUser): Promise<
  { eventId: string; eventTitle: string; startsAt: string; venueName: string; tierName: string }[]
> {
  const supabase = await createClient();
  const { data: tickets } = await supabase
    .from("tickets")
    .select("event_id, tier_id")
    .eq("user_id", user.id)
    .in("status", ["VALID", "USED"]);

  if (!tickets || tickets.length === 0) return [];

  const eventIds = [...new Set(tickets.map((t) => t.event_id))];
  const tierIds = [...new Set(tickets.map((t) => t.tier_id))];

  const [{ data: events }, { data: tiers }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, starts_at, ends_at, venue_name")
      .in("id", eventIds),
    supabase
      .from("ticket_tiers")
      .select("id, name")
      .in("id", tierIds),
  ]);

  const now = new Date();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  return (events ?? [])
    .filter((e) => {
      const start = new Date(e.starts_at);
      const end = e.ends_at ? new Date(e.ends_at) : new Date(e.starts_at);
      // Event is happening today: start <= todayEnd AND end >= now
      return start <= todayEnd && end >= now;
    })
    .map((e) => ({
      eventId: e.id,
      eventTitle: e.title,
      startsAt: e.starts_at,
      venueName: e.venue_name ?? "",
      tierName: tiers?.find((t) => t.id === tickets.find((tk) => tk.event_id === e.id)?.tier_id)?.name ?? "Ticket",
    }));
}

export async function approveOrder(orderId: string): Promise<void> {
  // Use the security-definer RPC — it bypasses RLS entirely for ticket minting
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_order", { p_order_id: orderId });
  if (error) throw new Error(error.message);
}

export async function rejectOrder(orderId: string, reason: string): Promise<void> {
  // Direct Supabase implementation — avoids RPC is_event_staff issues
  const supabase = await createClient();

  // Get the tier_id before rejecting (for waitlist auto-offer)
  const { data: order } = await supabase
    .from("orders")
    .select("tier_id")
    .eq("id", orderId)
    .maybeSingle();

  const { error } = await supabase
    .from("orders")
    .update({
      status: "REJECTED",
      rejection_reason: reason || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", orderId);
  if (error) throw new Error(error.message);

  // Auto-offer to next waitlisted user if a tier was freed
  if (order?.tier_id) {
    try {
      const { autoOfferWaitlist } = await import("@/lib/data/waitlist");
      await autoOfferWaitlist(order.tier_id);
    } catch {
      // Non-critical — don't block rejection on waitlist offer failure
    }
  }
}

export async function checkInTicket(qrHash: string, eventId: string): Promise<ScanResult> {
  const hash = qrHash.trim();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in_ticket", { p_qr_hash: hash, p_event_id: eventId });
  if (error) throw new Error(error.message || "Check-in failed.");

  const row = data?.[0];
  if (!row || row.outcome === "INVALID") {
    return { outcome: "INVALID", message: "Ticket not recognised." };
  }

  // Fetch additional ticket + order details for scanner display
  const { data: ticketRow } = await supabase
    .from("tickets")
    .select("order_id")
    .eq("qr_hash", hash)
    .maybeSingle();

  let holderEmail: string | null = null;
  let holderPhone: string | null = null;
  let quantity = 1;

  if (ticketRow?.order_id) {
    const { data: orderRow } = await supabase
      .from("orders")
      .select("buyer_email, buyer_phone, quantity")
      .eq("id", ticketRow.order_id)
      .maybeSingle();
    if (orderRow) {
      holderEmail = orderRow.buyer_email;
      holderPhone = orderRow.buyer_phone;
      quantity = orderRow.quantity ?? 1;
    }
  }

  return {
    outcome: row.outcome,
    message: row.outcome === "VALID" ? "Checked in." : "This ticket has already been checked in.",
    ticket: {
      eventTitle: row.event_title ?? "Event",
      tierName: row.tier_name ?? "Ticket",
      holderName: row.holder_name,
      holderEmail,
      holderPhone,
      quantity,
      checkedInAt: row.checked_in_at,
    },
  };
}
