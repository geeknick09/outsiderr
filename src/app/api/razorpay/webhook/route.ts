import { NextResponse } from "next/server";

import {
  createServiceClient,
  logger,
  notifyAdmins,
  verifyRazorpayWebhookSignature,
} from "@/modules/shared/server";

// Must run on Node.js (not Edge) - needs crypto for HMAC verification
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Razorpay webhook handler - source of truth for payment state.
 *
 * Flow:
 *  1. Read raw body → verify HMAC-SHA256 signature (401 on failure, no retry).
 *  2. record_webhook_event - insert-or-claim (idempotent; concurrent
 *     deliveries of the same event id get "in_progress").
 *  3. Dispatch:
 *     - payment.captured / order.paid → apply_captured_payment (dispatcher)
 *     - payment.failed → apply_failed_payment
 *     - payment.authorized → log only (auto-capture on)
 *     - refund.* → finalize_refund (+ receipt linkage on refund.created)
 *     - payment.dispute.* → payment_disputes row + admin alert
 *     - unknown → logged, marked processed
 *  4. Success → finish_webhook_event(ok) → 200.
 *     Processing failure → finish_webhook_event(fail) → 500 so Razorpay
 *     retries with backoff; signature/parse errors stay 4xx.
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("RAZORPAY_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  if (!verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret)) {
    logger.error({ signature: signature.slice(0, 16) }, "webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.error("invalid JSON in webhook payload");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = typeof payload.event === "string" ? payload.event : "";
  const eventId = request.headers.get("x-razorpay-event-id") ?? "";
  if (!eventId || !eventType) {
    logger.error({ eventType, hasEventId: !!eventId }, "webhook missing event id/type");
    return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  }

  const paymentEntity = payload.payload?.payment?.entity;
  const orderEntity = payload.payload?.order?.entity;
  const refundEntity = payload.payload?.refund?.entity;
  const disputeEntity = payload.payload?.dispute?.entity;
  const razorpayOrderId =
    paymentEntity?.order_id ?? orderEntity?.id ?? refundEntity?.order_id ?? "";

  const supabase = createServiceClient();

  // Claim the event (idempotent across Razorpay retries)
  const { data: claim, error: claimErr } = await supabase.rpc("record_webhook_event", {
    p_event_id: eventId,
    p_type: eventType,
    p_payload: payload as unknown as Record<string, unknown>,
    p_order_id: null,
  });
  if (claimErr) {
    logger.error({ eventId, error: claimErr.message }, "record_webhook_event failed");
    return NextResponse.json({ error: "Event tracking failed" }, { status: 500 });
  }
  const row = Array.isArray(claim) ? claim[0] : claim;
  if (row?.already_processed) {
    return NextResponse.json({ status: "already_processed" });
  }
  if (!row?.is_new) {
    return NextResponse.json({ status: "in_progress" });
  }

  logger.info({ eventType, eventId, razorpayOrderId }, "webhook received");

  try {
    switch (eventType) {
      case "payment.captured":
      case "order.paid": {
        const amount = paymentEntity?.amount ?? orderEntity?.amount_paid ?? 0;
        const { data: outcome, error } = await supabase.rpc("apply_captured_payment", {
          p_razorpay_order_id: razorpayOrderId,
          p_razorpay_payment_id: paymentEntity?.id ?? `orderpaid_${razorpayOrderId}`,
          p_amount: amount,
          p_currency: paymentEntity?.currency ?? orderEntity?.currency ?? "INR",
          p_method: paymentEntity?.method ?? null,
          p_fee: paymentEntity?.fee ?? null,
          p_tax: paymentEntity?.tax ?? null,
        });
        if (error) throw new Error(`apply_captured_payment: ${error.message}`);
        logger.info({ eventId, outcome }, "captured payment applied");
        if (outcome === "MISMATCH") {
          await notifyAdmins({
            type: "PAYMENT_ALERT",
            message: `Razorpay amount mismatch on order ${razorpayOrderId} - expected vs captured differ.`,
          });
        }
        break;
      }

      case "payment.failed": {
        // Per-attempt failure - NOT terminal. The Razorpay modal offers a
        // retry with another method; the order stays RESERVED until the user
        // gives up or the reservation TTL expires. Failing it here was what
        // turned successful retries into phantom late-capture refunds.
        const failureReason =
          paymentEntity?.error_description ??
          paymentEntity?.error_reason ??
          "payment.failed";
        const { data: outcome, error } = await supabase.rpc("apply_failed_payment", {
          p_razorpay_order_id: razorpayOrderId,
          p_error: typeof failureReason === "string" ? failureReason : "payment.failed",
        });
        if (error) throw new Error(`apply_failed_payment: ${error.message}`);
        logger.info({ eventId, outcome, reason: failureReason }, "failed payment attempt recorded");
        break;
      }

      case "payment.authorized": {
        logger.info({ eventId, paymentId: paymentEntity?.id }, "payment authorized (auto-capture)");
        break;
      }

      case "refund.created": {
        // Link the gateway refund id to our row via the receipt we sent.
        if (refundEntity?.id) {
          const receipt = refundEntity.receipt ?? null;
          if (receipt) {
            await supabase
              .from("refunds")
              .update({ razorpay_refund_id: refundEntity.id })
              .or(`receipt.eq.${receipt},id.eq.${receipt}`);
          }
        }
        break;
      }

      case "refund.processed":
      case "refund.failed":
      case "refund.speed_changed": {
        const status =
          eventType === "refund.processed" ? "processed"
          : eventType === "refund.failed" ? "failed"
          : refundEntity?.status ?? "ignored";
        if (refundEntity?.id) {
          const { data: outcome, error } = await supabase.rpc("finalize_refund", {
            p_razorpay_refund_id: refundEntity.id,
            p_status: status,
          });
          if (error) throw new Error(`finalize_refund: ${error.message}`);
          logger.info({ eventId, outcome }, "refund finalized");
        }
        break;
      }

      default: {
        if (eventType.startsWith("payment.dispute.")) {
          const entity = disputeEntity ?? paymentEntity;
          const disputedPaymentId = disputeEntity?.payment_id ?? paymentEntity?.id ?? null;
          await supabase.from("payment_disputes").upsert(
            {
              razorpay_dispute_id: entity?.id ?? eventId,
              razorpay_payment_id: disputedPaymentId,
              razorpay_order_id: razorpayOrderId || null,
              amount_paise: entity?.amount ?? paymentEntity?.amount ?? null,
              status: eventType.replace("payment.dispute.", "").toUpperCase(),
              raw: payload as unknown as Record<string, unknown>,
            },
            { onConflict: "razorpay_dispute_id" },
          );
          await notifyAdmins({
            type: "PAYMENT_ALERT",
            message: `Razorpay dispute ${eventType.replace("payment.dispute.", "")} on payment ${disputedPaymentId ?? "unknown"} - review in admin.`,
          });
          logger.warn({ eventId, eventType }, "dispute recorded");
        } else {
          logger.info({ eventType, eventId }, "unhandled webhook event type");
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    logger.error({ eventType, eventId, error: message }, "webhook processing error");
    await supabase.rpc("finish_webhook_event", { p_event_id: eventId, p_ok: false, p_error: message });
    // 500 → Razorpay retries with backoff (≤24h); idempotency makes replay safe.
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  }

  await supabase.rpc("finish_webhook_event", { p_event_id: eventId, p_ok: true });
  return NextResponse.json({ status: "processed" });
}

interface RazorpayWebhookPayload {
  entity?: string;
  account_id?: string;
  event?: string;
  created_at?: number;
  payload?: {
    payment?: {
      entity: {
        id: string;
        order_id?: string;
        method?: string;
        amount?: number;
        currency?: string;
        status?: string;
        fee?: number;
        tax?: number;
        error_description?: string;
        error_reason?: string;
      };
    };
    order?: {
      entity: {
        id: string;
        amount_paid?: number;
        amount_due?: number;
        currency?: string;
        status?: string;
      };
    };
    refund?: {
      entity: {
        id: string;
        payment_id?: string;
        order_id?: string;
        amount?: number;
        status?: string;
        receipt?: string;
      };
    };
    dispute?: {
      entity: {
        id: string;
        payment_id?: string;
        amount?: number;
        status?: string;
      };
    };
  };
}