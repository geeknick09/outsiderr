"use client";

import { useState } from "react";
import { Loader2, ScanLine } from "lucide-react";

import { staffDoorLoginAction } from "@/modules/scanner/actions/scan";
import type { StaffDoorEvent } from "@/modules/scanner/actions/scan";

export interface StaffDoorSession {
  staffToken: string;
  staffName: string;
  events: StaffDoorEvent[];
}

/**
 * Staff sign-in for the door scanner: phone number or email + the password the
 * organizer set. Returns the staff session token and their assigned events;
 * the scanner then takes an event-scoped door token per selected event.
 */
export function StaffLogin({
  onVerified,
}: {
  onVerified: (session: StaffDoorSession) => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError("Enter your phone or email and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await staffDoorLoginAction(identifier, password);
    setSubmitting(false);
    if (result.error || !result.staffToken) {
      setError(result.error ?? "Sign-in failed.");
      return;
    }
    if (!result.events?.length) {
      setError("You are not assigned to any live event. Ask your organizer to assign you.");
      return;
    }
    onVerified({
      staffToken: result.staffToken,
      staffName: result.staffName ?? "",
      events: result.events,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="glass space-y-4 rounded-3xl p-6">
      <div className="flex items-center gap-2">
        <ScanLine className="h-6 w-6 text-violet-neon" />
        <h1 className="text-2xl font-black tracking-tight">Door Scanner</h1>
      </div>
      <p className="text-sm text-muted">
        Sign in with the phone or email and password your organizer gave you.
      </p>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Phone or email
        </label>
        <input
          type="text"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="10-digit phone or email"
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
          disabled={submitting}
          autoFocus
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Password
        </label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
          disabled={submitting}
        />
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting || !identifier.trim() || !password}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neon-gradient px-5 py-3 text-sm font-bold text-white shadow-glow-violet transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <ScanLine className="h-5 w-5" />
        )}
        Sign in
      </button>
    </form>
  );
}
