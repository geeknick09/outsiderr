"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2, UserPlus } from "lucide-react";

import { addGuestEntryAction } from "@/modules/shared/actions/communities";
import type { GuestlistEntry } from "@/modules/shared/actions/communities";
import { Button, Badge } from "@/modules/shared";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-3.5 py-2 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function GuestlistPanel({
  eventId,
  guests,
}: {
  eventId: string;
  guests: GuestlistEntry[];
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remaining = 10 - guests.length;

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await addGuestEntryAction(eventId, name, phone || null, email || null);
      if (res.error) setError(res.error);
      else {
        setName(""); setPhone(""); setEmail("");
      }
    });
  }

  function copy(link: string, key: string) {
    navigator.clipboard.writeText(`${location.origin}${link}`).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Free entries - up to 10 per event. Each guest gets a shareable ticket link; no revenue is recorded.
        {" "}<strong>{remaining} left.</strong>
      </p>

      {guests.length ? (
        <div className="space-y-1.5">
          {guests.map((g) => (
            <div key={g.ticketId} className="glass flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{g.name}</p>
                <p className="truncate text-xs text-muted">{g.phone ?? g.email ?? ""}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {g.used ? <Badge tone="neutral">checked in</Badge> : <Badge tone="success">valid</Badge>}
                <button
                  onClick={() => copy(g.link, g.ticketId)}
                  className="rounded-full border border-zinc-200 p-2 text-muted hover:text-violet-neon dark:border-white/10"
                  title="Copy ticket link"
                >
                  {copied === g.ticketId ? <Check className="h-3.5 w-3.5 text-lime-neon" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {remaining > 0 ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest name *" className={INPUT} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={INPUT} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={INPUT} />
          <Button onClick={add} disabled={pending || !name.trim() || (!phone.trim() && !email.trim())}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Add
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-sm font-semibold text-red-500">{error}</p> : null}
    </div>
  );
}
