import "server-only";

import { MAX_TICKETS_PER_ORDER } from "@/lib/constants";
import { getEvent } from "@/lib/data/events";
import { getFeeTiers } from "@/lib/data/platform-settings";
import { calculatePrice, getFeeBpsForPrice } from "@/lib/pricing";
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

  // Use admin-configured commission tiers
  const feeTiers = await getFeeTiers();
  const feeBps = getFeeBpsForPrice(tier.pricePaise, feeTiers);
  const price = calculatePrice(tier.pricePaise, input.quantity, event.feePayer, feeBps);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .insert({
      event_id: event.id,
      tier_id: tier.id,
      user_id: user.id,
      quantity: input.quantity,
      unit_price_paise: tier.pricePaise,
      subtotal_paise: price.subtotalPaise,
      platform_fee_paise: price.platformFeePaise,
      total_paise: price.totalPaise,
      fee_payer: event.feePayer,
      status: "PENDING_VERIFICATION",
      utr_reference: input.utrReference,
      payment_proof_url: input.paymentProofUrl,
      buyer_name: input.buyerName,
      buyer_phone: input.buyerPhone,
      buyer_email: input.buyerEmail,
      buyer_gender: input.buyerGender,
    })
    .select("*")
    .single();
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

  // Supabase: use the create_free_order RPC (auto-confirms + mints tickets)
  const supabase = await createClient();
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

  const [{ data: events }, { data: tiers }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, starts_at, venue_name")
      .in("id", [...new Set(tickets.map((ticket) => ticket.event_id))]),
    supabase
      .from("ticket_tiers")
      .select("id, name")
      .in("id", [...new Set(tickets.map((ticket) => ticket.tier_id))]),
  ]);

  return tickets.map((ticket) => {
    const event = events?.find((candidate) => candidate.id === ticket.event_id);
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
    };
  });
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
  const { error } = await supabase
    .from("orders")
    .update({
      status: "REJECTED",
      rejection_reason: reason || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
}

export async function checkInTicket(qrHash: string, eventId: string): Promise<ScanResult> {
  const hash = qrHash.trim();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in_ticket", { p_qr_hash: hash, p_event_id: eventId });
  if (error) throw error;

  const row = data?.[0];
  if (!row || row.outcome === "INVALID") {
    return { outcome: "INVALID", message: "Ticket not recognised." };
  }

  return {
    outcome: row.outcome,
    message: row.outcome === "VALID" ? "Checked in." : "This ticket has already been checked in.",
    ticket: {
      eventTitle: row.event_title ?? "Event",
      tierName: row.tier_name ?? "Ticket",
      holderName: row.holder_name,
      checkedInAt: row.checked_in_at,
    },
  };
}
