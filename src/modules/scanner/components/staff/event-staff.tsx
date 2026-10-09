"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, Ticket, Trash2, Users } from "lucide-react";

import {
  upsertEventStaffAction,
  confirmCashHandoverAction,
  setStaffAssignmentAction,
  setStaffPasswordAction,
} from "../../actions/staff";
import type { EventCounterStaff } from "../../data/staff";
import { formatPaise } from "@/modules/shared";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

/**
 * Staff for one event: name + email + phone + a password the organizer sets.
 * The same credential signs in at /scan (door) and /box-office (counter).
 * Sales are attributed to whoever is signed in (cash handover and Razorpay
 * counter sales included).
 */
export function EventStaff({
  eventId,
  staff,
}: {
  eventId: string;
  staff: EventCounterStaff[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState("");

  function add() {
    setError(null);
    setNotice(null);
    if (!name.trim()) return setError("Staff name is required.");
    if (phone.replace(/\D/g, "").length < 10) return setError("Enter the staff member's 10-digit phone.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    const fd = new FormData();
    fd.set("eventId", eventId);
    fd.set("name", name.trim());
    fd.set("email", email.trim());
    fd.set("phone", phone.trim());
    fd.set("password", password);
    startTransition(async () => {
      const res = await upsertEventStaffAction(fd);
      if (res.error) return setError(res.error);
      setNotice(
        res.reused
          ? `${res.name} was already registered - assigned to this event, password updated.`
          : `${res.name} added - they sign in with their phone/email + this password.`,
      );
      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
      router.refresh();
    });
  }

  function run(fn: () => Promise<{ error: string | null }>, okMsg: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) return setError(res.error);
      setNotice(okMsg);
      router.refresh();
    });
  }

  function savePassword(staffId: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await setStaffPasswordAction(staffId, passwordValue);
      if (res.error) return setError(res.error);
      setPasswordFor(null);
      setPasswordValue("");
      setNotice("Password updated.");
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Add staff with a password you choose. They sign in at{" "}
        <span className="font-mono text-violet-neon">/scan</span> (door) or{" "}
        <span className="font-mono text-violet-neon">/box-office</span> (counter) with their phone or email
        + password. Sales are attributed to them.
      </p>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Staff name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul - Gate 1" className={INPUT} disabled={pending} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Email (optional)</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rahul@example.com" className={INPUT} disabled={pending} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Phone * (their login)</label>
            <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit phone" className={INPUT} disabled={pending} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Password * (you set it, share it with them)</label>
          <input type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" className={INPUT} disabled={pending} />
        </div>
        <button
          type="button"
          onClick={add}
          disabled={pending}
          className="flex items-center gap-2 rounded-2xl bg-neon-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow-violet disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {pending ? "Working..." : "Add staff"}
        </button>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-500">{notice}</p> : null}

      {/* Assigned staff */}
      {staff.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted" />
            <h4 className="text-sm font-bold">Staff ({staff.filter((s) => s.isActive).length})</h4>
          </div>
          {staff.map((s) => (
            <div key={s.id} className="space-y-2 rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-semibold">
                    {s.name}
                    {!s.isActive ? <span className="ml-2 text-xs font-normal text-red-500">(deactivated)</span> : null}
                    {s.ownerType === "ADMIN" ? <span className="ml-2 text-[10px] font-normal text-muted">Outsiderr staff</span> : null}
                  </p>
                  <p className="text-xs text-muted">{s.phone}{s.email ? ` · ${s.email}` : ""}</p>
                  {s.cashOutstandingPaise > 0 ? (
                    <p className="text-xs font-semibold text-amber-500">
                      {formatPaise(s.cashOutstandingPaise)} cash to collect
                    </p>
                  ) : null}
                </div>
                {/* Admin-owned staff are managed by Outsiderr, not the organizer. */}
                {s.ownerType === "ADMIN" ? null : (
                <div className="flex shrink-0 items-center gap-1">
                  {s.cashOutstandingPaise > 0 ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() => confirmCashHandoverAction(s.id, eventId), "Cash handover confirmed.")
                      }
                      className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-500/10"
                    >
                      Confirm cash
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setPasswordFor(passwordFor === s.id ? null : s.id);
                      setPasswordValue("");
                    }}
                    className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-violet-neon hover:bg-violet-neon/10"
                  >
                    <span className="inline-flex items-center gap-1"><KeyRound className="h-3 w-3" />Set password</span>
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    title="Remove from this event"
                    onClick={() =>
                      run(() => setStaffAssignmentAction(s.id, eventId, false), "Removed from this event.")
                    }
                    className="rounded-xl p-2 text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                )}
              </div>
              {passwordFor === s.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    autoComplete="off"
                    minLength={6}
                    value={passwordValue}
                    onChange={(e) => setPasswordValue(e.target.value)}
                    placeholder="New password (min 6 chars)"
                    className={INPUT}
                  />
                  <button
                    type="button"
                    disabled={passwordValue.length < 6 || pending}
                    onClick={() => savePassword(s.id)}
                    className="shrink-0 rounded-xl bg-neon-gradient px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Ticket className="h-4 w-4" /> No staff assigned yet. Add someone above.
        </p>
      )}
    </div>
  );
}
