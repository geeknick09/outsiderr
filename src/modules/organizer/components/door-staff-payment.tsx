"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Clock, Lock, ShieldCheck } from "lucide-react";

import {
  handleDoorStaffPaymentFailureAction,
  startDoorStaffCheckoutAction,
  verifyDoorStaffRazorpayAction,
} from "../actions/door-staff";
import { Button, RazorpayCheckout, formatPaise } from "@/modules/shared";
import type { CheckoutSession, DoorStaffOrder } from "@/modules/shared";

/**
 * Door staff payment — Razorpay online checkout (UPI/card/netbanking).
 * The capture dispatcher marks the order PAID + writes the ledger row.
 */
export function DoorStaffPaymentPanel({
  order,
}: {
  order: DoorStaffOrder;
  platformUpiId: string;
}) {
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (order.paymentStatus === "PAID") {
    return (
      <div className="glass rounded-3xl p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-500/10">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <p className="font-bold text-green-500">Door staff payment confirmed</p>
            <p className="text-xs text-muted">
              {order.numberOfStaff} staff • {formatPaise(order.serviceAmountPaise)} paid
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <RazorpayCheckout
        session={session}
        verifyAction={verifyDoorStaffRazorpayAction}
        failureAction={handleDoorStaffPaymentFailureAction}
        successRedirect="/organizer?door-staff=paid"
        onError={(msg) => {
          setSession(null);
          setError(msg);
        }}
        onCancel={() => setSession(null)}
      />
    );
  }

  return (
    <div className="glass space-y-4 rounded-3xl p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-neon/10">
          <ShieldCheck className="h-5 w-5 text-violet-neon" />
        </div>
        <div className="flex-1">
          <p className="font-bold">Door staff payment pending</p>
          <p className="text-xs text-muted">
            {order.numberOfStaff} staff • {formatPaise(order.serviceAmountPaise)}
          </p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        loading={pending}
        loadingText="Preparing payment…"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await startDoorStaffCheckoutAction(order.id);
            if (result.error) setError(result.error);
            else if (result.session) setSession(result.session);
          })
        }
      >
        <Lock className="mr-1.5 h-4 w-4" />
        Pay online — {formatPaise(order.serviceAmountPaise)}
      </Button>
      <p className="text-center text-xs text-muted">
        UPI, cards and netbanking via Razorpay — confirmed instantly.
      </p>
    </div>
  );
}