"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Ticket, UserCheck } from "lucide-react";

import { createWalkinOrderAction } from "@/actions/orders";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/format";
import type { EventDetail } from "@/lib/types";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function WalkinCheckinForm({
  event,
  isHappeningNow,
}: {
  event: EventDetail;
  isHappeningNow: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [tierId, setTierId] = useState<string>("");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ ticketId: string; mode: string } | null>(null);

  const selectedTier = event.tiers.find((t) => t.id === tierId);

  function reset() {
    setName("");
    setPhone("");
    setEmail("");
    setTierId("");
    setCustomAmount("");
  }

  async function handleSubmit(mode: "WALKIN_PREEVENT" | "WALKIN_QR" | "WALKIN_INSTANT") {
    if (!name.trim() || !phone.trim()) {
      setError("Name and phone are required.");
      return;
    }
    if (!selectedTier && !customAmount) {
      setError("Select a tier or enter a custom amount.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("eventId", event.id);
    formData.set("buyerName", name.trim());
    formData.set("buyerPhone", phone.trim());
    formData.set("buyerEmail", email.trim());
    formData.set("mode", mode);
    if (selectedTier) {
      formData.set("tierId", selectedTier.id);
    } else {
      formData.set("amount", customAmount);
    }

    const result = await createWalkinOrderAction(formData);
    setSubmitting(false);

    if (result.error || !result.success) {
      setError(result.error ?? "Could not create walk-in order.");
      return;
    }

    setSuccess({ ticketId: result.ticketId ?? "", mode });
    reset();
  }

  if (success) {
    const showTicketLink = success.mode !== "WALKIN_INSTANT";
    return (
      <div className="glass rounded-3xl p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-500/10">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-green-500">Walk-in registered</p>
            <p className="text-xs text-muted">
              {success.mode === "WALKIN_INSTANT"
                ? "Auto checked-in. No QR ticket needed."
                : "QR ticket minted. Share the ticket with the attendee."}
            </p>
          </div>
        </div>
        {showTicketLink && success.ticketId ? (
          <a
            href={`/organizer/events/${event.id}/walkin-ticket/${success.ticketId}/print`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-neon-gradient px-4 py-2 text-sm font-bold text-white"
          >
            <Ticket className="h-4 w-4" />
            Download / Print ticket
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => setSuccess(null)}
          className="mt-3 block text-sm font-semibold text-violet-neon hover:underline"
        >
          Add another walk-in
        </button>
      </div>
    );
  }

  return (
    <div className="glass space-y-4 rounded-3xl p-5">
      <p className="text-sm text-muted">
        {isHappeningNow
          ? "Register a walk-in attendee at the counter. Choose to generate a QR ticket (for scanning) or instantly check them in."
          : "Register a walk-in attendee before the event. A QR ticket will be generated that you can download and share."}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Attendee name"
            className={INPUT}
            required
            disabled={submitting}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Phone *
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit phone number"
            className={INPUT}
            required
            disabled={submitting}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Email (optional)
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="attendee@email.com"
          className={INPUT}
          disabled={submitting}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            Ticket tier
          </label>
          <select
            value={tierId}
            onChange={(e) => {
              setTierId(e.target.value);
              setCustomAmount("");
            }}
            className={INPUT}
            disabled={submitting}
          >
            <option value="">Custom amount (no tier)</option>
            {event.tiers.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.name} — {tier.pricePaise === 0 ? "Free" : formatPaise(tier.pricePaise)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            Amount (₹) {selectedTier ? "(from tier)" : ""}
          </label>
          <input
            type="number"
            value={selectedTier ? (selectedTier.pricePaise / 100).toFixed(0) : customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="0"
            className={INPUT}
            disabled={submitting || !!selectedTier}
            min={0}
          />
        </div>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        {isHappeningNow ? (
          <>
            <Button
              type="button"
              onClick={() => handleSubmit("WALKIN_QR")}
              disabled={submitting}
              loading={submitting}
              loadingText="Generating QR ticket…"
            >
              <Ticket className="h-4 w-4" />
              Generate QR ticket
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleSubmit("WALKIN_INSTANT")}
              disabled={submitting}
              loading={submitting}
              loadingText="Checking in…"
            >
              <UserCheck className="h-4 w-4" />
              Instant check-in
            </Button>
          </>
        ) : (
          <Button
            type="button"
            onClick={() => handleSubmit("WALKIN_PREEVENT")}
            disabled={submitting}
            loading={submitting}
            loadingText="Registering…"
          >
            <Ticket className="h-4 w-4" />
            Register walk-in
          </Button>
        )}
      </div>

      {submitting ? (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3 w-3 animate-spin" />
          Processing…
        </p>
      ) : null}
    </div>
  );
}
