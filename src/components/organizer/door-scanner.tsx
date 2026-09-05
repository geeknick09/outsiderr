"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { CheckCircle2, CircleSlash, RotateCcw, XCircle } from "lucide-react";

import { checkInTicketAction } from "@/actions/orders";
import { Button } from "@/components/ui/button";
import type { ScanResult } from "@/lib/types";

const READER_ID = "outsiderr-qr-reader";

const OUTCOME_STYLES = {
  VALID: {
    icon: CheckCircle2,
    title: "VALID — Checked In",
    className: "border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  },
  ALREADY_USED: {
    icon: CircleSlash,
    title: "ALREADY USED",
    className: "border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-300",
  },
  INVALID: {
    icon: XCircle,
    title: "INVALID",
    className: "border-red-500/50 bg-red-500/15 text-red-600 dark:text-red-300",
  },
} as const;

interface ScannerEvent {
  id: string;
  title: string;
}

export function DoorScanner({ events }: { events: ScannerEvent[] }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);
  const cooldownRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualHash, setManualHash] = useState("");
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const [validating, setValidating] = useState(false);

  const submitHash = useCallback(async (hash: string, eventId: string) => {
    if (busyRef.current || cooldownRef.current) return;
    if (!eventId) {
      setError("Select an event first.");
      return;
    }
    busyRef.current = true;
    setValidating(true);
    setResult(await checkInTicketAction(hash, eventId));
    setValidating(false);
    // Cooldown: prevent immediate re-scan for 3 seconds
    cooldownRef.current = true;
    setTimeout(() => {
      cooldownRef.current = false;
    }, 3000);
    busyRef.current = false;
  }, []);

  const stop = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      await scanner.stop();
      await scanner.clear();
    } catch {
      // Scanner was already stopped.
    }
    scannerRef.current = null;
    setScanning(false);
  }, []);

  const start = useCallback(async () => {
    if (!selectedEventId) {
      setError("Select an event first.");
      return;
    }
    setError(null);
    setResult(null);
    try {
      const scanner = new Html5Qrcode(READER_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => {
          void submitHash(decoded, selectedEventId);
        },
        () => {
          // Ignore per-frame decode misses.
        },
      );
      setScanning(true);
    } catch (startError) {
      scannerRef.current = null;
      setError(
        startError instanceof Error
          ? startError.message
          : "Could not access the camera.",
      );
    }
  }, [submitHash, selectedEventId]);

  // Restart scanner when event changes
  useEffect(() => {
    if (scanning) {
      void stop();
    }
    setResult(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  const outcome = result ? OUTCOME_STYLES[result.outcome] : null;
  const OutcomeIcon = outcome?.icon;

  return (
    <div className="space-y-4">
      {/* Event selector */}
      <div className="glass rounded-3xl p-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Select event to scan
          </span>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {events.length === 0 ? (
              <option value="">No published events</option>
            ) : (
              events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      <div className="glass overflow-hidden rounded-3xl p-4">
        <div
          id={READER_ID}
          className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-black/40"
        />
        <div className="mt-4 flex justify-center gap-2">
          {scanning ? (
            <Button variant="secondary" onClick={() => void stop()}>
              Stop camera
            </Button>
          ) : (
            <Button onClick={() => void start()} disabled={!selectedEventId}>
              Start camera
            </Button>
          )}
          {result ? (
            <Button variant="ghost" onClick={() => setResult(null)}>
              <RotateCcw className="h-4 w-4" />
              Scan next
            </Button>
          ) : null}
        </div>
        {error ? <p className="mt-3 text-center text-sm text-red-500">{error}</p> : null}
      </div>

      {/* Validating indicator */}
      {validating ? (
        <div className="glass rounded-3xl p-5 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-violet-neon border-t-transparent" />
          <p className="mt-2 text-sm text-muted">Validating ticket…</p>
        </div>
      ) : null}

      {outcome && OutcomeIcon && result ? (
        <div className={`rounded-3xl border p-5 text-center ${outcome.className}`}>
          <OutcomeIcon className="mx-auto h-10 w-10" />
          <p className="mt-2 text-lg font-black">{outcome.title}</p>
          <p className="text-sm">{result.message}</p>
          {result.ticket ? (
            <p className="mt-1 text-xs">
              {result.ticket.eventTitle} · {result.ticket.tierName}
              {result.ticket.holderName ? ` · ${result.ticket.holderName}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <form
        className="glass flex gap-2 rounded-3xl p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (manualHash.trim() && selectedEventId) void submitHash(manualHash.trim(), selectedEventId);
        }}
      >
        <input
          value={manualHash}
          onChange={(event) => setManualHash(event.target.value)}
          placeholder="Enter ticket hash manually"
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 font-mono text-xs outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
        <Button type="submit" variant="secondary" disabled={!selectedEventId || validating} loading={validating} loadingText="Checking…">
          Check in
        </Button>
      </form>
    </div>
  );
}
