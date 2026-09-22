/**
 * Portable API client for Outsiderr's /api/v1 surface.
 *
 * Pure TypeScript — zero next/* imports, no Node APIs — so it can be lifted
 * verbatim into a future `packages/api-client` and shared by the web and the
 * React Native apps (Expo/fetch-compatible).
 *
 * Usage:
 *   const api = createOutsiderrClient({
 *     baseUrl: "https://outsiderr.in",          // or "/api" for same-origin web
 *     getAccessToken: () => supabase.auth.getSession().then(s => s.data.session?.access_token),
 *   });
 *   const { data, error } = await api.checkout({ eventId, tierId, quantity: 1 });
 *
 * Response convention mirrors the server: { ok, data } | { ok, error } — this
 * client unwraps it to { data } | { error }.
 */

export interface ApiResult<T> {
  data?: T;
  error?: string;
  status: number;
}

import type { CheckoutSession } from "../lib/types";
export type { CheckoutSession };

export interface ApiClientOptions {
  /** e.g. "https://outsiderr.in" — paths are appended as `${baseUrl}/api/v1/...`. */
  baseUrl: string;
  /** Resolves the Supabase access token for Bearer-authed routes. Omit for PIN-auth calls. */
  getAccessToken?: () => Promise<string | null> | string | null;
}

export interface CheckoutSessionPayload {
  eventId: string;
  tierId: string;
  quantity: number;
  buyerName?: string | null;
  buyerPhone?: string | null;
  buyerEmail?: string | null;
  buyerGender?: string | null;
}

export interface ScannerEventInfo {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  organizerName: string;
  validCount: number;
  checkedInCount: number;
  staffName: string;
}

export interface ScanResultPayload {
  outcome: string;
  message: string;
  ticket?: {
    holderName?: string | null;
    tierName?: string | null;
    checkedInAt?: string | null;
  } | null;
}

async function call<T>(
  opts: ApiClientOptions,
  path: string,
  init: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.auth !== false && opts.getAccessToken) {
    const token = await opts.getAccessToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl}/api/v1${path}`, {
      method: init.method ?? "POST",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { error: "Network error — check your connection.", status: 0 };
  }
  let json: { ok?: boolean; data?: T; error?: string } = {};
  try {
    json = await res.json();
  } catch {
    // non-JSON body
  }
  if (!res.ok || json.ok === false) {
    return { error: json.error ?? `Request failed (${res.status})`, status: res.status };
  }
  return { data: json.data as T, status: res.status };
}

export function createOutsiderrClient(opts: ApiClientOptions) {
  return {
    /** Bearer auth sanity check — returns the current user. */
    me: () => call<{ user: unknown }>(opts, "/me", { method: "GET" }),

    // ---- payments / booking ----
    checkout: (body: CheckoutSessionPayload) =>
      call<{ session: CheckoutSession }>(opts, "/checkout", { body }),
    verifyPayment: (body: {
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
      paymentMethod?: string | null;
    }) => call<{ orderId: string }>(opts, "/payments/verify", { body }),
    paymentFailure: (razorpayOrderId: string) =>
      call<{ released: boolean }>(opts, "/payments/failure", { body: { razorpayOrderId } }),
    manualOrder: (body: CheckoutSessionPayload & { isFree: boolean; utrReference?: string | null }) =>
      call<{ submitted: boolean }>(opts, "/orders/manual", { body }),
    requestPostponementRefund: (eventId: string) =>
      call<{ refunded: boolean }>(opts, "/refunds/postponement", { body: { eventId } }),

    // ---- engagement ----
    subscribeToEvent: (eventId: string) =>
      call<{ subscribed: boolean }>(opts, `/events/${eventId}/subscribe`, {}),
    unsubscribeFromEvent: (eventId: string) =>
      call<{ subscribed: boolean }>(opts, `/events/${eventId}/subscribe`, { method: "DELETE" }),
    followOrganizer: (organizerId: string) =>
      call<{ following: boolean }>(opts, `/organizers/${organizerId}/follow`, {}),
    unfollowOrganizer: (organizerId: string) =>
      call<{ following: boolean }>(opts, `/organizers/${organizerId}/follow`, { method: "DELETE" }),
    submitReview: (body: { eventId: string; rating: number; reviewText?: string | null }) =>
      call<{ reviewed: boolean }>(opts, "/reviews", { body }),
    updateProfile: (body: Record<string, unknown>) =>
      call<{ updated: boolean }>(opts, "/profile", { method: "PATCH", body }),
    markNotificationsRead: (body: { notificationId?: string; all?: boolean }) =>
      call<{ read: boolean }>(opts, "/notifications/read", { body }),

    // ---- clubs / collab ----
    createClub: (body: Record<string, unknown>) => call<{ clubId: string }>(opts, "/clubs", { body }),
    joinClub: (clubId: string, body: { instagramLink?: string; utrReference?: string } = {}) =>
      call<{ joined: boolean }>(opts, `/clubs/${clubId}/join`, { body }),
    inviteCollaborator: (body: {
      eventId: string;
      organizerId: string;
      permissionLevel?: "VIEW_ONLY" | "ANALYTICS" | "SCAN" | "FULL";
    }) => call<{ invited: boolean }>(opts, "/collab/invite", { body }),
    respondToCollab: (body: { eventId: string; collaboratorId: string; accept: boolean }) =>
      call<{ accepted: boolean }>(opts, "/collab/respond", { body }),

    // ---- organizer ----
    createEvent: (body: Record<string, unknown>) =>
      call<{ eventId: string }>(opts, "/events", { body }),
    updateEvent: (eventId: string, body: Record<string, unknown>) =>
      call<{ eventId: string }>(opts, `/events/${eventId}`, { method: "PATCH", body }),
    publishEvent: (eventId: string) =>
      call<{ published: boolean }>(opts, `/events/${eventId}/publish`, {}),
    cancelEvent: (eventId: string, body: { reason: string; cancellationChargePercent?: number }) =>
      call<unknown>(opts, `/events/${eventId}/cancel`, { body }),
    postponeEvent: (eventId: string, body: { startsAt: string; endsAt?: string | null; reason: string }) =>
      call<unknown>(opts, `/events/${eventId}/postpone`, { body }),
    approveOrder: (orderId: string) =>
      call<{ approved: boolean }>(opts, `/orders/${orderId}/approve`, {}),
    rejectOrder: (orderId: string, reason = "") =>
      call<{ rejected: boolean }>(opts, `/orders/${orderId}/reject`, { body: { reason } }),
    generatePins: (body: {
      eventId: string;
      type: "scanner" | "box-office";
      staffNames: string[];
      staffEmails?: string[];
      staffPhones?: string[];
      role?: string;
    }) => call<{ pins: { pinCode: string; staffName: string }[] }>(opts, "/pins", { body }),
    revokePin: (pinId: string, body: { eventId: string; type: "scanner" | "box-office" }) =>
      call<{ revoked: boolean }>(opts, `/pins/${pinId}`, { method: "DELETE", body }),
    addEventStaff: (body: { eventId: string; email?: string; phone?: string; displayName: string }) =>
      call<{ added: boolean }>(opts, "/event-staff", { body }),
    removeEventStaff: (body: { eventId: string; staffId: string }) =>
      call<{ removed: boolean }>(opts, "/event-staff", { method: "DELETE", body }),
    requestBoost: (body: {
      eventId: string;
      slot: number;
      amountPaidPaise: number;
      startsAt: string;
      endsAt: string;
      utrReference: string;
    }) => call<{ boost: unknown }>(opts, "/boosts", { body }),
    createOrganizer: (body: Record<string, unknown>) =>
      call<{ organizerId: string }>(opts, "/organizer", { body }),
    updateOrganizer: (body: Record<string, unknown>) =>
      call<{ updated: boolean }>(opts, "/organizer", { method: "PATCH", body }),

    // ---- scanner / box office (PIN-auth — no Bearer needed) ----
    scannerLogin: (eventId: string, pin: string) =>
      call<{ event: ScannerEventInfo }>(opts, "/scanner/login", { body: { eventId, pin }, auth: false }),
    scanCheckIn: (qrHash: string, eventId: string, pin: string) =>
      call<ScanResultPayload>(opts, "/scanner/check-in", { body: { qrHash, eventId, pin }, auth: false }),
    scannerWalkin: (body: {
      eventId: string;
      pin: string;
      tierId?: string | null;
      buyerName: string;
      buyerPhone?: string | null;
      buyerEmail?: string | null;
      amountPaise?: number;
      mode?: "WALKIN_PREEVENT" | "WALKIN_QR" | "WALKIN_INSTANT";
      idempotencyKey?: string;
    }) => call<{ ticketId?: string; orderId?: string }>(opts, "/scanner/walkin", { body, auth: false }),
    boxOfficeLogin: (eventId: string, pin: string) =>
      call<{ event: ScannerEventInfo & { role?: string } }>(opts, "/box-office/login", { body: { eventId, pin }, auth: false }),
    boxOfficeOrder: (body: {
      eventId: string;
      pin: string;
      tierId?: string | null;
      buyerName: string;
      buyerPhone?: string | null;
      buyerEmail?: string | null;
      amountPaise?: number;
      mode?: "WALKIN_PREEVENT" | "WALKIN_QR" | "WALKIN_INSTANT";
      idempotencyKey?: string;
    }) => call<{ ticketId?: string; orderId?: string }>(opts, "/box-office/orders", { body, auth: false }),
  };
}

export type OutsiderrClient = ReturnType<typeof createOutsiderrClient>;
