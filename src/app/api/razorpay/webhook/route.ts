import { NextResponse } from "next/server";

import {
  confirmRazorpayOrder,
  failRazorpayOrder,
  findOrderByRazorpayOrderId,
} from "@/lib/data/orders";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay-verify";
import { createServiceClient } from "@/lib/supabase/service";

// Must run on Node.js (not Edge) — needs crypto for HMAC verification
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Razorpay webhook handler.
 *
 * Flow:
 *  1. Read raw body (NOT parsed JSON — needed for signature verification)
 *  2. Verify HMAC-SHA256 signature using RAZORPAY_WEBHOOK_SECRET
 *  3. Check idempotency via webhook_events table
 *  4. Process event:
 *     - payment.captured / order.paid → confirm_razorpay_order (if still RESERVED)
 *     - payment.failed → fail_razorpay_order
 *     - refund.processed → update refund status to COMPLETED
 *     - refund.failed → update refund status to FAILED
 *  5. Always return 200 after signature verification (prevent retries)
 *
 * IMPORTANT: All DB operations use the service-role client because webhooks
 * have no user session/cookies. Using the anon client would fail under RLS.
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook] RAZORPAY_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // 1. Read raw body — do NOT parse JSON before signature verification
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  // 2. Verify signature
  const isValid = verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    console.error("[webhook] Signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 3. Parse the verified body
  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("[webhook] Invalid JSON payload");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = payload.event?.id ?? "";
  const eventType = payload.event?.entity ?? "";

  if (!eventId) {
    console.error("[webhook] Missing event id");
    return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  }

  console.log(`[webhook] Received: type=${eventType}, eventId=${eventId}`);

  // 4. Use the service-role client for ALL database operations.
  // Webhooks have no user session, so the anon/cookie client would fail under RLS.
  const supabase = createServiceClient();

  // Check if we've already processed this event
  const { data: existing } = await supabase
    .from("webhook_events")
    .select("id, processed")
    .eq("razorpay_event_id", eventId)
    .maybeSingle();

  if (existing?.processed) {
    console.log(`[webhook] Already processed: eventId=${eventId}, type=${eventType}`);
    return NextResponse.json({ status: "already_processed" });
  }

  // Extract order/payment info from the payload
  const paymentEntity = payload.payload?.payment?.entity;
  const orderEntity = payload.payload?.order?.entity;
  const refundEntity = payload.payload?.refund?.entity;

  // Find the internal order id from the Razorpay order id
  const razorpayOrderId =
    paymentEntity?.order_id ?? orderEntity?.id ?? "";
  let internalOrderId: string | null = null;

  if (razorpayOrderId) {
    // Pass the service client so RLS doesn't block the lookup
    const order = await findOrderByRazorpayOrderId(razorpayOrderId, supabase);
    if (order) internalOrderId = order.id;
  }

  // Log the webhook event (insert or update the existing unprocessed record)
  const { error: logError } = await supabase.from("webhook_events").upsert(
    {
      razorpay_event_id: eventId,
      event_type: eventType,
      payload: payload as unknown as Record<string, unknown>,
      order_id: internalOrderId,
      processed: false,
      created_at: new Date().toISOString(),
    },
    { onConflict: "razorpay_event_id" },
  );
  if (logError) {
    console.error(`[webhook] Failed to log webhook event: eventId=${eventId}, error=`, logError);
  }

  // 5. Process the event
  let processed = false;
  let errorMessage: string | null = null;

  try {
    switch (eventType) {
      case "payment.captured":
      case "order.paid": {
        if (!internalOrderId || !paymentEntity) {
          errorMessage = "Missing order id or payment entity";
          console.warn(`[webhook] ${eventType}: missing order/payment, eventId=${eventId}`);
          break;
        }
        console.log(`[webhook] ${eventType}: confirming orderId=${internalOrderId}, paymentId=${paymentEntity.id}, method=${paymentEntity.method ?? "unknown"}`);
        // Confirm the order using the service client (idempotent — safe if callback already confirmed)
        // Pass null for signature — the webhook HMAC is not the payment signature.
        // The payment signature was already verified by the client-side callback.
        // The webhook signature itself was verified above.
        await confirmRazorpayOrder(
          internalOrderId,
          paymentEntity.id,
          null, // payment signature — not available in webhook payload
          paymentEntity.method ?? null,
          supabase,
        );
        console.log(`[webhook] ${eventType}: order confirmed, orderId=${internalOrderId}`);

        // Insert payment_ledger entry (best-effort, but using service client)
        try {
          const { data: orderRow } = await supabase
            .from("orders")
            .select("event_id, commission_paise, convenience_fee_paise, organizer_payout_paise, subtotal_paise, platform_fee_paise, total_paise")
            .eq("id", internalOrderId)
            .maybeSingle();

          if (orderRow) {
            const { data: eventRow } = await supabase
              .from("events")
              .select("organizer_id")
              .eq("id", orderRow.event_id)
              .maybeSingle();

            // Check if a ledger entry already exists for this payment (idempotency)
            const { data: existingLedger } = await supabase
              .from("payment_ledger")
              .select("id")
              .eq("razorpay_payment_id", paymentEntity.id)
              .maybeSingle();

            if (!existingLedger) {
              await supabase.from("payment_ledger").insert({
                order_id: internalOrderId,
                event_id: orderRow.event_id,
                organizer_id: eventRow?.organizer_id ?? null,
                type: "TICKET_SALE",
                gross_amount_paise: orderRow.subtotal_paise,
                commission_paise: orderRow.commission_paise ?? 0,
                convenience_fee_paise: orderRow.convenience_fee_paise ?? 0,
                razorpay_fee_paise: 0,
                net_organizer_paise: orderRow.organizer_payout_paise ?? 0,
                net_platform_paise: orderRow.platform_fee_paise ?? 0,
                razorpay_payment_id: paymentEntity.id,
                notes: "Razorpay webhook confirmation",
                created_at: new Date().toISOString(),
              });
            }
          }
        } catch (ledgerErr) {
          console.error("Ledger insert from webhook failed:", ledgerErr);
        }

        processed = true;
        break;
      }

      case "payment.failed": {
        if (!internalOrderId) {
          errorMessage = "Missing order id for payment.failed";
          console.warn(`[webhook] payment.failed: missing orderId, eventId=${eventId}`);
          break;
        }
        console.log(`[webhook] payment.failed: failing orderId=${internalOrderId}`);
        await failRazorpayOrder(internalOrderId, supabase);
        console.log(`[webhook] payment.failed: order failed, orderId=${internalOrderId}`);
        processed = true;
        break;
      }

      case "refund.processed": {
        // Update refund record to COMPLETED — match by razorpay_refund_id for precision
        if (refundEntity?.id) {
          console.log(`[webhook] refund.processed: refundId=${refundEntity.id}, amount=${refundEntity.amount ?? "unknown"}`);
          await supabase
            .from("refunds")
            .update({
              status: "COMPLETED",
              completed_at: new Date().toISOString(),
            })
            .eq("razorpay_refund_id", refundEntity.id);

          // Insert REFUND ledger entry (best-effort)
          try {
            const { data: refundRow } = await supabase
              .from("refunds")
              .select("order_id, amount_paise, event_id")
              .eq("razorpay_refund_id", refundEntity.id)
              .maybeSingle();

            if (refundRow) {
              // Look up organizer from the event
              const { data: eventRow } = await supabase
                .from("events")
                .select("organizer_id")
                .eq("id", refundRow.event_id)
                .maybeSingle();

              const { data: existingLedger } = await supabase
                .from("payment_ledger")
                .select("id")
                .eq("razorpay_payment_id", `refund_${refundEntity.id}`)
                .maybeSingle();

              if (!existingLedger) {
                await supabase.from("payment_ledger").insert({
                  order_id: refundRow.order_id,
                  event_id: refundRow.event_id,
                  organizer_id: eventRow?.organizer_id ?? null,
                  type: "REFUND",
                  gross_amount_paise: -(refundRow.amount_paise ?? 0),
                  commission_paise: 0,
                  convenience_fee_paise: 0,
                  razorpay_fee_paise: 0,
                  net_organizer_paise: 0,
                  net_platform_paise: -(refundRow.amount_paise ?? 0),
                  razorpay_payment_id: `refund_${refundEntity.id}`,
                  notes: "Refund processed via webhook",
                  created_at: new Date().toISOString(),
                });
              }
            }
          } catch (ledgerErr) {
            console.error("Refund ledger insert from webhook failed:", ledgerErr);
          }
        }
        processed = true;
        break;
      }

      case "refund.failed": {
        if (refundEntity?.id) {
          console.warn(`[webhook] refund.failed: refundId=${refundEntity.id}`);
          await supabase
            .from("refunds")
            .update({
              status: "FAILED",
            })
            .eq("razorpay_refund_id", refundEntity.id);
        }
        errorMessage = "Refund failed";
        processed = true; // Mark as processed so we don't retry
        break;
      }

      default:
        // Unknown event — log but don't error
        console.log(`[webhook] Unhandled event type: ${eventType}, eventId=${eventId}`);
        processed = true;
        break;
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Processing failed";
    processed = false;
    console.error(`[webhook] Processing error for ${eventType} (eventId=${eventId}):`, err);
  }

  console.log(`[webhook] Complete: type=${eventType}, eventId=${eventId}, processed=${processed}, error=${errorMessage ?? "null"}`);

  // 6. Update the webhook event record
  await supabase
    .from("webhook_events")
    .update({
      processed,
      error_message: errorMessage,
      processed_at: processed ? new Date().toISOString() : null,
    })
    .eq("razorpay_event_id", eventId);

  // 7. Return 200 after signature verification.
  // If processing failed, we still return 200 but with processed=false.
  // The admin can monitor webhook_events for processed=false entries.
  // Returning non-200 would cause Razorpay to retry, which is good for
  // transient failures but could cause duplicate processing for persistent ones.
  // The idempotency in confirm_razorpay_order and fail_razorpay_order handles retries safely.
  return NextResponse.json({
    status: processed ? "processed" : "failed",
    error: errorMessage,
  });
}

// Type definitions for the Razorpay webhook payload (subset)
interface RazorpayWebhookPayload {
  entity?: string;
  event?: {
    id: string;
    entity: string;
    account_id?: string;
    created_at?: number;
  };
  payload?: {
    payment?: {
      entity: {
        id: string;
        order_id?: string;
        method?: string;
        amount?: number;
        currency?: string;
        status?: string;
      };
    };
    order?: {
      entity: {
        id: string;
        amount_paid?: number;
        amount_due?: number;
        status?: string;
      };
    };
    refund?: {
      entity: {
        id: string;
        payment_id?: string;
        amount?: number;
        status?: string;
      };
    };
  };
}
