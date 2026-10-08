"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/modules/shared/server";
import {
  validate,
  rateLimit,
  getRateLimitIdentifier,
  RATE_LIMITS,
  UUID_RE,
  staffRegisterSchema,
} from "@/modules/shared";
import { normalisePhone, type CheckoutSession } from "@/modules/shared";
import { listCounterEvents, resolveCounterStaff, type CounterEvent, type CounterStaff } from "../data/counter";
import {
  abandonCounterRazorpaySale,
  startCounterRazorpaySale,
  verifyCounterRazorpaySale,
} from "../data/counter-payment";


/** Phone + personal PIN -> counter session token (12h). Rate limited per device. */
export async function counterLoginAction(
  phone: string,
  pin: string,
): Promise<{ error: string | null; token?: string; staff?: CounterStaff }> {
  const h = await headers();
  const rl = rateLimit(`counter-login:${getRateLimitIdentifier(h)}`, RATE_LIMITS.PIN_VERIFY);
  if (rl.limited) return { error: "Too many attempts. Please wait a minute and try again." };

  const p = normalisePhone(phone);
  if (p.length !== 10 || !/^\d{6}$/.test(pin)) return { error: "Enter your 10-digit phone and 6-digit PIN." };

  const { data, error } = await createServiceClient().rpc("staff_login_session", { p_phone: p, p_pin: pin });
  if (error) return { error: error.message };
  const row = data?.[0];
  if (!row) return { error: "Phone or PIN is incorrect, or your access is inactive." };
  return {
    error: null,
    token: row.token,
    staff: { id: row.staff_id, name: row.name, ownerType: row.owner_type as CounterStaff["ownerType"] },
  };
}

/** Staff identity and assigned events for a counter token. */
export async function loadCounterAction(
  token: string,
): Promise<{ error: string | null; staff?: CounterStaff; events?: CounterEvent[] }> {
  const staff = await resolveCounterStaff(token);
  if (!staff) return { error: "Your session has ended. Please sign in again." };
  return { error: null, staff, events: await listCounterEvents(staff.id) };
}

export interface CounterSaleResult {
  error: string | null;
  ticketId?: string;
  orderId?: string;
  totalPaise?: number;
}

/** Cash counter sale. Price comes from the tier; the client never sends an amount. */
export async function counterSaleAction(formData: FormData): Promise<CounterSaleResult> {
  const token = String(formData.get("token") ?? "");
  const staff = await resolveCounterStaff(token);
  if (!staff) return { error: "Your session has ended. Please sign in again." };

  const eventId = String(formData.get("eventId") ?? "");
  const tierId = String(formData.get("tierId") ?? "");
  const clientSaleId = String(formData.get("clientSaleId") ?? "");
  const mode = String(formData.get("mode") ?? "WALKIN_QR");
  if (!UUID_RE.test(eventId) || !UUID_RE.test(tierId)) return { error: "Choose an event and a ticket tier." };
  if (!UUID_RE.test(clientSaleId)) return { error: "Missing sale reference. Please try again." };
  if (mode !== "WALKIN_QR" && mode !== "WALKIN_INSTANT") return { error: "Choose how to issue the ticket." };

  const v = validate(staffRegisterSchema.pick({ name: true, phone: true, email: true }), {
    name: String(formData.get("buyerName") ?? ""),
    phone: normalisePhone(String(formData.get("buyerPhone") ?? "")),
    email: String(formData.get("buyerEmail") ?? "").trim(),
  });
  if (!v.success) return { error: v.error };
  if (v.data.phone.length !== 10) return { error: "Enter the buyer's 10-digit phone number." };

  const { data, error } = await createServiceClient().rpc("create_counter_cash_sale", {
    p_staff_id: staff.id,
    p_event_id: eventId,
    p_tier_id: tierId,
    p_buyer_name: v.data.name,
    p_buyer_phone: v.data.phone,
    p_buyer_email: v.data.email,
    p_mode: mode,
    p_idempotency_key: clientSaleId,
  });
  if (error) return { error: error.message };

  const res = (data ?? {}) as { orderId?: string; ticketId?: string; totalPaise?: number };
  revalidatePath("/box-office");
  return { error: null, orderId: res.orderId, ticketId: res.ticketId, totalPaise: res.totalPaise };
}

/** Counter card/UPI sale: reserve the seat and create the Razorpay order for Checkout.js. */
export async function counterStartRazorpayAction(
  formData: FormData,
): Promise<{ error: string | null; session?: CheckoutSession }> {
  const token = String(formData.get("token") ?? "");
  const staff = await resolveCounterStaff(token);
  if (!staff) return { error: "Your session has ended. Please sign in again." };

  const eventId = String(formData.get("eventId") ?? "");
  const tierId = String(formData.get("tierId") ?? "");
  const clientSaleId = String(formData.get("clientSaleId") ?? "");
  if (!UUID_RE.test(eventId) || !UUID_RE.test(tierId)) return { error: "Choose an event and a ticket tier." };
  if (!UUID_RE.test(clientSaleId)) return { error: "Missing sale reference. Please try again." };

  const v = validate(staffRegisterSchema.pick({ name: true, phone: true, email: true }), {
    name: String(formData.get("buyerName") ?? ""),
    phone: normalisePhone(String(formData.get("buyerPhone") ?? "")),
    email: String(formData.get("buyerEmail") ?? "").trim(),
  });
  if (!v.success) return { error: v.error };
  if (v.data.phone.length !== 10) return { error: "Enter the buyer's 10-digit phone number." };

  const res = await startCounterRazorpaySale(staff.id, {
    eventId,
    tierId,
    eventTitle: String(formData.get("eventTitle") ?? "Event"),
    tierName: String(formData.get("tierName") ?? "Ticket"),
    buyerName: v.data.name,
    buyerPhone: v.data.phone,
    buyerEmail: v.data.email,
    idempotencyKey: clientSaleId,
  });
  if (res.error || !res.session) return { error: res.error ?? "Could not start the payment." };
  revalidatePath("/box-office");
  return { error: null, session: res.session };
}

/** Razorpay Checkout.js success callback for a counter sale. */
export async function counterVerifyRazorpayAction(
  token: string,
  input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
): Promise<{ success: boolean; error?: string; ticketId?: string }> {
  const staff = await resolveCounterStaff(token);
  if (!staff) return { success: false, error: "Your session has ended. Please sign in again." };
  return verifyCounterRazorpaySale(staff.id, input);
}

/** Buyer/staff dismissed the Razorpay modal - release the reserved seat. */
export async function counterAbandonRazorpayAction(
  token: string,
  input: { razorpayOrderId: string },
): Promise<{ success: boolean; error?: string }> {
  const staff = await resolveCounterStaff(token);
  if (!staff) return { success: false, error: "Your session has ended. Please sign in again." };
  return abandonCounterRazorpaySale(staff.id, input.razorpayOrderId);
}
