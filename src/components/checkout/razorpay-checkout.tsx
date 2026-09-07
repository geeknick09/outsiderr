"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CheckoutSession } from "@/lib/types";

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
   * Custom verify action. Defaults to the order verifyPaymentAction.
   * Hero Boost passes verifyHeroBoostPaymentAction here.
   */
  verifyAction?: VerifyAction;
  /**
   * Custom failure action. Defaults to the order handlePaymentFailureAction.
   * Hero Boost passes a hero-specific failure action here.
   */
  failureAction?: FailureAction;
  /**
   * Where to redirect on success. Defaults to /tickets?success=1.
   * Hero Boost redirects to /organizer?boost=success.
   */
  successRedirect?: string;
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
}: RazorpayCheckoutProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "verifying" | "done" | "error">("loading");
  const [message, setMessage] = useState<string>("");
  const openedRef = useRef(false);

  // Lazy-load the default order actions only if no custom action is provided.
  // This avoids importing order actions when Hero Boost provides its own.
  const getVerifyAction = useCallback(async (): Promise<VerifyAction> => {
    if (verifyAction) return verifyAction;
    const { verifyPaymentAction } = await import("@/actions/orders");
    return verifyPaymentAction;
  }, [verifyAction]);

  const getFailureAction = useCallback(async (): Promise<FailureAction> => {
    if (failureAction) return failureAction;
    const { handlePaymentFailureAction } = await import("@/actions/orders");
    return handlePaymentFailureAction;
  }, [failureAction]);

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
          } else {
            handleFailure(result.error ?? "Payment verification failed.");
          }
        } catch (err) {
          handleFailure(err instanceof Error ? err.message : "Payment verification failed.");
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

    // Handle payment failures within the modal
    rzp.on("payment.failed", (resp: unknown) => {
      const response = resp as { error?: { description?: string } };
      const reason = response?.error?.description ?? "Payment failed. Please try again.";
      handleFailure(reason);
    });

    rzp.open();
  }, [session, router, handleFailure, onCancel, getVerifyAction, successRedirect]);

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
      <p className="text-sm text-muted">Opening secure payment…</p>
    </div>
  );
}
