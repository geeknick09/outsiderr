"use client";

import { useState } from "react";
import { KeyRound, Plus, Trash2, Users, Mail, Phone } from "lucide-react";

import { generateScannerPinsAction, revokeScannerPinAction } from "@/actions/scanner-pins";
import { Button } from "@/modules/shared";
import type { ScannerPin } from "@/modules/shared";

export function ScannerPinManager({
  eventId,
  pins: initialPins,
}: {
  eventId: string;
  pins: ScannerPin[];
}) {
  const [pins, setPins] = useState<ScannerPin[]>(initialPins);
  const [mode, setMode] = useState<"single" | "bulk-count" | "bulk-names">("single");
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPhone, setStaffPhone] = useState("");
  const [count, setCount] = useState("");
  const [pattern, setPattern] = useState("Gate {n}");
  const [namesText, setNamesText] = useState("");
  const [emailsText, setEmailsText] = useState("");
  const [phonesText, setPhonesText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPins, setGeneratedPins] = useState<{ pinCode: string; staffName: string }[] | null>(null);

  async function handleGenerate() {
    setError(null);
    setGeneratedPins(null);

    let names: string[] = [];
    let emails: string[] = [];
    let phones: string[] = [];

    if (mode === "single") {
      if (!staffName.trim()) {
        setError("Staff name is required.");
        return;
      }
      names = [staffName.trim()];
      emails = [staffEmail.trim()];
      phones = [staffPhone.trim()];
    } else if (mode === "bulk-count") {
      const n = parseInt(count, 10);
      if (!n || n < 1 || n > 100) {
        setError("Enter a valid count (1-100).");
        return;
      }
      names = Array.from({ length: n }, (_, i) => pattern.replace("{n}", String(i + 1)));
    } else if (mode === "bulk-names") {
      names = namesText.split("\n").map((s) => s.trim()).filter(Boolean);
      if (names.length === 0) {
        setError("Enter at least one name.");
        return;
      }
      emails = emailsText.split("\n").map((s) => s.trim());
      phones = phonesText.split("\n").map((s) => s.trim());
      // Pad to match names length
      while (emails.length < names.length) emails.push("");
      while (phones.length < names.length) phones.push("");
    }

    setSubmitting(true);
    const result = await generateScannerPinsAction(eventId, names, emails, phones);
    setSubmitting(false);

    if (result.error || !result.success) {
      setError(result.error ?? "Could not generate PINs.");
      return;
    }

    setGeneratedPins(result.pins ?? []);
    setStaffName("");
    setStaffEmail("");
    setStaffPhone("");
    setCount("");
    setNamesText("");
    setEmailsText("");
    setPhonesText("");
    // Refresh pins list
    window.location.reload();
  }

  async function handleRevoke(pinId: string) {
    if (!confirm("Revoke this PIN? The door staff will no longer be able to scan.")) return;
    setSubmitting(true);
    const result = await revokeScannerPinAction(pinId, eventId);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPins((prev) => prev.map((p) => (p.id === pinId ? { ...p, isActive: false } : p)));
  }

  const activePins = pins.filter((p) => p.isActive);
  const inactivePins = pins.filter((p) => !p.isActive);

  return (
    <div className="glass rounded-3xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-violet-neon" />
        <h3 className="text-lg font-bold">Door Scanner PINs</h3>
      </div>
      <p className="text-sm text-muted">
        Generate 6-digit PINs for door staff. Staff enter the PIN at <span className="font-mono text-violet-neon">/scan</span> — no account needed. Each scan logs the staff member name.
      </p>

      {/* Mode selector */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${mode === "single" ? "bg-violet-neon text-white" : "border border-zinc-200 dark:border-white/10"}`}
        >
          Single PIN
        </button>
        <button
          type="button"
          onClick={() => setMode("bulk-count")}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${mode === "bulk-count" ? "bg-violet-neon text-white" : "border border-zinc-200 dark:border-white/10"}`}
        >
          Bulk by count
        </button>
        <button
          type="button"
          onClick={() => setMode("bulk-names")}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${mode === "bulk-names" ? "bg-violet-neon text-white" : "border border-zinc-200 dark:border-white/10"}`}
        >
          Paste names
        </button>
      </div>

      {/* Input area */}
      {mode === "single" ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Staff name *</label>
            <input
              type="text"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="e.g. Rahul - Gate 1"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
              disabled={submitting}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Email (optional)</label>
              <input
                type="email"
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder="rahul@example.com"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
                disabled={submitting}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Phone (optional)</label>
              <input
                type="tel"
                value={staffPhone}
                onChange={(e) => setStaffPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
                disabled={submitting}
              />
            </div>
          </div>
        </div>
      ) : mode === "bulk-count" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Count</label>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              placeholder="20"
              min={1}
              max={100}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Name pattern</label>
            <input
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Gate {n}"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
              disabled={submitting}
            />
            <p className="mt-1 text-[10px] text-muted">Use <code>{"{n}"}</code> for the number (1, 2, 3...)</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Staff names (one per line) *</label>
            <textarea
              value={namesText}
              onChange={(e) => setNamesText(e.target.value)}
              placeholder={"Rahul\nPriya\nAmit\nSneha"}
              rows={5}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
              disabled={submitting}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Emails (one per line, optional)</label>
              <textarea
                value={emailsText}
                onChange={(e) => setEmailsText(e.target.value)}
                placeholder={"rahul@example.com\npriya@example.com"}
                rows={5}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
                disabled={submitting}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Phones (one per line, optional)</label>
              <textarea
                value={phonesText}
                onChange={(e) => setPhonesText(e.target.value)}
                placeholder={"+91 98765 43210\n+91 98765 43211"}
                rows={5}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
                disabled={submitting}
              />
            </div>
          </div>
        </div>
      )}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button type="button" onClick={handleGenerate} disabled={submitting} loading={submitting} loadingText="Generating...">
        <Plus className="h-4 w-4" />
        Generate PIN{mode !== "single" ? "s" : ""}
      </Button>

      {/* Generated PINs (show after generation) */}
      {generatedPins && generatedPins.length > 0 ? (
        <div className="rounded-2xl border border-lime-neon/30 bg-lime-neon/5 p-4">
          <p className="mb-2 text-sm font-bold text-lime-neon">Generated PINs — share with door staff:</p>
          <div className="space-y-1">
            {generatedPins.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-white/50 px-3 py-1.5 dark:bg-white/5">
                <span className="text-sm font-semibold">{p.staffName}</span>
                <span className="font-mono text-lg font-black tracking-widest text-violet-neon">{p.pinCode}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-3 text-xs font-semibold text-violet-neon hover:underline"
          >
            Print PIN sheet
          </button>
        </div>
      ) : null}

      {/* Active PINs */}
      {activePins.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted" />
            <h4 className="text-sm font-bold">Active PINs ({activePins.length})</h4>
          </div>
          {activePins.map((pin) => (
            <div key={pin.id} className="flex items-center justify-between rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">{pin.staffName}</p>
                <p className="font-mono text-lg font-black tracking-widest text-violet-neon">{pin.pinCode}</p>
                {pin.staffEmail ? (
                  <p className="flex items-center gap-1 text-[10px] text-muted">
                    <Mail className="h-3 w-3" /> {pin.staffEmail}
                  </p>
                ) : null}
                {pin.staffPhone ? (
                  <p className="flex items-center gap-1 text-[10px] text-muted">
                    <Phone className="h-3 w-3" /> {pin.staffPhone}
                  </p>
                ) : null}
                {pin.lastUsedAt ? (
                  <p className="text-[10px] text-muted">Last used: {new Date(pin.lastUsedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
                ) : (
                  <p className="text-[10px] text-muted">Never used</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(pin.id)}
                disabled={submitting}
                className="rounded-xl p-2 text-red-500 hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No active PINs yet. Generate one above.</p>
      )}

      {/* Inactive PINs */}
      {inactivePins.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted hover:text-violet-neon">Revoked PINs ({inactivePins.length})</summary>
          <div className="mt-2 space-y-1">
            {inactivePins.map((pin) => (
              <div key={pin.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 dark:bg-white/5">
                <span className="text-muted line-through">{pin.staffName}</span>
                <span className="font-mono text-muted line-through">{pin.pinCode}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
