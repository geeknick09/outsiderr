import type { CurrentUser } from "../auth/auth";
import type { CheckoutSession } from "../lib/types";
import {
  abandonPayment,
  applyCapturedPayment,
  applyFailedPayment,
  attachRazorpayOrder,
  createPaymentIntent,
  findIntentById,
  findIntentByRazorpayOrderId,
  findIntentByTicketOrder,
  type PaymentIntent,
  type PaymentKind,
} from "../data/payments";
import { createReservedOrder, failRazorpayOrder } from "../data/orders";
import { getEvent } from "../data/events";
import { createServiceClient } from "../auth/service";
import { getPublicKeyId, getRazorpay, isRazorpayConfigured } from "../lib/razorpay";
import { verifyRazorpayPaymentSignature } from "../lib/razorpay-verify";
import { logger } from "../lib/logger";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StartPaymentInput {
  kind: PaymentKind;
  /** Non-order payables: the boost/door-staff/club-member row id. */
  refId?: string;
  /** TICKET_ORDER inputs: */
  eventId?: string;
  tierId?: string;
  quantity?: number;
  buyerName?: string | null;
  buyerPhone?: string | null;
  buyerEmail?: string | null;
  buyerGender?: string | null;
  idempotencyKey?: string | null;
  /** Extra display fields for the checkout modal. */
  itemTitle?: string | null;
}

export interface StartPaymentResult {
  intentId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  expiresAt: string | null;
  /** CheckoutSession fields for the ticket modal (back-compat). */
  session?: CheckoutSession;
}

/**
 * Unified payment entrypoint. Creates the intent (or reserved order for
 * TICKET_ORDER), creates the Razorpay order server-side, attaches it, and
 * returns everything the client needs to open Checkout.js.
 *
 * Money is always computed in the DB — the client never supplies amounts.
 */
export async function startPayment(
  user: CurrentUser,
  input: StartPaymentInput,
): Promise<{ result?: StartPaymentResult; error?: string }> {
  if (!isRazorpayConfigured()) {
    return { error: "Online payments are not configured yet. Please try again later." };
  }

  let intent: PaymentIntent;
  let sessionBase: Partial<CheckoutSession> = {};
  let orderIdForFail: string | null = null;

  try {
    if (input.kind === "TICKET_ORDER") {
      if (!input.eventId || !input.tierId || !input.quantity) {
        return { error: "Missing ticket details." };
      }
      const reserved = await createReservedOrder(user, {
        eventId: input.eventId,
        tierId: input.tierId,
        quantity: input.quantity,
        buyerName: input.buyerName?.trim() || user.name,
        buyerPhone: input.buyerPhone?.trim() || (user.phone ?? ""),
        buyerEmail: input.buyerEmail?.trim() || null,
        buyerGender: input.buyerGender?.trim() || null,
        idempotencyKey: input.idempotencyKey ?? null,
      });
      orderIdForFail = reserved.id;
      const found = await findIntentByTicketOrder(reserved.id);
      if (!found) return { error: "Payment intent was not created." };
      intent = found;
      const event = await getEvent(input.eventId);
      const tier = event?.tiers.find((t) => t.id === input.tierId);
      sessionBase = {
        orderId: reserved.id,
        eventTitle: event?.title ?? "Event",
        tierName: tier?.name ?? "Ticket",
        quantity: input.quantity,
        buyerName: input.buyerName?.trim() || user.name,
        buyerEmail: input.buyerEmail?.trim() || null,
        buyerPhone: input.buyerPhone?.trim() || (user.phone ?? ""),
      };
    } else {
      if (!input.refId) return { error: "Missing payment reference." };
      intent = await createPaymentIntent(
        user,
        input.kind,
        input.refId,
        input.idempotencyKey ?? null,
      );
      sessionBase = { eventTitle: input.itemTitle ?? "Outsiderr" };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not start payment." };
  }

  if (intent.status !== "CREATED") {
    if (intent.status === "PAID") return { error: "This payment was already completed." };
    return { error: `This payment is ${intent.status.toLowerCase()} — start a new one.` };
  }
  if (new Date(intent.expiresAt).getTime() <= Date.now()) {
    return { error: "This payment window has expired — start a new one." };
  }

  // Create the Razorpay order; failure → mark the intent/order failed.
  let razorpayOrderId: string;
  try {
    const order = await getRazorpay().orders.create({
      amount: intent.amountPaise,
      currency: "INR",
      receipt: intent.id,
      notes: {
        payment_intent_id: intent.id,
        kind: intent.kind,
        ref_id: intent.refId,
        ...(input.eventId ? { event_id: input.eventId } : {}),
        ...(input.tierId ? { tier_id: input.tierId } : {}),
        ...(sessionBase.eventTitle ? { event_title: sessionBase.eventTitle } : {}),
      },
    });
    razorpayOrderId = order.id;
  } catch (error) {
    if (orderIdForFail) {
      try {
        await failRazorpayOrder(orderIdForFail);
      } catch {
        // best-effort — expiry cron cleans up too
      }
    }
    return {
      error:
        error instanceof Error
          ? `Payment gateway error: ${error.message}`
          : "Could not create payment order.",
    };
  }

  try {
    await attachRazorpayOrder(intent.id, razorpayOrderId);
  } catch (error) {
    logger.error({ err: String(error), intentId: intent.id }, "attach_razorpay_order failed");
    if (orderIdForFail) {
      try {
        await failRazorpayOrder(orderIdForFail);
      } catch {
        // best-effort
      }
    }
    return { error: "Failed to link payment order. Please try again." };
  }

  const result: StartPaymentResult = {
    intentId: intent.id,
    razorpayOrderId,
    amountPaise: intent.amountPaise,
    currency: "INR",
    keyId: getPublicKeyId(),
    expiresAt: intent.expiresAt,
  };
  if (input.kind === "TICKET_ORDER") {
    result.session = {
      orderId: sessionBase.orderId ?? intent.refId,
      razorpayOrderId,
      amountPaise: intent.amountPaise,
      currency: "INR",
      keyId: getPublicKeyId(),
      eventTitle: sessionBase.eventTitle ?? "Event",
      tierName: sessionBase.tierName ?? "Ticket",
      quantity: sessionBase.quantity ?? input.quantity ?? 1,
      buyerName: sessionBase.buyerName ?? null,
      buyerEmail: sessionBase.buyerEmail ?? null,
      buyerPhone: sessionBase.buyerPhone ?? null,
      intentId: intent.id,
      expiresAt: intent.expiresAt,
    };
  }
  return { result };
}

/**
 * Verify a client-side Razorpay callback: signature + ownership + amount +
 * currency, then dispatch through apply_captured_payment (idempotent vs the
 * webhook — whichever lands first does the work).
 */
export async function verifyPayment(
  user: CurrentUser,
  input: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    paymentMethod?: string | null;
  },
): Promise<{ success: boolean; error?: string; intentId?: string; orderId?: string; kind?: string }> {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return { success: false, error: "Payment verification not configured." };

  const valid = verifyRazorpayPaymentSignature(
    input.razorpayOrderId,
    input.razorpayPaymentId,
    input.razorpaySignature,
    keySecret,
  );
  if (!valid) {
    logger.warn({ rzpOrder: input.razorpayOrderId, userId: user.id }, "payment signature verification failed");
    return { success: false, error: "Payment signature verification failed." };
  }

  // Ownership: resolve through the intent (fall back to legacy order lookup).
  const intent = await findIntentByRazorpayOrderId(input.razorpayOrderId);
  if (intent) {
    if (intent.userId !== user.id) {
      return { success: false, error: "This payment does not belong to your account." };
    }
  } else {
    const supabase = createServiceClient();
    const { data: legacy } = await supabase
      .from("orders")
      .select("user_id")
      .eq("razorpay_order_id", input.razorpayOrderId)
      .maybeSingle();
    if (!legacy) return { success: false, error: "Order not found for this payment." };
    if (legacy.user_id !== user.id) {
      return { success: false, error: "This payment does not belong to your account." };
    }
  }

  // Amount/currency/method/fee come from Razorpay — never from the client.
  let amountPaise: number | null = null;
  let currency = "INR";
  let method = input.paymentMethod ?? null;
  let feePaise: number | null = null;
  let taxPaise: number | null = null;
  try {
    const payment = await getRazorpay().payments.fetch(input.razorpayPaymentId);
    amountPaise = payment.amount as number;
    currency = (payment.currency as string) ?? "INR";
    method = (payment.method as string) ?? method;
    feePaise = (payment.fee as number) ?? null;
    taxPaise = (payment.tax as number) ?? null;
  } catch (error) {
    logger.warn({ err: String(error), paymentId: input.razorpayPaymentId }, "razorpay payment fetch failed — falling back to intent amount");
    amountPaise = intent?.amountPaise ?? null;
  }
  if (amountPaise == null) {
    return { success: false, error: "Could not verify the payment amount." };
  }

  const outcome = await applyCapturedPayment({
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    amountPaise,
    currency,
    method,
    feePaise,
    taxPaise,
    signature: input.razorpaySignature,
  });

  if (outcome === "MISMATCH") {
    return { success: false, error: "Payment amount mismatch — contact support." };
  }
  if (outcome === "NOT_FOUND") {
    return { success: false, error: "Order not found for this payment." };
  }
  return {
    success: true,
    intentId: intent?.id,
    orderId: intent?.refId,
    kind: intent?.kind,
  };
}

/**
 * Client-reported dismissal/cancel → terminal release of the reservation.
 * apply_failed_payment is for per-attempt webhook events (non-terminal);
 * user abandonment is terminal — seats go back immediately, not on cron.
 */
export async function reportPaymentFailure(
  user: CurrentUser,
  input: { razorpayOrderId: string },
): Promise<{ success: boolean; error?: string }> {
  const intent = await findIntentByRazorpayOrderId(input.razorpayOrderId);
  if (intent && intent.userId !== user.id) {
    return { success: false, error: "This payment does not belong to your account." };
  }
  const outcome = await abandonPayment(input.razorpayOrderId);
  if (outcome === "NOT_FOUND") {
    return { success: false, error: "Order not found for this payment." };
  }
  return { success: true };
}

/** Status for the checkout-status page (intent + ref state). */
export async function getPaymentStatus(
  user: CurrentUser,
  input: { intentId?: string; razorpayOrderId?: string; orderId?: string },
): Promise<{
  status: string;
  kind: string | null;
  refId: string | null;
  refStatus: string | null;
  orderId: string | null;
  expiresAt: string | null;
} | null> {
  let intent: PaymentIntent | null = null;
  if (input.intentId) intent = await findIntentById(input.intentId);
  else if (input.razorpayOrderId) intent = await findIntentByRazorpayOrderId(input.razorpayOrderId);
  else if (input.orderId) intent = await findIntentByTicketOrder(input.orderId);

  if (!intent) {
    // Legacy order path (no intent rows pre-migration).
    if (input.orderId) {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("orders")
        .select("user_id, status, reservation_expires_at")
        .eq("id", input.orderId)
        .maybeSingle();
      if (!data || data.user_id !== user.id) return null;
      return {
        status: data.status,
        kind: "TICKET_ORDER",
        refId: input.orderId,
        refStatus: data.status,
        orderId: input.orderId,
        expiresAt: data.reservation_expires_at,
      };
    }
    return null;
  }
  if (intent.userId !== user.id) return null;

  // Resolve the ref's own status for the UI.
  const supabase = createServiceClient();
  let refStatus: string | null = null;
  if (intent.kind === "TICKET_ORDER") {
    const { data } = await supabase.from("orders").select("status").eq("id", intent.refId).maybeSingle();
    refStatus = data?.status ?? null;
  } else if (intent.kind === "HERO_BOOST") {
    const { data } = await supabase.from("hero_boosts").select("status").eq("id", intent.refId).maybeSingle();
    refStatus = data?.status ?? null;
  } else if (intent.kind === "SLOT_BOOST") {
    const { data } = await supabase.from("boosts").select("status").eq("id", intent.refId).maybeSingle();
    refStatus = data?.status ?? null;
  } else if (intent.kind === "DOOR_STAFF") {
    const { data } = await supabase.from("door_staff_orders").select("payment_status").eq("id", intent.refId).maybeSingle();
    refStatus = data?.payment_status ?? null;
  } else if (intent.kind === "CLUB_MEMBERSHIP") {
    const { data } = await supabase.from("club_members").select("status").eq("id", intent.refId).maybeSingle();
    refStatus = data?.status ?? null;
  }

  return {
    status: intent.status,
    kind: intent.kind,
    refId: intent.refId,
    refStatus,
    orderId: intent.kind === "TICKET_ORDER" ? intent.refId : null,
    expiresAt: intent.expiresAt,
  };
}