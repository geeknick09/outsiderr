"use client";

import { useState } from "react";
import { Loader2, ScanLine } from "lucide-react";

import { verifyScannerPinAction } from "@/actions/scanner-pins";

export interface ScannerEventOption {
  id: string;
  title: string;
  organizerName: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
}

export interface VerifiedScannerSession {
  eventId: string;
  eventTitle: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  organizerName: string;
  validCount: number;
  checkedInCount: number;
  staffName: string;
  pin: string;
}

export function PinLogin({
  events,
  onVerified,
}: {
  events: ScannerEventOption[];
  onVerified: (session: VerifiedScannerSession) => void;
}) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!eventId || !pin.trim()) {
      setError("Select an event and enter the PIN.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await verifyScannerPinAction(eventId, pin);
    setSubmitting(false);
    if (result.error || !result.success || !result.event) {
      setError(result.error ?? "Invalid PIN.");
      return;
    }
    onVerified({
      eventId: result.event.id,
      eventTitle: result.event.title,
      startsAt: result.event.startsAt,
      endsAt: result.event.endsAt,
      status: result.event.status,
      organizerName: result.event.organizerName,
      validCount: result.event.validCount,
      checkedInCount: result.event.checkedInCount,
      staffName: result.event.staffName,
      pin: pin.trim(),
    });
  }

  if (events.length === 0) {
    return (
      <div className="glass rounded-3xl p-8 text-center">
        <ScanLine className="mx-auto h-12 w-12 text-muted" />
        <p className="mt-4 text-sm text-muted">
          No published events available for scanning.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass space-y-4 rounded-3xl p-6">
      <div className="flex items-center gap-2">
        <ScanLine className="h-6 w-6 text-violet-neon" />
        <h1 className="text-2xl font-black tracking-tight">Door Scanner</h1>
      </div>
      <p className="text-sm text-muted">
        Select your event and enter the 6-digit PIN provided by the organizer.
      </p>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Event
        </label>
        <select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
          disabled={submitting}
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title} — {event.organizerName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          PIN
        </label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
          disabled={submitting}
          autoFocus
        />
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting || pin.length !== 6}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neon-gradient px-5 py-3 text-sm font-bold text-white shadow-glow-violet transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <ScanLine className="h-5 w-5" />
        )}
        Enter scanner
      </button>
    </form>
  );
}
