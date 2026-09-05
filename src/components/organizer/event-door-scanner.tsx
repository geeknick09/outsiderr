"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { CheckCircle2, CircleSlash, RotateCcw, XCircle } from "lucide-react";

import { checkInTicketAction } from "@/actions/orders";
import { Button } from "@/components/ui/button";
import type { ScanResult } from "@/lib/types";

const READER_ID = "outsiderr-qr-reader-event";

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

export function EventDoorScanner({
  eventId,
  eventTitle,
}: {
  eventId: string;
  eventTitle: string;
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);
  const cooldownRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualHash, setManualHash] = useState("");
  const [validating, setValidating] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [recentScans, setRecentScans] = useState<{ hash: string; outcome: string; time: string; holder?: string | null }[]>([]);

  const playBeep = useCallback((outcome: string) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (outcome === "VALID") {
        osc.frequency.value = 880; // High beep for valid
      } else {
        osc.frequency.value = 220; // Low beep for invalid/already used
      }
      gain.gain.value = 0.1;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
      osc.onended = () => ctx.close();
    } catch {
      // Audio not available — non-critical
    }
  }, []);

  const submitHash = useCallback(async (hash: string) => {
    if (busyRef.current || cooldownRef.current) return;
    busyRef.current = true;
    setValidating(true);
    const res = await checkInTicketAction(hash, eventId);
    setResult(res);
    playBeep(res.outcome);
    if (res.outcome === "VALID") setScanCount((c) => c + 1);
    setRecentScans((prev) =>
      [
        {
          hash: hash.slice(0, 16),
          outcome: String(res.outcome),
          time: new Date().toLocaleTimeString("en-IN"),
          holder: res.ticket?.holderName ?? null,
        },
        ...prev,
      ].slice(0, 10),
    );
    setValidating(false);
    cooldownRef.current = true;
    setTimeout(() => {
      cooldownRef.current = false;
    }, 3000);
    busyRef.current = false;
  }, [eventId, playBeep]);

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
    setError(null);
    setResult(null);
    try {
      const scanner = new Html5Qrcode(READER_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => {
          void submitHash(decoded);
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
  }, [submitHash]);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  const outcome = result ? OUTCOME_STYLES[result.outcome] : null;
  const OutcomeIcon = outcome?.icon;

  return (
    <div className="space-y-4">
      {/* Check-in counter */}
      <div className="glass flex items-center justify-between rounded-3xl p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Checked in
          </p>
          <p className="text-2xl font-black text-lime-neon">{scanCount}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Scanning for
          </p>
          <p className="text-sm font-bold">{eventTitle}</p>
        </div>
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
            <Button onClick={() => void start()}>
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
            <div className="mt-3 space-y-1.5 rounded-2xl bg-black/10 p-3 text-left dark:bg-white/5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Event</p>
              <p className="text-sm font-black">{result.ticket.eventTitle}</p>
              <div className="my-2 border-t border-black/10 dark:border-white/10" />
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Name</p>
              <p className="text-sm font-bold">{result.ticket.holderName ?? "—"}</p>
              {result.ticket.holderEmail ? (
                <>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wide text-muted">Email</p>
                  <p className="text-xs">{result.ticket.holderEmail}</p>
                </>
              ) : null}
              {result.ticket.holderPhone ? (
                <>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wide text-muted">Phone</p>
                  <p className="text-xs">{result.ticket.holderPhone}</p>
                </>
              ) : null}
              <div className="my-2 border-t border-black/10 dark:border-white/10" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Tier</p>
                  <p className="text-sm font-semibold">{result.ticket.tierName}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Pax</p>
                  <p className="text-lg font-black">{result.ticket.quantity}</p>
                </div>
              </div>
              {result.ticket.checkedInAt ? (
                <p className="mt-2 text-xs text-muted">
                  Checked in: {new Date(result.ticket.checkedInAt).toLocaleTimeString("en-IN")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <form
        className="glass flex gap-2 rounded-3xl p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (manualHash.trim()) void submitHash(manualHash.trim());
        }}
      >
        <input
          value={manualHash}
          onChange={(event) => setManualHash(event.target.value)}
          placeholder="Enter ticket hash manually"
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 font-mono text-xs outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
        <Button type="submit" variant="secondary" disabled={validating} loading={validating} loadingText="Checking…">
          Check in
        </Button>
      </form>

      {/* Recent scans */}
      {recentScans.length > 0 ? (
        <div className="glass rounded-3xl p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Recent scans
          </p>
          <div className="space-y-1.5">
            {recentScans.map((scan, i) => (
              <div
                key={`${scan.hash}-${i}`}
                className="flex items-center justify-between rounded-xl bg-black/5 px-3 py-2 text-xs dark:bg-white/5"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-[10px] text-muted">{scan.hash}…</p>
                  {scan.holder ? <p className="font-semibold">{scan.holder}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      scan.outcome === "VALID"
                        ? "font-bold text-emerald-600 dark:text-emerald-300"
                        : scan.outcome === "ALREADY_USED"
                        ? "font-bold text-amber-600 dark:text-amber-300"
                        : "font-bold text-red-600 dark:text-red-300"
                    }
                  >
                    {scan.outcome === "VALID" ? "✓" : scan.outcome === "ALREADY_USED" ? "↻" : "✕"}
                  </span>
                  <span className="text-[10px] text-muted">{scan.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
