"use client";

import { useState } from "react";
import { Plus, Store, Trash2, Users } from "lucide-react";

import { generateBoxOfficePinsAction, revokeBoxOfficePinAction } from "@/actions/box-office";
import { Button } from "@/modules/shared";
import type { BoxOfficePin } from "@/modules/shared";

export function BoxOfficePinManager({
  eventId,
  pins: initialPins,
}: {
  eventId: string;
  pins: BoxOfficePin[];
}) {
  const [pins, setPins] = useState<BoxOfficePin[]>(initialPins);
  const [mode, setMode] = useState<"single" | "bulk-count" | "bulk-names">("single");
  const [staffName, setStaffName] = useState("");
  const [count, setCount] = useState("");
  const [pattern, setPattern] = useState("Counter {n}");
  const [namesText, setNamesText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPins, setGeneratedPins] = useState<{ pinCode: string; staffName: string }[] | null>(null);

  async function handleGenerate() {
    setError(null);
    setGeneratedPins(null);

    let names: string[] = [];
    if (mode === "single") {
      if (!staffName.trim()) {
        setError("Staff name is required.");
        return;
      }
      names = [staffName.trim()];
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
    }

    setSubmitting(true);
    const result = await generateBoxOfficePinsAction(eventId, names, "ORGANIZER");
    setSubmitting(false);

    if (result.error || !result.success) {
      setError(result.error ?? "Could not generate PINs.");
      return;
    }

    setGeneratedPins(result.pins ?? []);
    setStaffName("");
    setCount("");
    setNamesText("");
    window.location.reload();
  }

  async function handleRevoke(pinId: string) {
    if (!confirm("Revoke this PIN? The box office staff will no longer be able to generate tickets.")) return;
    setSubmitting(true);
    const result = await revokeBoxOfficePinAction(pinId, eventId);
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
        <Store className="h-5 w-5 text-violet-neon" />
        <h3 className="text-lg font-bold">Box Office PINs</h3>
      </div>
      <p className="text-sm text-muted">
        Generate 6-digit PINs for box office staff. Staff enter the PIN at <span className="font-mono text-violet-neon">/organizer/box-office</span> to register walk-in attendees and generate tickets. No account needed.
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
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Staff name</label>
          <input
            type="text"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            placeholder="e.g. Rahul - Counter 1"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
            disabled={submitting}
          />
        </div>
      ) : mode === "bulk-count" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Count</label>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              placeholder="10"
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
              placeholder="Counter {n}"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
              disabled={submitting}
            />
            <p className="mt-1 text-[10px] text-muted">Use <code>{"{n}"}</code> for the number (1, 2, 3...)</p>
          </div>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Staff names (one per line)</label>
          <textarea
            value={namesText}
            onChange={(e) => setNamesText(e.target.value)}
            placeholder={"Rahul\nPriya\nAmit"}
            rows={5}
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
            disabled={submitting}
          />
        </div>
      )}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button type="button" onClick={handleGenerate} disabled={submitting} loading={submitting} loadingText="Generating...">
        <Plus className="h-4 w-4" />
        Generate PIN{mode !== "single" ? "s" : ""}
      </Button>

      {/* Generated PINs */}
      {generatedPins && generatedPins.length > 0 ? (
        <div className="rounded-2xl border border-lime-neon/30 bg-lime-neon/5 p-4">
          <p className="mb-2 text-sm font-bold text-lime-neon">Generated PINs — share with box office staff:</p>
          <div className="space-y-1">
            {generatedPins.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-white/50 px-3 py-1.5 dark:bg-white/5">
                <span className="text-sm font-semibold">{p.staffName}</span>
                <span className="font-mono text-lg font-black tracking-widest text-violet-neon">{p.pinCode}</span>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => window.print()} className="mt-3 text-xs font-semibold text-violet-neon hover:underline">
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
              <div>
                <p className="text-sm font-semibold">{pin.staffName}</p>
                <p className="font-mono text-lg font-black tracking-widest text-violet-neon">{pin.pinCode}</p>
                {pin.lastUsedAt ? (
                  <p className="text-[10px] text-muted">Last used: {new Date(pin.lastUsedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
                ) : (
                  <p className="text-[10px] text-muted">Never used</p>
                )}
              </div>
              <button type="button" onClick={() => handleRevoke(pin.id)} disabled={submitting} className="rounded-xl p-2 text-red-500 hover:bg-red-500/10">
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
