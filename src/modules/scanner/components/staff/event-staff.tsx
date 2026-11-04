"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Pencil, Plus, Ticket, Trash2, Users } from "lucide-react";

import {
  upsertEventStaffAction,
  confirmCashHandoverAction,
  setStaffAssignmentAction,
  setStaffPasswordAction,
  updateLegacyStaffAction,
  removeLegacyStaffAction,
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
  legacyStaff,
}: {
  eventId: string;
  staff: EventCounterStaff[];
  // Legacy event_staff rows — rendered in the same roster so the organizer
  // sees ONE staff list instead of two separate sections.
  legacyStaff?: { id: string; displayName: string; phone: string | null; email: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [roleScan, setRoleScan] = useState(true);
  const [roleSell, setRoleSell] = useState(true);
  const [roleManager, setRoleManager] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState("");

  function add() {
    setError(null);
    setNotice(null);
    if (!name.trim()) return setError("Staff name is required.");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return setError("Enter the staff member's 10-digit phone.");
    if (digits.length > 10) return setError("Phone must be exactly 10 digits (without country code).");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (!roleScan && !roleSell && !roleManager) return setError("Pick at least one role - door, box office or manager.");
    const fd = new FormData();
    fd.set("eventId", eventId);
    fd.set("name", name.trim());
    fd.set("email", email.trim());
    fd.set("phone", phone.trim());
    fd.set("password", password);
    fd.set("canScan", String(roleScan));
    fd.set("canSell", String(roleSell));
    fd.set("isManager", String(roleManager));
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

  function startLegacyEdit(s: { id: string; displayName: string; phone: string | null; email: string | null }) {
    setEditId(s.id);
    setEditName(s.displayName);
    setEditPhone(s.phone ?? "");
    setEditEmail(s.email ?? "");
  }

  function saveLegacyEdit(staffId: string) {
    if (!editName.trim()) return setError("Name is required.");
    run(
      () => updateLegacyStaffAction(eventId, staffId, editName, editEmail || null, editPhone || null),
      "Staff updated.",
    );
    setEditId(null);
  }

  function removeLegacy(staffId: string) {
    run(
      () => removeLegacyStaffAction(eventId, staffId),
      "Staff removed.",
    );
  }

  function toggleRole(s: EventCounterStaff, key: "canScan" | "canSell" | "isManager") {
    const next = { canScan: s.canScan, canSell: s.canSell, isManager: s.isManager, [key]: !s[key] };
    if (!next.canScan && !next.canSell && !next.isManager) {
      return setError(`${s.name} needs at least one role - door, box office or manager.`);
    }
    run(
      () => setStaffAssignmentAction(s.id, eventId, s.isActive, next),
      `${s.name}'s roles updated.`,
    );
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
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rahul@example.com" className={`${INPUT} ${email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "border-red-500" : ""}`} disabled={pending} />
            {email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? (
              <p className="mt-1 text-[11px] text-red-500">Enter a valid email address.</p>
            ) : null}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Phone * (their login)</label>
            <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit phone" className={`${INPUT} ${phone && phone.replace(/\D/g, "").length < 10 ? "border-red-500" : ""}`} disabled={pending} />
            {phone && phone.replace(/\D/g, "").length < 10 ? (
              <p className="mt-1 text-[11px] text-red-500">Enter the 10-digit phone number.</p>
            ) : null}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Password * (you set it, share it with them)</label>
          <input type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" className={INPUT} disabled={pending} />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Roles * (pick at least one)</p>
          <div className="flex flex-wrap gap-2">
            {([
              ["Door - scanning", roleScan, setRoleScan],
              ["Box office - sell tickets", roleSell, setRoleSell],
              ["Manager", roleManager, setRoleManager],
            ] as const).map(([label, on, set]) => (
              <label key={label} className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition-colors ${
                on ? "border-violet-neon bg-violet-neon/10 text-violet-neon" : "border-zinc-200 text-muted dark:border-white/10"
              }`}>
                <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="accent-violet-neon" disabled={pending} />
                {label}
              </label>
            ))}
          </div>
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
      {staff.length + (legacyStaff?.length ?? 0) > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted" />
            <h4 className="text-sm font-bold">Staff ({staff.filter((s) => s.isActive).length + (legacyStaff?.length ?? 0)})</h4>
          </div>
          {legacyStaff?.map((s) => (
            <div key={`legacy-${s.id}`} className="space-y-2 rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
              {editId === s.id ? (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" className={INPUT} disabled={pending} />
                    <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone" className={INPUT} disabled={pending} />
                    <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email" className={INPUT} disabled={pending} />
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={pending} onClick={() => saveLegacyEdit(s.id)}
                      className="rounded-full bg-neon-gradient px-4 py-1.5 text-xs font-bold text-white">Save</button>
                    <button type="button" disabled={pending} onClick={() => setEditId(null)}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted hover:text-foreground">Cancel</button>
                  </div>
                </div>
              ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-semibold">{s.displayName}</p>
                  <p className="text-xs text-muted">{s.phone}{s.email ? ` · ${s.email}` : ""}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" disabled={pending} title="Edit staff"
                    onClick={() => startLegacyEdit(s)}
                    className="rounded-xl p-2 text-violet-neon hover:bg-violet-neon/10">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" disabled={pending} title="Remove staff"
                    onClick={() => { if (confirm(`Remove ${s.displayName} from this event?`)) removeLegacy(s.id); }}
                    className="rounded-xl p-2 text-red-500 hover:bg-red-500/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              )}
            </div>
          ))}
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
                  {s.ownerType === "ADMIN" ? null : (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {([
                        ["canScan", "Door", s.canScan],
                        ["canSell", "Box office", s.canSell],
                        ["isManager", "Manager", s.isManager],
                      ] as const).map(([key, label, on]) => (
                        <button
                          key={key}
                          type="button"
                          disabled={pending}
                          onClick={() => toggleRole(s, key)}
                          title={`Toggle ${label} access`}
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-colors disabled:opacity-50 ${
                            on
                              ? "bg-violet-neon/15 text-violet-neon"
                              : "bg-zinc-100 text-zinc-400 dark:bg-white/5 dark:text-zinc-500"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
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
                      run(
                        () => setStaffAssignmentAction(s.id, eventId, false, {
                          canScan: s.canScan, canSell: s.canSell, isManager: s.isManager,
                        }),
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
