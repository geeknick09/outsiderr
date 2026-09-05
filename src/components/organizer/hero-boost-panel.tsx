"use client";

import { useActionState, useState } from "react";
import { Rocket, CheckCircle2, Clock, XCircle } from "lucide-react";

import {
  purchaseHeroBoostAction,
  submitHeroBoostUtrAction,
} from "@/actions/hero-boosts";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { HeroBoost } from "@/lib/types";

export function HeroBoostPanel({
  eventId,
  boost,
  pricePaise,
  durationDays,
  eventStartsAt,
  platformUpiId,
}: {
  eventId: string;
  boost: HeroBoost | null;
  pricePaise: number;
  durationDays: number;
  eventStartsAt: string;
  platformUpiId: string;
}) {
  const [utr, setUtr] = useState("");
  const [purchaseState, purchaseAction, purchasePending] = useActionState(
    async (_prev: { error?: string; boostId?: string } | null, formData: FormData) => {
      const id = String(formData.get("eventId") ?? "");
      return purchaseHeroBoostAction(id);
    },
    null,
  );
  const [utrState, utrAction, utrPending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const boostId = String(formData.get("boostId") ?? "");
      const utrRef = String(formData.get("utr") ?? "");
      return submitHeroBoostUtrAction(boostId, utrRef);
    },
    null,
  );

  const eventStarted = new Date(eventStartsAt).getTime() <= Date.now();
  const priceRupees = Math.round(pricePaise / 100);

  // Active boost — show status
  if (boost && boost.status === "ACTIVE") {
    return (
      <section className="glass space-y-4 rounded-3xl p-5">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-violet-neon" />
          <h2 className="text-lg font-bold">Hero Boost — Active</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusRow label="Status" value="Active" icon={<CheckCircle2 className="h-4 w-4 text-lime-neon" />} />
          <StatusRow label="Amount paid" value={`₹${priceRupees}`} />
          <StatusRow label="Started" value={boost.startedAt ? formatDateTime(boost.startedAt) : "—"} />
          <StatusRow label="Expires" value={boost.expiresAt ? formatDateTime(boost.expiresAt) : "—"} />
        </div>
        <p className="text-xs text-muted">
          Your event is featured in the Hero section and rotates with other featured events.
        </p>
      </section>
    );
  }

  // Pending boost — show UTR submission
  if (boost && boost.status === "PENDING") {
    return (
      <section className="glass space-y-4 rounded-3xl p-5">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-bold">Hero Boost — Payment Pending</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusRow label="Amount" value={`₹${priceRupees}`} />
          <StatusRow label="Status" value="Awaiting payment verification" />
        </div>

        {/* UPI QR + instructions */}
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
          <p className="text-sm font-semibold">Pay ₹{priceRupees} via UPI</p>
          <p className="mt-1 text-xs text-muted">
            Scan the QR or send to UPI ID: <span className="font-mono font-bold">{platformUpiId}</span>
          </p>
          <div className="mt-3 flex flex-col items-center gap-2">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=${encodeURIComponent(platformUpiId)}&pn=Outsiderr&am=${priceRupees}&cu=INR`}
              alt="UPI QR Code"
              width={180}
              height={180}
              className="rounded-xl"
            />
          </div>
        </div>

        {/* UTR submission */}
        <form action={utrAction} className="space-y-3">
          <input type="hidden" name="boostId" value={boost.id} />
          <label className="block">
            <span className="text-sm font-semibold">Enter UTR / Transaction Reference</span>
            <input
              name="utr"
              type="text"
              required
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="e.g. 456789012345"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-transparent px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-neon dark:border-white/10"
            />
          </label>
          {utrState?.error ? (
            <p className="text-sm text-red-500">{utrState.error}</p>
          ) : utrState && !utrState.error ? (
            <p className="text-sm text-lime-neon">
              ✓ UTR submitted! Your boost will be activated after payment verification.
            </p>
          ) : null}
          <Button type="submit" size="sm" loading={utrPending} loadingText="Submitting…">
            Submit UTR
          </Button>
        </form>
      </section>
    );
  }

  // Cancelled/expired boost
  if (boost && (boost.status === "CANCELLED" || boost.status === "EXPIRED" || boost.status === "REFUNDED")) {
    return (
      <section className="glass space-y-3 rounded-3xl p-5">
        <div className="flex items-center gap-2">
          <XCircle className="h-5 w-5 text-red-500" />
          <h2 className="text-lg font-bold">Hero Boost — {boost.status.charAt(0) + boost.status.slice(1).toLowerCase()}</h2>
        </div>
        <p className="text-sm text-muted">
          This boost is no longer active. You can purchase a new one below if the event hasn&apos;t started.
        </p>
      </section>
    );
  }

  // No boost — show purchase option
  if (eventStarted) {
    return (
      <section className="glass space-y-2 rounded-3xl p-5 opacity-60">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-muted" />
          <h2 className="text-lg font-bold">Hero Boost</h2>
        </div>
        <p className="text-sm text-muted">
          Hero Boost is not available for events that have already started.
        </p>
      </section>
    );
  }

  return (
    <section className="glass space-y-4 rounded-3xl p-5">
      <div className="flex items-center gap-2">
        <Rocket className="h-5 w-5 text-violet-neon" />
        <h2 className="text-lg font-bold">Feature on Outsiderr</h2>
      </div>
      <p className="text-sm text-muted">
        Get your event featured in the Hero section on the homepage. Your event will appear in the Hero section and rotate with other featured events.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
          <p className="text-xs text-muted">Duration</p>
          <p className="text-sm font-bold">{durationDays} days or until event starts</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
          <p className="text-xs text-muted">Price</p>
          <p className="text-sm font-bold">₹{priceRupees}</p>
        </div>
      </div>
      <form action={purchaseAction}>
        <input type="hidden" name="eventId" value={eventId} />
        {purchaseState?.error ? (
          <p className="mb-2 text-sm text-red-500">{purchaseState.error}</p>
        ) : null}
        {purchaseState?.boostId ? (
          <p className="mb-2 text-sm text-lime-neon">
            ✓ Boost order created! Submit your UTR below to complete payment.
          </p>
        ) : null}
        <Button type="submit" size="sm" loading={purchasePending} loadingText="Creating…">
          <Rocket className="h-4 w-4" />
          Feature My Event
        </Button>
      </form>
    </section>
  );
}

function StatusRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-zinc-200 px-3 py-2 dark:border-white/10">
      <span className="text-xs text-muted">{label}</span>
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {value}
      </span>
    </div>
  );
}
