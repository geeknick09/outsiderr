"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Ticket } from "lucide-react";

import {
  counterAbandonRazorpayAction,
  counterLoginAction,
  counterSaleAction,
  counterStartRazorpayAction,
  counterVerifyRazorpayAction,
  loadCounterAction,
} from "../../actions/counter";
import type { CounterEvent, CounterStaff } from "../../data/counter";
import { formatPaise, nextSaleAttempt, RazorpayCheckout, type CheckoutSession, type SaleAttempt } from "@/modules/shared";

const TOKEN_KEY = "outsiderr-counter-token";
const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

/** Box-office counter: staff sign in with phone + PIN, then sell tickets for their assigned events. */
export function CounterClient() {
  const [token, setToken] = useState<string | null>(null);
  const [staff, setStaff] = useState<CounterStaff | null>(null);
  const [events, setEvents] = useState<CounterEvent[]>([]);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [eventId, setEventId] = useState("");
  const [tierId, setTierId] = useState("");
  const [mode, setMode] = useState<"WALKIN_QR" | "WALKIN_INSTANT">("WALKIN_QR");
  const [payMethod, setPayMethod] = useState<"CASH" | "RAZORPAY">("CASH");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [attempt, setAttempt] = useState<SaleAttempt | null>(null);
  const [done, setDone] = useState<{ ticketId: string; totalPaise: number } | null>(null);
  const [rzpSession, setRzpSession] = useState<CheckoutSession | null>(null);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setBooting(false);
      return;
    }
    loadCounterAction(saved).then((res) => {
      if (res.error || !res.staff) {
        window.sessionStorage.removeItem(TOKEN_KEY);
      } else {
        setToken(saved);
        setStaff(res.staff);
        setEvents(res.events ?? []);
      }
      setBooting(false);
    });
  }, []);

  function signIn(form: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await counterLoginAction(String(form.get("phone") ?? ""), String(form.get("pin") ?? ""));
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
    setToken(null);
    setStaff(null);
    setEvents([]);
    setDone(null);
  }

  function sell() {
    if (!token) return;
    if (!eventId || !tierId) return setError("Choose an event and a ticket tier.");
    if (!name.trim() || !phone.trim()) return setError("Buyer name and phone are required.");
    setError(null);
    const next = nextSaleAttempt(attempt, [eventId, tierId, name.trim(), phone.trim(), email.trim(), mode, payMethod].join("|"));
    setAttempt(next);
    const fd = new FormData();
    fd.set("token", token);
    fd.set("eventId", eventId);
    fd.set("tierId", tierId);
    fd.set("clientSaleId", next.key);
    fd.set("mode", mode);
    fd.set("buyerName", name.trim());
    fd.set("buyerPhone", phone.trim());
    fd.set("buyerEmail", email.trim());
    if (payMethod === "RAZORPAY" && selectedEvent && selectedTier) {
      fd.set("eventTitle", selectedEvent.title);
      fd.set("tierName", selectedTier.name);
    }
    startTransition(async () => {
      if (payMethod === "RAZORPAY") {
        const res = await counterStartRazorpayAction(fd);
        if (res.error || !res.session) return setError(res.error ?? "Could not start the payment.");
        setRzpSession(res.session);
        return;
      }
      const res = await counterSaleAction(fd);
      if (res.error || !res.ticketId) return setError(res.error ?? "Could not create the ticket.");
      setDone({ ticketId: res.ticketId, totalPaise: res.totalPaise ?? 0 });
      setAttempt(null);
      setName("");
      setPhone("");
      setEmail("");
    });
  }

  if (booting) return <p className="py-10 text-center text-sm text-muted">Loading...</p>;

  if (!token || !staff) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          signIn(new FormData(e.currentTarget));
        }}
        className="glass mx-auto max-w-sm space-y-4 rounded-3xl p-6"
      >
        <div>
          <h1 className="text-xl font-black">Box office sign-in</h1>
          <p className="text-xs text-muted">Use the phone number and personal PIN your organizer or Outsiderr gave you.</p>
        </div>
        <input name="phone" required inputMode="tel" placeholder="10-digit phone" className={INPUT} />
        <input name="pin" required inputMode="numeric" maxLength={6} pattern="\d{6}" placeholder="6-digit PIN" className={INPUT} />
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <button type="submit" disabled={pending} className="w-full rounded-full bg-neon-gradient py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    );
  }

  const selectedEvent = events.find((e) => e.id === eventId);
  const selectedTier = selectedEvent?.tiers.find((t) => t.id === tierId);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="glass flex items-center justify-between rounded-2xl p-3">
        <p className="text-sm">
          Signed in as <span className="font-bold">{staff.name}</span>
        </p>
        <button type="button" onClick={signOut} className="text-xs font-semibold text-muted hover:text-red-500">Sign out</button>
      </div>

      {rzpSession ? (
        <div className="glass space-y-4 rounded-3xl p-5">
          <RazorpayCheckout
            session={rzpSession}
            verifyAction={(input) => counterVerifyRazorpayAction(token, input)}
            failureAction={(input) => counterAbandonRazorpayAction(token, input)}
            successRedirect={`/box-office/order/${rzpSession.orderId}`}
            statusRedirect={`/box-office/order/${rzpSession.orderId}`}
            onCancel={() => {
              setRzpSession(null);
              setAttempt(null);
              setError("Payment cancelled. The seat was released.");
            }}
            onError={(message) => {
              setRzpSession(null);
              setAttempt(null);
              setError(message);
            }}
          />
        </div>
      ) : done ? (
        <div className="glass space-y-3 rounded-3xl p-5">
          <p className="flex items-center gap-2 font-bold text-emerald-500"><Ticket className="h-4 w-4" /> Ticket issued - {formatPaise(done.totalPaise)} cash taken</p>
          <Link href={`/box-office/ticket/${done.ticketId}/print`} target="_blank" className="inline-block rounded-full bg-neon-gradient px-4 py-2 text-sm font-bold text-white">
            Open ticket for the buyer
          </Link>
          <button type="button" onClick={() => setDone(null)} className="block text-sm font-semibold text-violet-neon hover:underline">Sell another</button>
        </div>
      ) : (
        <div className="glass space-y-4 rounded-3xl p-5">
          {events.length === 0 ? (
            <p className="text-sm text-muted">No live events are assigned to you yet. Ask your organizer or admin.</p>
          ) : null}
          <select value={eventId} onChange={(e) => { setEventId(e.target.value); setTierId(""); }} className={INPUT}>
            <option value="">Select event</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          {selectedEvent ? (
            <select value={tierId} onChange={(e) => setTierId(e.target.value)} className={INPUT}>
              <option value="">Select ticket tier</option>
              {selectedEvent.tiers.map((t) => (
                <option key={t.id} value={t.id} disabled={t.remaining < 1}>
                  {t.name} - {formatPaise(t.pricePaise)} {t.remaining < 1 ? "(sold out)" : `(${t.remaining} left)`}
                </option>
              ))}
            </select>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Buyer name" className={INPUT} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Buyer phone" className={INPUT} />
          </div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Buyer email (optional)" className={INPUT} />
          {payMethod === "CASH" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-2xl border border-zinc-200 p-3 text-sm dark:border-white/10">
                <input type="radio" checked={mode === "WALKIN_QR"} onChange={() => setMode("WALKIN_QR")} /> Issue ticket (scan at the door)
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-zinc-200 p-3 text-sm dark:border-white/10">
                <input type="radio" checked={mode === "WALKIN_INSTANT"} onChange={() => setMode("WALKIN_INSTANT")} /> Check in now
              </label>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-2xl border border-zinc-200 p-3 text-sm dark:border-white/10">
              <input type="radio" checked={payMethod === "CASH"} onChange={() => setPayMethod("CASH")} /> Cash
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-zinc-200 p-3 text-sm dark:border-white/10">
              <input type="radio" checked={payMethod === "RAZORPAY"} onChange={() => setPayMethod("RAZORPAY")} /> Card / UPI (Razorpay)
            </label>
          </div>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <button type="button" disabled={pending || !selectedTier} onClick={sell} className="w-full rounded-full bg-neon-gradient py-2.5 text-sm font-bold text-white disabled:opacity-50">
            {pending
              ? "Please wait..."
              : !selectedTier
                ? "Choose an event and tier"
                : payMethod === "CASH"
                  ? `Take ${formatPaise(selectedTier.pricePaise)} cash and issue ticket`
                  : `Collect ${formatPaise(selectedTier.pricePaise)} via Razorpay`}
          </button>
        </div>
      )}
    </div>
  );
}
