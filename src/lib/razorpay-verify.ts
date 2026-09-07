import "server-only";
import crypto from "node:crypto";

/**
 * Razorpay signature verification utilities.
 *
 * Two distinct verification flows:
 *  1. Webhook signature  — HMAC-SHA256 of the raw request body using RAZORPAY_WEBHOOK_SECRET
 *  2. Payment signature  — HMAC-SHA256 of `${order_id}|${payment_id}` using RAZORPAY_KEY_SECRET
 *
 * Both use `crypto.timingSafeEqual` to prevent timing attacks.
 */

/**
 * Verify the signature of an incoming Razorpay webhook.
 *
 * @param rawBody  The raw (unparsed) request body as a string.
 * @param signature The `X-Razorpay-Signature` header value.
 * @param secret    RAZORPAY_WEBHOOK_SECRET from the Razorpay dashboard.
 * @returns true if the signature is valid, false otherwise.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  if (!rawBody || !signature || !secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8"),
    );
  } catch {
    // timingSafeEqual throws if buffers differ in length — that's a failed signature
    return false;
  }
}

/**
 * Verify the signature returned by Razorpay Checkout after a successful payment.
 *
 * Razorpay signs `${razorpay_order_id}|${razorpay_payment_id}` with the KEY_SECRET.
 * The client receives `razorpay_signature` and we must verify it server-side before
 * confirming the order.
 *
 * @param orderId    Razorpay order id (rzp_order_xxx)
 * @param paymentId  Razorpay payment id (rzp_pay_xxx)
 * @param signature  `razorpay_signature` from the Checkout handler response
 * @param secret     RAZORPAY_KEY_SECRET
 * @returns true if the signature is valid, false otherwise.
 */
export function verifyRazorpayPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string,
): boolean {
  if (!orderId || !paymentId || !signature || !secret) return false;

  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8"),
    );
  } catch {
    return false;
  }
}
