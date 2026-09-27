"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getPaymentStatusAction } from "@/modules/web/actions/orders";
import { createClient } from "@/modules/shared";

const POLL_MS = 3_000;
const TIMEOUT_MS = 120_000;

type Phase = "polling" | "failed" | "expired" | "pending";

/**
 * Watches an order after checkout: Realtime on the order row + a 3s poll
 * (whichever lands first — the webhook, the client verify, or the cron
 * reconcile can flip it). After 2 minutes of silence we show "processing",
 * never a false failure — the webhook still settles it in the background.
 */
export function PaymentStatusPoller({
  orderId,
  eventId,
}: {
  orderId: string;
  eventId: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("polling");
  const doneRef = useRef(false);

  const handleStatus = useCallback(
    (status: string | null | undefined) => {
      if (doneRef.current || !status) return;
      if (status === "CONFIRMED") {
        doneRef.current = true;
        router.push("/tickets?success=1");
      } else if (status === "FAILED" || status === "REJECTED") {
        doneRef.current = true;
        setPhase("failed");
      } else if (status === "EXPIRED" || status === "CANCELLED") {
        doneRef.current = true;
        setPhase("expired");
      } else if (status === "REFUND_REQUESTED") {
        // Late-capture path — the dispatcher auto-queued a refund.
        doneRef.current = true;
        setPhase("pending");
      }
    },
    [router],
  );

  // Poll every 3s for 2 minutes
  useEffect(() => {
    const started = Date.now();
    const tick = async () => {
      if (doneRef.current) return;
      try {
        const result = await getPaymentStatusAction({ orderId });
        if (result) handleStatus(result.refStatus ?? result.status);
      } catch {
        // transient — keep polling
      }
      if (!doneRef.current && Date.now() - started >= TIMEOUT_MS) {
        doneRef.current = true;
        setPhase("pending");
      }
    };
    const interval = setInterval(tick, POLL_MS);
    void tick();
    return () => clearInterval(interval);
  }, [orderId, handleStatus]);

  // Realtime on the order row — the webhook's confirm flips it instantly
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`order-status-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        (payload) => {
          handleStatus((payload.new as { status?: string }).status);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, handleStatus]);

  if (phase === "failed") {
    return (
      <div className="glass rounded-3xl p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-lg font-black">Payment failed</h2>
        <p className="mt-2 text-sm text-muted">
          The payment didn&apos;t go through and no seats were held. You can try again —
          you&apos;ll never be charged twice for the same booking.
        </p>
        {eventId ? (
          <Link
            href={`/events/${eventId}`}
            className="mt-5 inline-block rounded-2xl bg-violet-neon px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            Try again
          </Link>
        ) : null}
      </div>
    );
  }

  if (phase === "expired") {
    return (
      <div className="glass rounded-3xl p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-black">Reservation expired</h2>
        <p className="mt-2 text-sm text-muted">
          The payment window closed and your hold was released. If money was
          debited, an automatic refund is on its way.
        </p>
        {eventId ? (
          <Link
            href={`/events/${eventId}`}
            className="mt-5 inline-block rounded-2xl bg-violet-neon px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            Book again
          </Link>
        ) : null}
      </div>
    );
  }

  if (phase === "pending") {
    return (
      <div className="glass rounded-3xl p-8 text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-violet-300 border-t-violet-600" />
        <h2 className="text-lg font-black">We&apos;re confirming your payment</h2>
        <p className="mt-2 text-sm text-muted">
          This can take a moment. Don&apos;t pay again — check your tickets in a
          few minutes; the booking completes automatically once the gateway
          confirms.
        </p>
        <Link
          href="/tickets"
          className="mt-5 inline-block rounded-2xl bg-violet-neon px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          View my tickets
        </Link>
      </div>
    );
  }

  return (
    <div className="glass rounded-3xl p-8 text-center">
      <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-violet-300 border-t-violet-600" />
      <h2 className="text-lg font-black">Confirming payment…</h2>
      <p className="mt-2 text-sm text-muted">Almost there — hang on.</p>
    </div>
  );
}