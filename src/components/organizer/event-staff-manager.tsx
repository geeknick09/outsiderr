"use client";

import { useState } from "react";
import { Loader2, Trash2, UserPlus, Users } from "lucide-react";

import { addEventStaffAction, removeEventStaffAction } from "@/actions/event-staff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { EventStaffMember } from "@/lib/data/event-staff";

const INPUT =
  "w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function EventStaffManager({
  eventId,
  staff,
}: {
  eventId: string;
  staff: EventStaffMember[];
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!email && !phone) {
      setError("Email or phone is required.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    const res = await addEventStaffAction(eventId, email, phone, name);
    setLoading(false);
    if (res.success) {
      setEmail("");
      setPhone("");
      setName("");
      setSuccess("Door staff added successfully.");
    } else {
      setError(res.error ?? "Failed to add door staff.");
    }
  }

  async function handleRemove(staffId: string) {
    if (!confirm("Remove this door staff member?")) return;
    await removeEventStaffAction(eventId, staffId);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-violet-neon" />
        <h2 className="text-lg font-bold">Door Staff</h2>
      </div>
      <p className="text-sm text-muted">
        Assign door staff by email or phone. They will only be able to access the door scanner
        at <code className="rounded bg-violet-neon/10 px-1.5 py-0.5 text-xs text-violet-neon">/scan</code> —
        no access to your organizer dashboard or analytics.
      </p>

      {/* Add form */}
      <form onSubmit={handleAdd} className="glass rounded-2xl space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Staff name"
              className={INPUT}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@example.com"
              className={INPUT}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Phone</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className={INPUT}
            />
          </label>
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-500">{success}</p> : null}
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Add door staff
        </Button>
      </form>

      {/* Staff list */}
      {staff.length === 0 ? (
        <div className="glass rounded-2xl p-5 text-sm text-muted">
          No door staff assigned yet.
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-zinc-200 dark:border-white/10">
              <tr>
                <th className="px-3 py-2 font-semibold text-muted">Name</th>
                <th className="hidden px-3 py-2 font-semibold text-muted sm:table-cell">Email</th>
                <th className="hidden px-3 py-2 font-semibold text-muted sm:table-cell">Phone</th>
                <th className="px-3 py-2 font-semibold text-muted">Status</th>
                <th className="hidden px-3 py-2 font-semibold text-muted md:table-cell">Added</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="border-b border-zinc-100 dark:border-white/5">
                  <td className="px-3 py-2 font-semibold">{member.displayName}</td>
                  <td className="hidden px-3 py-2 text-muted sm:table-cell">{member.email ?? "—"}</td>
                  <td className="hidden px-3 py-2 text-muted sm:table-cell">{member.phone ?? "—"}</td>
                  <td className="px-3 py-2">
                    {member.userId ? (
                      <Badge tone="success">Linked</Badge>
                    ) : (
                      <Badge tone="warning">Pending login</Badge>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 text-[10px] text-muted md:table-cell">
                    {formatDateTime(member.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleRemove(member.id)}
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-500/10"
                      aria-label="Remove staff"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
