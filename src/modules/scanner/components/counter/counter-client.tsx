"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Ticket } from "lucide-react";

import { counterLoginAction, loadCounterAction } from "../../actions/counter";
import { createCounterSaleAction } from "../../actions/counter";
import type { CounterEvent, CounterStaff } from "../../data/counter";
import { formatPaise, nextSaleAttempt, type SaleAttempt } from "@/modules/shared";

const TOKEN_KEY = "outsiderr-counter-token";
const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function CounterClient() {
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  const [staff, setStaff] = useState<CounterStaff | null>(null);
  const [events, setEvents] = useState<CounterEvent[]>([]);
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [eventId, setEventId] = useState("");
  const [tierId, setTierId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [payMode, setPayMode] = useState<"CASH" | "UPI">("CASH");
  const [utr, setUtr] = useState("");
  const [attempt, setAttempt] = useState<SaleAttempt | null>(null);
  const [done, setDone] = useState<{ orderId: string; ticketIds: string[]; totalPaise: number } | null>(null);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(TOKEN_KEY);
    if (!saved) return;
    loadCounterAction(saved).then((res) => {
      if (res.error || !res.staff) {
        window.sessionStorage.removeItem(TOKEN_KEY);
        return;
      }
      setToken(saved);
      setStaff(res.staff);
      setEvents(res.events ?? []);
    });
  }, []);

  function signIn() {
    setError(null);
    startTransition(async () => {
      const res = await counterLoginAction(loginId, loginPassword);
      if (res.error || !res.token || !res.staff) return setError(res.error ?? "Could not sign in.");
      window.sessionStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
      setStaff(res.staff);
      const loaded = await loadCounterAction(res.token);
      setEvents(loaded.events ?? []);
    });
  }

  function signOut() {
    window.sessionStorage.removeItem(TOKEN_KEY);
    setToken(null); setStaff(null); setEvents([]); setEventId(""); setTierId(""); setDone(null);
  }

  const selectedEvent = events.find((e) => e.id === eventId);
  const selectedTier = selectedEvent?.tiers.find((t) => t.id === tierId);
  const cap = Math.max(1, selectedEvent?.maxTicketsPerOrder ?? 5);
  const stock = Math.max(0, selectedTier?.remaining ?? 0);
  const maxQty = Math.min(cap, stock || cap);
  const qty = Math.min(quantity, Math.max(1, maxQty));
  const subtotal = (selectedTier?.pricePaise ?? 0) * qty;

  // Mirror of create_counter_sale math for the breakdown card.
  const commission = Math.round(subtotal * 0.10);
  const convenience = Math.round(subtotal * 0.02);
  const gst = Math.round((commission + convenience) * 0.18);
  const total = subtotal + convenience + gst;

  function issue() {
    setError(null);
    if (!selectedEvent || !selectedTier) return;
    const next = nextSaleAttempt(attempt, [eventId, tierId, qty, name.trim(), phone.trim(), email.trim(), payMode, utr].join("|"));
    setAttempt(next);
    const fd = new FormData();
    fd.set("staffToken", token ?? "");
    fd.set("eventId", eventId);
    fd.set("tierId", tierId);
    fd.set("quantity", String(qty));
    fd.set("paymentMode", payMode);
    fd.set("buyerName", name);
    fd.set("buyerPhone", phone);
    fd.set("buyerEmail", email);
    fd.set("paymentRef", utr);
    fd.set("idempotencyKey", next.key);
    startTransition(async () => {
      const res = await createCounterSaleAction(fd);
      if (res.error) return setError(res.error);
      setDone({ orderId: res.orderId!, ticketIds: res.ticketIds ?? [], totalPaise: res.totalPaise ?? 0 });
      setQuantity(1); setName(""); setPhone(""); setEmail(""); setUtr("");
    });
  }

  if (!token || !staff) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-4 rounded-3xl border border-zinc-200 p-6 dark:border-white/10">
        <h1 className="text-lg font-bold">Box office</h1>
        <p className="text-xs text-muted">Sign in with the phone/email + password your organizer gave you.</p>
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        <input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="Phone or email" className={INPUT} />
        <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Password" className={INPUT}
          onKeyDown={(e) => e.key === "Enter" && signIn()} />
        <button type="button" onClick={signIn} disabled={pending} className="w-full rounded-full bg-neon-gradient py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
        <p className="text-sm text-muted">Signed in as <span className="font-bold text-foreground">{staff.name}</span></p>
        <button type="button" onClick={signOut} className="text-xs font-semibold text-muted hover:text-red-500">Sign out</button>
      </div>

      {error ? <p className="rounded-2xl bg-red-500/10 p-3 text-sm text-red-500">{error}</p> : null}

      {done ? (
        <div className="space-y-4 rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <p className="flex items-center gap-2 font-bold text-emerald-500">
            <Ticket className="h-4 w-4" /> {done.ticketIds.length} ticket{done.ticketIds.length === 1 ? "" : "s"} issued - collect {formatPaise(done.totalPaise)}
          </p>
          <div className="space-y-2">
            {done.ticketIds.length > 1 ? (
              <Link href={`/box-office/order/${done.orderId}/print`} target="_blank"
                className="block rounded-full border border-neon-gradient py-2 text-center text-xs font-bold text-violet-neon">
                Print all {done.ticketIds.length} tickets
              </Link>
            ) : null}
            {done.ticketIds.map((id, i) => (
              <div key={id} className="flex items-center justify-between rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
                <p className="text-sm font-semibold">Ticket {i + 1}</p>
                <div className="flex items-center gap-2">
                  <Link href={`/box-office/ticket/${id}/print`} target="_blank"
                    className="rounded-full bg-neon-gradient px-4 py-1.5 text-xs font-bold text-white">Print / QR</Link>
                  <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-[10px] font-semibold text-zinc-400 dark:bg-white/5" title="Coming soon">Email soon</span>
                  <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-[10px] font-semibold text-zinc-400 dark:bg-white/5" title="Coming soon">WhatsApp soon</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">Buyers with an Outsiderr account will also see these under My Tickets.</p>
          <button type="button" onClick={() => setDone(null)} className="w-full rounded-full border border-zinc-200 py-2.5 text-sm font-bold dark:border-white/10">New sale</button>
        </div>
      ) : (
        <div className="space-y-4 rounded-3xl border border-zinc-200 p-5 dark:border-white/10">
          <select value={eventId} onChange={(e) => { setEventId(e.target.value); setTierId(""); }} className={INPUT}>
            <option value="">Choose an event</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <select value={tierId} onChange={(e) => setTierId(e.target.value)} className={INPUT} disabled={!selectedEvent}>
            <option value="">Select ticket tier</option>
            {selectedEvent?.tiers.map((t) => (
              <option key={t.id} value={t.id} disabled={t.remaining <= 0}>
                {t.name} - {formatPaise(t.pricePaise)}{t.remaining <= 0 ? " (sold out)" : ` · ${t.remaining} left`}
              </option>
            ))}
          </select>

          {selectedEvent ? (
            <div className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Tickets (max {cap} per order)</p>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="h-8 w-8 rounded-full border border-zinc-200 text-sm font-bold dark:border-white/10">-</button>
                  <span className="w-6 text-center text-sm font-bold">{qty}</span>
                  <button type="button" onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} className="h-8 w-8 rounded-full border border-zinc-200 text-sm font-bold dark:border-white/10">+</button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Buyer name" className={INPUT} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Buyer phone (10 digits)" className={INPUT} />
          </div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Buyer email (optional)" className={INPUT} />

          <div className="grid gap-3 sm:grid-cols-2">
            {(["CASH", "UPI"] as const).map((m) => (
              <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-semibold ${payMode === m ? "border-violet-neon bg-violet-neon/10 text-violet-neon" : "border-zinc-200 dark:border-white/10"}`}>
                <input type="radio" checked={payMode === m} onChange={() => setPayMode(m)} className="accent-violet-neon" /> {m === "CASH" ? "Cash" : "UPI"}
              </label>
            ))}
          </div>

          {payMode === "UPI" ? (
            <div className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400">Collect via organizer UPI{selectedEvent?.organizerUpiId ? ` - ${selectedEvent.organizerUpiId}` : ""}</p>
              <p className="text-[11px] text-muted">Verify the amount matches the total below, take a screenshot of the buyer&apos;s UPI confirmation, then issue.</p>
              <input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="UPI UTR / reference (optional)" className={INPUT} />
            </div>
          ) : null}

          {selectedTier ? (
            <div className="space-y-1.5 rounded-2xl border border-zinc-200 p-3 text-xs dark:border-white/10">
              <div className="flex justify-between"><span className="text-muted">{qty} × {selectedTier.name}</span><span>{formatPaise(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Convenience fee</span><span>{formatPaise(convenience)}</span></div>
              <div className="flex justify-between"><span className="text-muted">GST (18% on platform fees)</span><span>{formatPaise(gst)}</span></div>
              <div className="flex justify-between border-t border-zinc-200 pt-1.5 font-bold dark:border-white/10"><span>Collect</span><span>{formatPaise(total)}</span></div>
            </div>
          ) : null}

          <button type="button" onClick={issue}
            disabled={pending || !selectedEvent || !selectedTier || !name.trim() || phone.replace(/\D/g, "").slice(-10).length !== 10 || qty < 1}
            className="w-full rounded-full bg-neon-gradient py-3 text-sm font-bold text-white disabled:opacity-60">
            {pending ? "Issuing…" : !selectedEvent || !selectedTier ? "Choose an event and tier" : `Collect ${formatPaise(total)} and issue ${qty} ticket${qty === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}
