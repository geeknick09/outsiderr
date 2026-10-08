"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, Ticket, Trash2, Users } from "lucide-react";

import {
  addEventCounterStaffAction,
  confirmCashHandoverAction,
  resetStaffPinAction,
  setStaffAssignmentAction,
} from "../../actions/staff";
import type { EventCounterStaff } from "../../data/staff";
import { formatPaise } from "@/modules/shared";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

/**
 * Counter staff for one event - the box-office twin of the door-PIN generator.
 * Enter name + email + phone, generate a personal PIN, and the staff member
 * signs in at /box-office with their phone + PIN. Sales are attributed to them
 * (cash handover and Razorpay counter sales included).
 */
export function EventCounterStaff({
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shownPin, setShownPin] = useState<{ name: string; pin: string } | null>(null);

  function add() {
    setError(null);
    setNotice(null);
    setShownPin(null);
    if (!name.trim()) return setError("Staff name is required.");
    if (phone.replace(/\D/g, "").length < 10) return setError("Enter the staff member's 10-digit phone.");
    const fd = new FormData();
    fd.set("eventId", eventId);
    fd.set("name", name.trim());
    fd.set("email", email.trim());
    fd.set("phone", phone.trim());
    startTransition(async () => {
      const res = await addEventCounterStaffAction(fd);
      if (res.error) return setError(res.error);
      if (res.pin) setShownPin({ name: res.name ?? "Staff", pin: res.pin });
      setNotice(
        res.reused
          ? `${res.name} was already registered - assigned to this event. They sign in with their current PIN.`
          : "PIN generated - share it now, it is only shown once.",
      );
      setName("");
      setEmail("");
      setPhone("");
      router.refresh();
    });
  }

  function run(fn: () => Promise<{ error: string | null; pin?: string }>, okMsg: string, showPinFor?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) return setError(res.error);
      if (res.pin && showPinFor) setShownPin({ name: showPinFor, pin: res.pin });
      setNotice(okMsg);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Generate a personal PIN for each counter staff member. They sign in at{" "}
        <span className="font-mono text-violet-neon">/box-office</span> with their phone + PIN and can
        take cash or card/UPI payments. Sales are attributed to them.
      </p>

      {/* Add form - mirrors the door-PIN single add */}
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Staff name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul - Counter 1" className={INPUT} disabled={pending} />
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
        <button
          type="button"
          onClick={add}
          disabled={pending}
          className="flex items-center gap-2 rounded-2xl bg-neon-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow-violet disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {pending ? "Working..." : "Generate PIN & assign"}
        </button>
      </div>

      {shownPin ? (
        <div className="rounded-2xl border border-amber-400/50 bg-amber-400/5 p-4">
          <p className="flex items-center gap-2 text-sm font-bold">
            <KeyRound className="h-4 w-4 text-amber-400" /> PIN for {shownPin.name}
          </p>
          <p className="mt-1 font-mono text-3xl font-black tracking-[0.3em]">{shownPin.pin}</p>
          <p className="mt-1 text-xs text-muted">
            Shown once - share it now. They sign in at /box-office with their phone + this PIN. Reset the PIN to issue a new one.
          </p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-500">{notice}</p> : null}

      {/* Assigned staff */}
      {staff.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted" />
            <h4 className="text-sm font-bold">Counter staff ({staff.filter((s) => s.isActive).length})</h4>
          </div>
          {staff.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
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
                      run(
                        () => confirmCashHandoverAction(s.id, eventId).then((r) => ({ error: r.error, pin: undefined })),
                        "Cash handover confirmed.",
                      )
                    }
                    className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-500/10"
                  >
                    Confirm cash
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => resetStaffPinAction(s.id),
                      "New PIN issued.",
                      s.name,
                    )
                  }
                  className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-violet-neon hover:bg-violet-neon/10"
                >
                  Reset PIN
                </button>
                <button
                  type="button"
                  disabled={pending}
                  title="Remove from this event"
                  onClick={() =>
                    run(
                      () => setStaffAssignmentAction(s.id, eventId, false),
                      "Removed from this event.",
                    )
                  }
                  className="rounded-xl p-2 text-red-500 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Ticket className="h-4 w-4" /> No counter staff assigned yet. Add someone above.
        </p>
      )}
    </div>
  );
}
