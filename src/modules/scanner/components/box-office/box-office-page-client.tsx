"use client";

import { useState } from "react";
import { Loader2, Ticket, UserCheck } from "lucide-react";

import { verifyBoxOfficePinAction, createBoxOfficeOrderAction } from "@/modules/scanner/actions/box-office";
import { formatPaise } from "@/modules/shared";

export interface BoxOfficeEventOption {
  id: string;
  title: string;
  organizerName: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
}

export interface BoxOfficeTier {
  id: string;
  name: string;
  pricePaise: number;
}

export interface VerifiedBoxOfficeSession {
  eventId: string;
  eventTitle: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  organizerName: string;
  staffName: string;
  role: string;
  pin: string;
}

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function BoxOfficePageClient({
  events,
  tiers,
}: {
  events: BoxOfficeEventOption[];
  tiers: Record<string, BoxOfficeTier[]>;
}) {
  const [session, setSession] = useState<VerifiedBoxOfficeSession | null>(null);

  if (!session) {
    return <BoxOfficePinLogin events={events} onVerified={setSession} />;
  }

  const eventTiers = tiers[session.eventId] ?? [];
  return (
    <BoxOfficeForm session={session} tiers={eventTiers} onExit={() => setSession(null)} />
  );
}

function BoxOfficePinLogin({
  events,
  onVerified,
}: {
  events: BoxOfficeEventOption[];
  onVerified: (session: VerifiedBoxOfficeSession) => void;
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
    const result = await verifyBoxOfficePinAction(eventId, pin);
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
      staffName: result.event.staffName,
      role: result.event.role,
      pin: pin.trim(),
    });
  }

  if (events.length === 0) {
    return (
      <div className="glass rounded-3xl p-8 text-center">
        <Ticket className="mx-auto h-12 w-12 text-muted" />
        <p className="mt-4 text-sm text-muted">No published events available.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass space-y-4 rounded-3xl p-6">
      <div className="flex items-center gap-2">
        <Ticket className="h-6 w-6 text-violet-neon" />
        <h1 className="text-2xl font-black tracking-tight">Box Office</h1>
      </div>
      <p className="text-sm text-muted">
        Select your event and enter the 6-digit PIN provided by the organizer.
      </p>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Event</label>
        <select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className={INPUT}
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
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">PIN</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          className={`${INPUT} text-center font-mono text-2xl tracking-[0.5em]`}
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
        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Ticket className="h-5 w-5" />}
        Enter box office
      </button>
    </form>
  );
}

function BoxOfficeForm({
  session,
  tiers,
  onExit,
}: {
  session: VerifiedBoxOfficeSession;
  tiers: BoxOfficeTier[];
  onExit: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [tierId, setTierId] = useState<string>("");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ ticketId: string; mode: string } | null>(null);

  const selectedTier = tiers.find((t) => t.id === tierId);

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
    formData.set("eventId", session.eventId);
    formData.set("pin", session.pin);
    formData.set("buyerName", name.trim());
    formData.set("buyerPhone", phone.trim());
    formData.set("buyerEmail", email.trim());
    formData.set("mode", mode);
    if (selectedTier) {
      formData.set("tierId", selectedTier.id);
    } else {
      formData.set("amount", customAmount);
    }

    const result = await createBoxOfficeOrderAction(formData);
    setSubmitting(false);

    if (result.error || !result.success) {
      setError(result.error ?? "Could not create ticket.");
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
            <UserCheck className="h-5 w-5 text-green-500" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-green-500">Ticket generated</p>
            <p className="text-xs text-muted">
              {success.mode === "WALKIN_INSTANT"
                ? "Auto checked-in. No QR ticket needed."
                : "QR ticket minted. Download and share with the attendee."}
            </p>
          </div>
        </div>
        {showTicketLink && success.ticketId ? (
          <a
            href={`/box-office/ticket/${success.ticketId}/print`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-neon-gradient px-4 py-2 text-sm font-bold text-white"
          >
            <Ticket className="h-4 w-4" />
            Download / Print ticket
          </a>
        ) : null}
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            onClick={() => setSuccess(null)}
            className="text-sm font-semibold text-violet-neon hover:underline"
          >
            Add another
          </button>
          <button
            type="button"
            onClick={onExit}
            className="text-sm font-semibold text-muted hover:text-red-500"
          >
            Exit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Staff info + exit */}
      <div className="glass flex items-center justify-between rounded-2xl p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-neon/10">
            <span className="text-sm font-bold text-violet-neon">{session.staffName.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <p className="text-sm font-semibold">{session.staffName}</p>
            <p className="text-[10px] text-muted">
              {session.eventTitle} · {session.role === "ADMIN" ? "Team Outsiderr" : "Box Office"}
            </p>
          </div>
        </div>
        <button type="button" onClick={onExit} className="text-xs font-semibold text-muted hover:text-red-500">
          Exit
        </button>
      </div>

      <div className="glass space-y-4 rounded-3xl p-5">
        <p className="text-sm text-muted">
          Register an attendee and generate a ticket. Choose to generate a QR ticket (for scanning) or instantly check them in.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Attendee name" className={INPUT} required disabled={submitting} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Phone *</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit phone" className={INPUT} required disabled={submitting} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Email (optional)</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="attendee@email.com" className={INPUT} disabled={submitting} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Ticket tier</label>
            <select
              value={tierId}
              onChange={(e) => { setTierId(e.target.value); setCustomAmount(""); }}
              className={INPUT}
              disabled={submitting}
            >
              <option value="">Custom amount (no tier)</option>
              {tiers.map((tier) => (
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
          <button
            type="button"
            onClick={() => handleSubmit("WALKIN_QR")}
            disabled={submitting}
            className="flex items-center gap-2 rounded-2xl bg-neon-gradient px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
            Generate QR ticket
          </button>
          <button
            type="button"
            onClick={() => handleSubmit("WALKIN_INSTANT")}
            disabled={submitting}
            className="flex items-center gap-2 rounded-2xl border border-zinc-200 px-5 py-2.5 text-sm font-bold dark:border-white/10 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
            Instant check-in
          </button>
        </div>

        {submitting ? <p className="flex items-center gap-2 text-xs text-muted"><Loader2 className="h-3 w-3 animate-spin" />Processing…</p> : null}
      </div>
    </div>
  );
}
