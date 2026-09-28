"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckoutSession } from "../../lib/types";

// Augment the Window object with the Razorpay constructor.
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  notes?: Record<string, string>;
  /** Seconds before the gateway checkout itself expires. */
  timeout?: number;
  retry?: { enabled: boolean; max_count?: number };
  handler: (response: RazorpayResponse) => void;
  modal: {
    ondismiss: () => void;
    escape?: boolean;
    backdropclose?: boolean;
  };
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: unknown) => void) => void;
}

/**
 * Verify action type — both order and hero boost verify actions conform to this.
 */
type VerifyAction = (input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) => Promise<{ success: boolean; error?: string }>;

/**
 * Failure action type — releases the reservation/boost.
 */
type FailureAction = (input: { razorpayOrderId: string }) => Promise<{ success: boolean; error?: string }>;

interface RazorpayCheckoutProps {
  session: CheckoutSession;
  onError?: (message: string) => void;
  onCancel?: () => void;
  /**
   * Verify action — server action that confirms the Razorpay payment.
   * Hero Boost passes verifyHeroBoostPaymentAction; orders pass verifyPaymentAction.
   * (Required: injected by the caller so this shared component stays domain-agnostic.)
   */
  verifyAction: VerifyAction;
  /**
   * Failure action — releases the reservation/boost on payment failure/dismiss.
   */
  failureAction: FailureAction;
  /**
   * Where to redirect on success. Defaults to /tickets?success=1.
   * Hero Boost redirects to /organizer?boost=success.
   */
  successRedirect?: string;
  /**
   * Where to send ticket-order checkouts when client-side verify races the
   * webhook (e.g. /checkout/status?order=…&event=…). Non-order payables omit
   * this and get a "received, confirming" message instead — never an error.
   */
  statusRedirect?: string;
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const THEME_COLOR = "#8b5cf6"; // violet-neon

/**
 * Loads the Razorpay Checkout.js script once and caches the promise.
 */
let scriptPromise: Promise<void> | null = null;
function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay Checkout. Check your internet connection."));
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export function RazorpayCheckout({
  session,
  onError,
  onCancel,
  verifyAction,
  failureAction,
  successRedirect,
  statusRedirect,
}: RazorpayCheckoutProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "verifying" | "done" | "error">("loading");
  const [message, setMessage] = useState<string>("");
  const openedRef = useRef(false);

  // Verify/failure actions are injected by the caller (see props) — this shared
  // component stays domain-agnostic and never imports order/boost actions.
  const getVerifyAction = useCallback(async (): Promise<VerifyAction> => verifyAction, [verifyAction]);
  const getFailureAction = useCallback(async (): Promise<FailureAction> => failureAction, [failureAction]);

  const handleFailure = useCallback(
    async (reason: string) => {
      setStatus("error");
      setMessage(reason);
      try {
        const fail = await getFailureAction();
        await fail({ razorpayOrderId: session.razorpayOrderId });
      } catch {
        // best-effort — cron will also expire the reservation
      }
      onError?.(reason);
    },
    [session.razorpayOrderId, onError, getFailureAction],
  );

  const openCheckout = useCallback(async () => {
    if (openedRef.current) return;
    openedRef.current = true;

    try {
      await loadRazorpayScript();
    } catch (err) {
      handleFailure(err instanceof Error ? err.message : "Could not load payment gateway.");
      return;
    }

    if (!window.Razorpay) {
      handleFailure("Razorpay Checkout failed to initialize.");
      return;
    }

    setStatus("idle");

    // Cap the gateway checkout at the reservation expiry — retries can't
    // outlive the inventory hold (a late capture lands in the auto-refund
    // path instead of silently double-holding seats).
    const secondsLeft = session.expiresAt
      ? Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000))
      : 0;
    const timeoutSeconds = secondsLeft > 0 ? Math.min(secondsLeft, 900) : 900;
    const retryEnabled = secondsLeft > 120; // disable retry when nearly expired

    const options: RazorpayOptions = {
      key: session.keyId,
      amount: session.amountPaise,
      currency: session.currency,
      order_id: session.razorpayOrderId,
      name: "Outsiderr",
      description: `${session.eventTitle} — ${session.tierName} × ${session.quantity}`,
      prefill: {
        name: session.buyerName ?? "",
        email: session.buyerEmail ?? "",
        contact: session.buyerPhone ?? "",
      },
      theme: { color: THEME_COLOR },
      notes: {
        order_id: session.orderId,
        ...(session.intentId ? { payment_intent_id: session.intentId } : {}),
        event_title: session.eventTitle,
        tier_name: session.tierName,
      },
      timeout: timeoutSeconds,
      retry: { enabled: retryEnabled, max_count: 3 },
      handler: async (response) => {
        setStatus("verifying");
        setMessage("Verifying payment…");
        try {
          const verify = await getVerifyAction();
          const result = await verify({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          if (result.success) {
            setStatus("done");
            setMessage("Payment successful! Redirecting…");
            router.push(successRedirect ?? "/tickets?success=1");
          } else if (statusRedirect) {
            // Verify raced the webhook — never fail the reservation here.
            // The status page polls + Realtime-subscribes and settles correctly.
            router.push(statusRedirect);
          } else {
            // Non-order payable — money may still confirm via webhook; show a
            // "received, confirming" state rather than releasing the payable.
            setStatus("verifying");
            setMessage("Payment received — confirming. It'll reflect shortly.");
          }
        } catch {
          if (statusRedirect) {
            router.push(statusRedirect);
          } else {
            setStatus("verifying");
            setMessage("Payment received — confirming. It'll reflect shortly.");
          }
        }
      },
      modal: {
        ondismiss: () => {
          // User closed the modal without paying — release the reservation
          handleFailure("Payment cancelled. Your reservation has been released.");
          onCancel?.();
        },
        escape: true,
        backdropclose: false,
      },
    };

    const rzp = new window.Razorpay(options);

    // payment.failed fires PER ATTEMPT — with retry enabled the modal stays
    // open so the user can pick another method. Only show a soft warning;
    // killing the reservation here turned successful retries into phantom
    // late-capture refunds. The reservation is released on dismiss or by TTL.
    rzp.on("payment.failed", () => {
      setStatus("idle");
      setMessage(
        "That attempt didn't go through — pick another payment method in the popup, or close it to cancel.",
      );
    });

    rzp.open();
  }, [session, router, handleFailure, onCancel, getVerifyAction, successRedirect, statusRedirect]);

  // Auto-open on mount
  useEffect(() => {
    void openCheckout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="font-semibold text-emerald-900">{message}</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="font-semibold text-red-900">{message}</p>
        <button
          onClick={() => router.push("/checkout")}
          className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
        >
          Back to checkout
        </button>
      </div>
    );
  }

  if (status === "verifying") {
    return (
      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-6 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-violet-300 border-t-violet-600" />
        <p className="font-semibold text-violet-900">{message}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center">
      <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-violet-600" />
      <p className="text-sm text-muted">
        {message || "Opening secure payment…"}
      </p>
      <p className="mt-2 text-xs font-semibold text-amber-600">
        Please don&apos;t press the back button or refresh the page while paying.
      </p>
    </div>
  );
}
