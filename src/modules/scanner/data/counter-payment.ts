import "server-only";

import {
  abandonPayment,
  applyCapturedPayment,
  attachRazorpayOrder,
  createServiceClient,
  failRazorpayOrder,
  findIntentByRazorpayOrderId,
  findIntentByTicketOrder,
  getPublicKeyId,
  getRazorpay,
  isRazorpayConfigured,
  logger,
  verifyRazorpayPaymentSignature,
} from "@/modules/shared/server";
import type { CheckoutSession } from "@/modules/shared";

export interface CounterRazorpayInput {
  eventId: string;
  tierId: string;
  eventTitle: string;
  tierName: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string | null;
  idempotencyKey: string;
}

/**
 * Reserve one seat for a counter card/UPI sale and create the Razorpay order.
 * Money is computed inside create_counter_reserved_order - the client never
 * supplies amounts. Returns the CheckoutSession RazorpayCheckout renders.
 */
export async function startCounterRazorpaySale(
  staffId: string,
  input: CounterRazorpayInput,
): Promise<{ session?: CheckoutSession; error?: string }> {
  if (!isRazorpayConfigured()) return { error: "Online payments are not configured yet." };

  const supabase = createServiceClient();
  const { data: order, error } = await supabase.rpc("create_counter_reserved_order", {
    p_staff_id: staffId,
    p_event_id: input.eventId,
    p_tier_id: input.tierId,
    p_buyer_name: input.buyerName,
    p_buyer_phone: input.buyerPhone,
    p_buyer_email: input.buyerEmail,
    p_buyer_gender: null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return { error: error.message };
  if (!order) return { error: "Could not reserve the ticket." };

  const intent = await findIntentByTicketOrder(order.id);
  if (!intent) return { error: "Payment intent was not created." };
  if (intent.status !== "CREATED") return { error: "This payment was already completed - start a new sale." };

  let razorpayOrderId: string;
  try {
    const rz = await getRazorpay().orders.create({
      amount: intent.amountPaise,
      currency: "INR",
      receipt: intent.id,
      notes: {
        payment_intent_id: intent.id,
        kind: intent.kind,
        ref_id: intent.refId,
        sale_channel: "COUNTER_RAZORPAY",
        event_id: input.eventId,
        tier_id: input.tierId,
        event_title: input.eventTitle,
      },
    });
    razorpayOrderId = rz.id;
  } catch (err) {
    try {
      await failRazorpayOrder(order.id);
    } catch {
      // best-effort - the expiry cron also releases the reservation
    }
    return {
      error: err instanceof Error ? `Payment gateway error: ${err.message}` : "Could not create payment order.",
    };
  }

  try {
    await attachRazorpayOrder(intent.id, razorpayOrderId);
  } catch (err) {
    logger.error({ err: String(err), intentId: intent.id }, "attach_razorpay_order failed (counter)");
    try {
      await failRazorpayOrder(order.id);
    } catch {
      // best-effort
    }
    return { error: "Failed to link payment order. Please try again." };
  }

  return {
    session: {
      orderId: order.id,
      razorpayOrderId,
      amountPaise: intent.amountPaise,
      currency: "INR",
      keyId: getPublicKeyId(),
      eventTitle: input.eventTitle,
      tierName: input.tierName,
      quantity: 1,
      buyerName: input.buyerName,
      buyerEmail: input.buyerEmail,
      buyerPhone: input.buyerPhone,
      intentId: intent.id,
      expiresAt: intent.expiresAt,
    },
  };
}

/**
 * Verify the Razorpay callback for a counter sale: signature first, then staff
 * ownership (the order must have been sold by this staff member), then the
 * shared apply_captured_payment dispatcher - idempotent against the webhook.
 */
export async function verifyCounterRazorpaySale(
  staffId: string,
  input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
): Promise<{ success: boolean; error?: string; ticketId?: string }> {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return { success: false, error: "Payment verification not configured." };
  if (!verifyRazorpayPaymentSignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature, keySecret)) {
    return { success: false, error: "Payment signature verification failed." };
  }

  const intent = await findIntentByRazorpayOrderId(input.razorpayOrderId);
  if (!intent || intent.kind !== "TICKET_ORDER") {
    return { success: false, error: "Order not found for this payment." };
  }

  const supabase = createServiceClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, sold_by_staff_id")
    .eq("id", intent.refId)
    .maybeSingle();
  if (!order || order.sold_by_staff_id !== staffId) {
    return { success: false, error: "This payment does not belong to your sale." };
  }

  // Amount/method/fee come from Razorpay - never from the client.
  let amountPaise: number | null = null;
  let currency = "INR";
  let method: string | null = null;
  let feePaise: number | null = null;
  let taxPaise: number | null = null;
  try {
    const payment = await getRazorpay().payments.fetch(input.razorpayPaymentId);
    amountPaise = payment.amount as number;
    currency = (payment.currency as string) ?? "INR";
    method = (payment.method as string) ?? null;
    feePaise = (payment.fee as number) ?? null;
    taxPaise = (payment.tax as number) ?? null;
  } catch (err) {
    logger.warn({ err: String(err), paymentId: input.razorpayPaymentId }, "razorpay payment fetch failed - falling back to intent amount");
    amountPaise = intent.amountPaise;
  }

  const outcome = await applyCapturedPayment({
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    amountPaise: amountPaise ?? intent.amountPaise,
    currency,
    method,
    feePaise,
    taxPaise,
    signature: input.razorpaySignature,
  });
  if (outcome === "MISMATCH") return { success: false, error: "Payment amount mismatch - contact support." };
  if (outcome === "NOT_FOUND") return { success: false, error: "Order not found for this payment." };

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id")
    .eq("order_id", order.id)
    .limit(1)
    .maybeSingle();
  return { success: true, ticketId: ticket?.id };
}

/** Staff dismissed the modal or the payment failed terminally - release the seat. */
export async function abandonCounterRazorpaySale(
  staffId: string,
  razorpayOrderId: string,
): Promise<{ success: boolean; error?: string }> {
  const intent = await findIntentByRazorpayOrderId(razorpayOrderId);
  if (!intent || intent.kind !== "TICKET_ORDER") return { success: true }; // nothing to release
  const { data: order } = await createServiceClient()
    .from("orders")
    .select("sold_by_staff_id")
    .eq("id", intent.refId)
    .maybeSingle();
  if (!order || order.sold_by_staff_id !== staffId) {
    return { success: false, error: "This payment does not belong to your sale." };
  }
  const outcome = await abandonPayment(razorpayOrderId);
  if (outcome === "NOT_FOUND") return { success: false, error: "Order not found for this payment." };
  return { success: true };
}
