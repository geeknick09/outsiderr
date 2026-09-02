"use client";

import { useState } from "react";
import { AlertTriangle, CalendarClock, X } from "lucide-react";

import { cancelEventAction, postponeEventAction } from "@/actions/events";
import { Button } from "@/components/ui/button";
import type { EventDetail } from "@/lib/types";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

function toDatetimeLocal(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

export function CancelPostponeButtons({
  event,
  cancellationChargePercent = 20,
  postponementChargePercent = 10,
}: {
  event: EventDetail;
  cancellationChargePercent?: number;
  postponementChargePercent?: number;
}) {
  const [showCancel, setShowCancel] = useState(false);
  const [showPostpone, setShowPostpone] = useState(false);
  const [newStartsAt, setNewStartsAt] = useState(toDatetimeLocal(event.startsAt));
  const [newEndsAt, setNewEndsAt] = useState(event.endsAt ? toDatetimeLocal(event.endsAt) : "");
  const [postponeError, setPostponeError] = useState<string | null>(null);

  function validatePostponeDates(start: string, end: string) {
    const now = new Date();
    const startDt = new Date(start);
    if (start && startDt <= now) {
      setPostponeError("New start date must be in the future.");
      return;
    }
    if (end && start && new Date(end) <= startDt) {
      setPostponeError("New end date must be after the new start date.");
      return;
    }
    setPostponeError(null);
  }

  if (event.status === "CANCELLED" || event.status === "CANCELLATION_REQUESTED") {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm">
        <p className="font-bold text-red-500">Event cancelled</p>
        <p className="mt-1 text-muted">
          Ticket sales stopped. All ticket holders have been notified and refund records created.
        </p>
      </div>
    );
  }

  const isFree = event.pricingMode === "FREE" || event.minPricePaise === 0;

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowPostpone(true)}
        >
          <CalendarClock className="h-4 w-4" />
          Postpone event
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={() => setShowCancel(true)}
        >
          <AlertTriangle className="h-4 w-4" />
          Cancel event
        </Button>
      </div>

      {/* Cancel modal */}
      {showCancel ? (
        <Modal onClose={() => setShowCancel(false)} title="Cancel event">
          <div className="space-y-4">
            <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              {isFree ? (
                <p>
                  This is a <strong>free event</strong>. Cancelling will notify all
                  {event.registrationsCount > 0 ? ` ${event.registrationsCount}` : ""} registered
                  attendees. No cancellation charges apply.
                </p>
              ) : (
                <>
                  <p className="font-bold">Cancellation charges apply</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    <li>You must refund all ticket buyers the full ticket amount.</li>
                    <li>
                      The <strong>platform fee (5%)</strong> on all confirmed orders is
                      non-refundable to you — you must pay the total platform fee.
                    </li>
                    <li>
                      <strong>Cancellation charge: {cancellationChargePercent}%</strong> of total
                      tickets sold will be charged to you.
                    </li>
                    <li>GST is not currently applicable.</li>
                    <li>All tickets will be marked as CANCELLED.</li>
                    <li>Ticket holders will be notified immediately.</li>
                  </ul>
                </>
              )}
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Reason for cancellation (optional)
              </span>
              <textarea
                name="cancelReason"
                rows={2}
                placeholder="e.g. Venue no longer available"
                className={INPUT}
                form="cancelEventForm"
              />
            </label>

            <form id="cancelEventForm" action={cancelEventAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowCancel(false)}
                >
                  Keep event
                </Button>
                <Button type="submit" variant="danger" size="sm">
                  Yes, cancel event
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      ) : null}

      {/* Postpone modal */}
      {showPostpone ? (
        <Modal onClose={() => setShowPostpone(false)} title="Postpone event">
          <div className="space-y-4">
            <div className="rounded-xl bg-violet-neon/10 p-3 text-xs text-violet-neon">
              <p className="font-bold">Postpone this event</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>All ticket holders will be notified of the new date.</li>
                <li>Attendees can choose to keep their ticket or request a refund.</li>
                {!isFree && (
                  <li>
                    For refunded tickets, the <strong>platform fee</strong> plus a{" "}
                    <strong>{postponementChargePercent}% postponement charge</strong> on refunded
                    tickets will be charged to you.
                  </li>
                )}
                <li>Tickets remain valid for the new date unless the user requests a refund.</li>
              </ul>
            </div>

            <form action={postponeEventAction} className="space-y-4">
              <input type="hidden" name="eventId" value={event.id} />

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    New start date & time
                  </span>
                  <input
                    type="datetime-local"
                    name="newStartsAt"
                    required
                    value={newStartsAt}
                    onChange={(e) => {
                      setNewStartsAt(e.target.value);
                      validatePostponeDates(e.target.value, newEndsAt);
                    }}
                    className={INPUT}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    New end date (optional)
                  </span>
                  <input
                    type="datetime-local"
                    name="newEndsAt"
                    value={newEndsAt}
                    onChange={(e) => {
                      setNewEndsAt(e.target.value);
                      validatePostponeDates(newStartsAt, e.target.value);
                    }}
                    className={INPUT}
                  />
                </label>
              </div>
              {postponeError ? (
                <p className="text-sm text-red-500">{postponeError}</p>
              ) : null}

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Message to attendees (optional)
                </span>
                <textarea
                  name="postponeReason"
                  rows={2}
                  placeholder="e.g. We're moving the event to next month due to weather."
                  className={INPUT}
                />
              </label>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowPostpone(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!!postponeError}>
                  Postpone event
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-md space-y-4 rounded-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted hover:text-violet-neon"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
