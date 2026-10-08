"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { KeyRound, UserPlus } from "lucide-react";

import {
  confirmCashHandoverAction,
  registerStaffAction,
  resetStaffPinAction,
  setStaffActiveAction,
  setStaffAssignmentAction,
  type RegisterStaffState,
} from "../../actions/staff";
import type { AssignableEvent, StaffRecord } from "../../data/staff";
import { formatPaise } from "@/modules/shared";

export interface CashRow {
  staffId: string;
  staffName: string;
  eventId: string;
  eventTitle: string;
  orderCount: number;
  amountPaise: number;
}

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

/** Named box-office staff: register, reset PIN, deactivate, and assign events. */
export function StaffManager({
  staff,
  events,
  scopeLabel,
  cash,
}: {
  staff: StaffRecord[];
  events: AssignableEvent[];
  scopeLabel: string;
  cash: CashRow[];
}) {
  const [state, formAction, pending] = useActionState<RegisterStaffState, FormData>(registerStaffAction, { error: null });
  const formRef = useRef<HTMLFormElement>(null);
  const [shownPin, setShownPin] = useState<{ name: string; pin: string } | null>(null);

  // Clear the form only after a successful registration. A form action would reset it on every
  // attempt, so a validation error would wipe what the owner typed.
  useEffect(() => {
    if (state.pin && !state.error) formRef.current?.reset();
  }, [state]);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const pinBanner =
    state.pin && !shownPin && state.name ? { name: state.name, pin: state.pin } : shownPin;

  function run(fn: () => Promise<{ error: string | null; pin?: string }>, label: string, onPin?: (pin: string) => void) {
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) return setNotice(res.error);
      if (res.pin && onPin) onPin(res.pin);
      setNotice(label);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Box office staff</h1>
        <p className="text-sm text-muted">{scopeLabel}. Staff sign in at the counter with their phone and personal PIN.</p>
      </div>

      {pinBanner ? (
        <div className="glass rounded-2xl border border-amber-400/50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold">
            <KeyRound className="h-4 w-4 text-amber-400" /> PIN for {pinBanner.name}
          </p>
          <p className="mt-1 font-mono text-3xl font-black tracking-[0.3em]">{pinBanner.pin}</p>
          <p className="mt-1 text-xs text-muted">Shown once. Share it with them now. It cannot be read again; reset it to issue a new one.</p>
          <button type="button" onClick={() => setShownPin(null)} className="mt-2 text-xs font-semibold text-violet-neon hover:underline">
            Dismiss
          </button>
        </div>
      ) : null}

      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          setShownPin(null);
          formAction(new FormData(e.currentTarget));
        }}
        className="glass grid gap-3 rounded-3xl p-5 sm:grid-cols-3"
      >
        <p className="flex items-center gap-2 text-sm font-bold sm:col-span-3">
          <UserPlus className="h-4 w-4 text-violet-neon" /> Register staff
        </p>
        <input name="name" required placeholder="Full name" className={INPUT} />
        <input name="phone" required inputMode="tel" placeholder="10-digit phone" className={INPUT} />
        <input name="email" type="email" placeholder="Email (optional)" className={INPUT} />
        <div className="sm:col-span-3 flex items-center gap-3">
          <button type="submit" disabled={pending} className="rounded-full bg-neon-gradient px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
            {pending ? "Registering..." : "Register and generate PIN"}
          </button>
          {state.error ? <p className="text-sm text-red-500">{state.error}</p> : null}
        </div>
      </form>

      {notice ? <p className="text-sm text-muted">{notice}</p> : null}

      <div className="glass space-y-3 rounded-3xl p-5">
        <p className="text-sm font-bold">Cash to collect</p>
        <p className="text-xs text-muted">Cash taken at the counter that has not been handed over yet. Confirm once you have received it.</p>
        {cash.length === 0 ? <p className="text-sm text-muted">Nothing outstanding.</p> : null}
        {cash.map((row) => (
          <div key={row.staffId + row.eventId} className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 p-3 text-sm dark:border-white/10">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{row.staffName} · {row.eventTitle}</p>
              <p className="text-xs text-muted">{row.orderCount} cash sale{row.orderCount === 1 ? "" : "s"}</p>
            </div>
            <p className="font-mono font-bold">{formatPaise(row.amountPaise)}</p>
            <button
              type="button"
              onClick={() => run(() => confirmCashHandoverAction(row.staffId, row.eventId).then((r) => ({ error: r.error })), "Handover confirmed.")}
              className="rounded-full bg-neon-gradient px-3 py-1.5 text-xs font-bold text-white"
            >
              Confirm received
            </button>
          </div>
        ))}
      </div>

      {staff.length === 0 ? (
        <p className="glass rounded-3xl p-5 text-sm text-muted">No staff registered yet.</p>
      ) : (
        <div className="space-y-3">
          {staff.map((s) => (
            <div key={s.id} className="glass space-y-3 rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {s.name} <span className="text-xs text-muted">· {s.phone}{s.email ? ` · ${s.email}` : ""}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {s.isActive ? "Active" : "Deactivated"} · {s.assignedEventIds.length} event{s.assignedEventIds.length === 1 ? "" : "s"} assigned
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => run(() => setStaffActiveAction(s.id, !s.isActive), s.isActive ? "Deactivated." : "Reactivated.")}
                  className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold dark:border-white/10"
                >
                  {s.isActive ? "Deactivate" : "Reactivate"}
                </button>
                <button
                  type="button"
                  onClick={() => run(() => resetStaffPinAction(s.id), "PIN reset.", (pin) => setShownPin({ name: s.name, pin }))}
                  className="rounded-full border border-amber-400/50 px-3 py-1.5 text-xs font-semibold text-amber-500"
                >
                  Reset PIN
                </button>
              </div>

              <div className="grid gap-1.5 sm:grid-cols-2">
                {events.length === 0 ? <p className="text-xs text-muted">No live events to assign.</p> : null}
                {events.map((e) => {
                  const checked = s.assignedEventIds.includes(e.id);
                  return (
                    <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-white/10">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(ev) => run(() => setStaffAssignmentAction(s.id, e.id, ev.target.checked), "Assignments updated.")}
                        className="h-3.5 w-3.5 accent-violet-neon"
                      />
                      <span className="min-w-0 flex-1 truncate">{e.title}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
