import "server-only";
import Razorpay from "razorpay";

/**
 * Server-side Razorpay client.
 *
 * Uses RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET from the environment.
 * These secrets MUST NEVER be exposed to the browser bundle.
 *
 * In test mode, keys start with `rzp_test_`. In production, `rzp_live_`.
 */
function createRazorpayClient(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay keys are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env",
    );
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

/**
 * Lazily-initialized Razorpay client. Throws only when accessed without keys,
 * so pages that don't use Razorpay (e.g. free events) still build & run.
 */
let _client: Razorpay | null = null;
export function getRazorpay(): Razorpay {
  if (!_client) _client = createRazorpayClient();
  return _client;
}

/**
 * Whether Razorpay is configured. Used by pages to decide whether to show
 * the Razorpay checkout or fall back to a "payments not configured" notice.
 */
export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/**
 * Public key id safe to send to the browser for Checkout.js.
 * Falls back to the server key id (test mode) if the public var is not set.
 */
export function getPublicKeyId(): string {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? "";
}
