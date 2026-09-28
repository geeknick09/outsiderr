import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/modules/shared/auth/server";
import { createServiceClient } from "@/modules/shared/auth/service";
import type { CurrentUser } from "@/modules/shared/auth/auth";
import type { PaymentIntentRow } from "@/modules/shared/db/database.types";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PaymentKind =
  | "TICKET_ORDER"
  | "HERO_BOOST"
  | "SLOT_BOOST"
  | "DOOR_STAFF"
  | "CLUB_MEMBERSHIP";

export type PaymentIntentStatus =
  | "CREATED"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "MISMATCH";

export interface PaymentIntent {
  id: string;
  kind: PaymentKind;
  refId: string;
  userId: string;
  amountPaise: number;
  currency: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  status: PaymentIntentStatus;
  razorpayFeePaise: number | null;
  razorpayTaxPaise: number | null;
  paymentMethod: string | null;
  idempotencyKey: string | null;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toPaymentIntent(row: PaymentIntentRow): PaymentIntent {
  return {
    id: row.id,
    kind: row.kind,
    refId: row.ref_id,
    userId: row.user_id,
    amountPaise: row.amount_paise,
    currency: row.currency,
    razorpayOrderId: row.razorpay_order_id,
    razorpayPaymentId: row.razorpay_payment_id,
    status: row.status,
    razorpayFeePaise: row.razorpay_fee_paise,
    razorpayTaxPaise: row.razorpay_tax_paise,
    paymentMethod: row.payment_method,
    idempotencyKey: row.idempotency_key,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Intent lifecycle ───────────────────────────────────────────────────────

/**
 * Create (or replay) a payment intent for a non-order payable
 * (HERO_BOOST / SLOT_BOOST / DOOR_STAFF / CLUB_MEMBERSHIP).
 * Amount + ownership are validated inside the RPC — caller context is the
 * signed-in user's JWT.
 */
export async function createPaymentIntent(
  user: CurrentUser,
  kind: Exclude<PaymentKind, "TICKET_ORDER">,
  refId: string,
  idempotencyKey?: string | null,
): Promise<PaymentIntent> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_payment_intent", {
    p_kind: kind,
    p_ref_id: refId,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) throw new Error(error.message || "Could not start payment.");
  if (!data) throw new Error("Could not start payment.");
  return toPaymentIntent(data as unknown as PaymentIntentRow);
}

/**
 * Attach the gateway order id to an intent. Service-role only — this is the
 * trust boundary between "user says they want to pay" and "Razorpay order
 * exists for this intent".
 */
export async function attachRazorpayOrder(
  intentId: string,
  razorpayOrderId: string,
  client?: SupabaseClient,
): Promise<void> {
  const supabase = client ?? createServiceClient();
  const { error } = await supabase.rpc("attach_razorpay_order", {
    p_intent_id: intentId,
    p_razorpay_order_id: razorpayOrderId,
  });
  if (error) throw new Error(error.message || "Failed to link payment order.");
}

/** Find an intent by its gateway order id (service role — webhook/verify path). */
export async function findIntentByRazorpayOrderId(
  razorpayOrderId: string,
): Promise<PaymentIntent | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("payment_intents")
    .select("*")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();
  return data ? toPaymentIntent(data) : null;
}

/** Find an intent by id (service role). */
export async function findIntentById(intentId: string): Promise<PaymentIntent | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("payment_intents")
    .select("*")
    .eq("id", intentId)
    .maybeSingle();
  return data ? toPaymentIntent(data) : null;
}

/** Find the intent bound to a ticket order (service role). */
export async function findIntentByTicketOrder(orderId: string): Promise<PaymentIntent | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("payment_intents")
    .select("*")
    .eq("kind", "TICKET_ORDER")
    .eq("ref_id", orderId)
    .maybeSingle();
  return data ? toPaymentIntent(data) : null;
}

/** List the signed-in user's own intents (RLS-scoped). */
export async function listMyPaymentIntents(
  user: CurrentUser,
): Promise<PaymentIntent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_intents")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toPaymentIntent);
}

/** Cron: expire CREATED intents past their TTL (service role). */
export async function expirePaymentIntents(): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("expire_payment_intents");
  if (error) throw new Error(error.message);
  return data ?? 0;
}

// ─── Webhook event claims ───────────────────────────────────────────────────

export async function recordWebhookEvent(input: {
  eventId: string;
  type: string;
  payload: Record<string, unknown>;
  orderId?: string | null;
}): Promise<{ isNew: boolean; alreadyProcessed: boolean }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("record_webhook_event", {
    p_event_id: input.eventId,
    p_type: input.type,
    p_payload: input.payload,
    p_order_id: input.orderId ?? null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    isNew: row?.is_new ?? false,
    alreadyProcessed: row?.already_processed ?? false,
  };
}

export async function finishWebhookEvent(
  eventId: string,
  ok: boolean,
  errorMessage?: string | null,
): Promise<void> {
  const supabase = createServiceClient();
  await supabase.rpc("finish_webhook_event", {
    p_event_id: eventId,
    p_ok: ok,
    p_error: errorMessage ?? null,
  });
}

// ─── Dispatcher (service-role state transitions) ────────────────────────────

export async function applyCapturedPayment(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amountPaise: number;
  currency: string;
  method?: string | null;
  feePaise?: number | null;
  taxPaise?: number | null;
  signature?: string | null;
}): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("apply_captured_payment", {
    p_razorpay_order_id: input.razorpayOrderId,
    p_razorpay_payment_id: input.razorpayPaymentId,
    p_amount: input.amountPaise,
    p_currency: input.currency,
    p_method: input.method ?? null,
    p_fee: input.feePaise ?? null,
    p_tax: input.taxPaise ?? null,
    p_signature: input.signature ?? null,
  });
  if (error) throw new Error(error.message);
  return data ?? "UNKNOWN";
}

export async function applyFailedPayment(razorpayOrderId: string): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("apply_failed_payment", {
    p_razorpay_order_id: razorpayOrderId,
  });
  if (error) throw new Error(error.message);
  return data ?? "UNKNOWN";
}

/**
 * Terminal release — user dismissed the modal / abandoned checkout.
 * Order RESERVED → FAILED and reserved seats go back immediately.
 * No-op once the intent is PAID (a racing capture wins).
 */
export async function abandonPayment(razorpayOrderId: string): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("abandon_payment", {
    p_razorpay_order_id: razorpayOrderId,
  });
  if (error) throw new Error(error.message);
  return data ?? "UNKNOWN";
}