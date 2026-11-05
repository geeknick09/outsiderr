"use client";

import { useEffect, useState, useTransition } from "react";
import { ListChecks } from "lucide-react";

import { checkInGuestAction, listEventGuestlist } from "../../actions/counter";

interface Guest {
  id: string;
  name: string;
  phone: string | null;
  used: boolean;
}

/** Guestlist check-in for door staff - irreversible, with a verify-ID reminder. */
export function GuestlistSection({ staffToken, events }: { staffToken: string; events: { id: string; title: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [eventId, setEventId] = useState("");
  const [guests, setGuests] = useState<Guest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!eventId) { setGuests([]); return; }
    setLoading(true);
    listEventGuestlist(eventId)
      .then(setGuests)
      .catch(() => setError("Couldn't load the guest list."))
      .finally(() => setLoading(false));
  }, [eventId]);

  function checkIn(guestId: string) {
    setError(null);
    setGuests((gs) => gs.map((g) => (g.id === guestId ? { ...g, used: true } : g)));
    startTransition(async () => {
      const res = await checkInGuestAction(staffToken, eventId, guestId);
      if (res.error) {
        setError(res.error);
        setGuests((gs) => gs.map((g) => (g.id === guestId ? { ...g, used: true } : g)));
      }
    });
  }

  return (
    <div className="rounded-3xl border border-zinc-200 p-4 dark:border-white/10">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold"><ListChecks className="h-4 w-4 text-violet-neon" /> Guest list</p>
        <span className="text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
            <option value="">Choose an event</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          {loading ? <p className="text-xs text-muted">Loading guests…</p> : null}
          {eventId && !loading && guests.length === 0 ? <p className="text-xs text-muted">No guests on the list for this event.</p> : null}
          <div className="space-y-2">
            {guests.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{g.name}</p>
                  {g.phone ? <p className="text-xs text-muted">{g.phone}</p> : null}
                </div>
                {g.used ? (
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-500">Checked in</span>
                ) : (
                  <button type="button" disabled={pending} title="Ask for a photo ID before letting them in"
                    onClick={() => checkIn(g.id)}
                    className="shrink-0 rounded-full bg-neon-gradient px-4 py-1.5 text-xs font-bold text-white disabled:opacity-60">
                    Check in
                  </button>
                )}
              </div>
            ))}
          </div>
          {guests.length > 0 ? <p className="text-[11px] text-muted">Verify a photo ID before letting them in. Check-in can&apos;t be undone.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
