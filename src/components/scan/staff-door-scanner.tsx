"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ScanLine,
  XCircle,
  X,
  History,
} from "lucide-react";

import { checkInTicketAction } from "@/actions/orders";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { formatDateRange } from "@/lib/format";
import type { ScanResult } from "@/lib/types";

interface StaffEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  organizerName: string;
}

interface ScanHistoryEntry {
  id: string;
  result: ScanResult;
  timestamp: string;
  qrHash: string;
}

export function StaffDoorScanner({
  events,
  initialCheckInCount = 0,
}: {
  events: StaffEvent[];
  initialCheckInCount?: number;
}) {
  const router = useRouter();
  const [selectedEventId, setSelectedEventId] = useState<string>(
    events[0]?.id ?? "",
  );
  const [scanning, setScanning] = useState(false);
  const [manualHash, setManualHash] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [checkInCount, setCheckInCount] = useState(initialCheckInCount);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  // Realtime: update check-in count when tickets change
  useRealtime({
    channelName: `staff-scan-tickets:${selectedEventId}`,
    table: "tickets",
    event: "UPDATE",
    filter: `event_id=eq.${selectedEventId}`,
    enabled: !!selectedEventId,
    onPayload: ({ new: row, old: oldRow }) => {
      if (row.status === "USED" && oldRow?.status !== "USED") {
        setCheckInCount((c) => c + 1);
      }
    },
  });

  // Play audio feedback
  const playSound = useCallback((type: "success" | "error") => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "success") {
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else {
        osc.frequency.value = 220;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch {
      // Audio not available
    }
  }, []);

  // Handle scan result
  const handleScanResult = useCallback(
    (result: ScanResult, qrHash: string) => {
      setLastResult(result);
      setScanHistory((prev) =>
        [
          {
            id: `${Date.now()}-${Math.random()}`,
            result,
            timestamp: new Date().toISOString(),
            qrHash,
          },
          ...prev,
        ].slice(0, 50),
      );

      if (result.outcome === "VALID") {
        playSound("success");
        setCheckInCount((c) => c + 1);
      } else {
        playSound("error");
      }
    },
    [playSound],
  );

  // Process QR hash
  const processHash = useCallback(
    async (hash: string) => {
      if (!hash.trim() || !selectedEventId) return;
      setError(null);
      const result = await checkInTicketAction(hash.trim(), selectedEventId);
      handleScanResult(result, hash.trim());
    },
    [selectedEventId, handleScanResult],
  );

  // Initialize camera scanner
  useEffect(() => {
    if (!scanning || !selectedEventId) return;

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let html5QrCode: any = null;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        const elementId = "staff-qr-reader";
        html5QrCode = new Html5Qrcode(elementId);

        scannerRef.current = {
          start: () => {},
          stop: async () => {
            try {
              await html5QrCode?.stop();
              await html5QrCode?.clear();
            } catch {
              // ignore
            }
          },
        };

        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            processHash(decodedText);
          },
          () => {},
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? `Camera error: ${err.message}`
            : "Could not access camera.",
        );
      }
    })();

    return () => {
      cancelled = true;
      if (html5QrCode) {
        try {
          html5QrCode.stop().then(() => html5QrCode.clear()).catch(() => {});
        } catch {
          // ignore
        }
      }
    };
  }, [scanning, selectedEventId, processHash]);

  // Reset state when event changes
  useEffect(() => {
    setLastResult(null);
    setScanHistory([]);
    setError(null);
    setCheckInCount(0);
    // Fetch initial check-in count
    if (selectedEventId) {
      router.refresh();
    }
  }, [selectedEventId, router]);

  const rejectedScans = scanHistory.filter((s) => s.result.outcome === "INVALID");
  const alreadyCheckedIn = scanHistory.filter(
    (s) => s.result.outcome === "ALREADY_USED",
  );

  if (events.length === 0) {
    return (
      <div className="glass rounded-3xl p-8 text-center">
        <ScanLine className="mx-auto h-12 w-12 text-muted" />
        <p className="mt-4 text-sm text-muted">
          No events assigned to you for scanning. Please contact the organizer.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Event selector */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Select event
          </span>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title} — {event.organizerName}
              </option>
            ))}
          </select>
        </label>
        {selectedEvent ? (
          <div className="text-xs text-muted">
            <p>{formatDateRange(selectedEvent.startsAt, selectedEvent.endsAt)}</p>
            {selectedEvent.status === "POSTPONED" ? (
              <p className="mt-1 text-amber-500">⚠ This event has been postponed</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Check-in counter */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-2xl p-4 text-center">
          <CheckCircle2 className="mx-auto h-5 w-5 text-lime-neon" />
          <p className="mt-1 text-2xl font-black text-lime-neon">{checkInCount}</p>
          <p className="text-[10px] text-muted">Checked in</p>
        </div>
        <div className="glass rounded-2xl p-4 text-center">
          <XCircle className="mx-auto h-5 w-5 text-red-500" />
          <p className="mt-1 text-2xl font-black text-red-500">{rejectedScans.length}</p>
          <p className="text-[10px] text-muted">Rejected</p>
        </div>
        <div className="glass rounded-2xl p-4 text-center">
          <Clock className="mx-auto h-5 w-5 text-amber-500" />
          <p className="mt-1 text-2xl font-black text-amber-500">{alreadyCheckedIn.length}</p>
          <p className="text-[10px] text-muted">Already in</p>
        </div>
      </div>

      {/* Scanner */}
      <div className="glass rounded-3xl p-4 space-y-3">
        {error ? (
          <div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-500">
            {error}
          </div>
        ) : null}

        <div
          id="staff-qr-reader"
          className="overflow-hidden rounded-2xl bg-black"
          style={{ display: scanning ? "block" : "none" }}
        />

        {!scanning ? (
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neon-gradient px-5 py-3 text-sm font-bold text-white shadow-glow-violet transition-opacity hover:opacity-90"
          >
            <ScanLine className="h-5 w-5" />
            Start scanning
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setScanning(false);
              scannerRef.current?.stop();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-bold dark:border-white/10"
          >
            <X className="h-5 w-5" />
            Stop scanning
          </button>
        )}

        {/* Manual entry */}
        <div className="flex gap-2">
          <input
            type="text"
            value={manualHash}
            onChange={(e) => setManualHash(e.target.value)}
            placeholder="Enter ticket code manually"
            className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                processHash(manualHash);
                setManualHash("");
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              processHash(manualHash);
              setManualHash("");
            }}
            className="rounded-2xl bg-violet-neon px-4 py-2.5 text-sm font-bold text-white"
          >
            Check
          </button>
        </div>
      </div>

      {/* Last scan result */}
      {lastResult ? (
        <div
          className={`glass rounded-3xl p-4 border-2 ${
            lastResult.outcome === "VALID"
              ? "border-lime-neon/50"
              : lastResult.outcome === "ALREADY_USED"
              ? "border-amber-500/50"
              : "border-red-500/50"
          }`}
        >
          <div className="flex items-start gap-3">
            {lastResult.outcome === "VALID" ? (
              <CheckCircle2 className="h-6 w-6 shrink-0 text-lime-neon" />
            ) : lastResult.outcome === "ALREADY_USED" ? (
              <Clock className="h-6 w-6 shrink-0 text-amber-500" />
            ) : (
              <AlertCircle className="h-6 w-6 shrink-0 text-red-500" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={`font-bold ${
                  lastResult.outcome === "VALID"
                    ? "text-lime-neon"
                    : lastResult.outcome === "ALREADY_USED"
                    ? "text-amber-500"
                    : "text-red-500"
                }`}
              >
                {lastResult.outcome === "VALID"
                  ? "Checked in successfully"
                  : lastResult.outcome === "ALREADY_USED"
                  ? "Already checked in"
                  : "Invalid ticket"}
              </p>
              <p className="text-sm text-muted">{lastResult.message}</p>
              {lastResult.ticket ? (
                <div className="mt-2 space-y-1 text-sm">
                  {lastResult.ticket.holderName ? (
                    <p><strong>Name:</strong> {lastResult.ticket.holderName}</p>
                  ) : null}
                  {lastResult.ticket.holderEmail ? (
                    <p className="text-muted"><strong>Email:</strong> {lastResult.ticket.holderEmail}</p>
                  ) : null}
                  {lastResult.ticket.holderPhone ? (
                    <p className="text-muted"><strong>Phone:</strong> {lastResult.ticket.holderPhone}</p>
                  ) : null}
                  <p className="text-muted"><strong>Tier:</strong> {lastResult.ticket.tierName}</p>
                  <p className="text-muted"><strong>Quantity:</strong> {lastResult.ticket.quantity}</p>
                  {lastResult.ticket.checkedInAt ? (
                    <p className="text-muted">
                      <strong>Checked in at:</strong>{" "}
                      {new Date(lastResult.ticket.checkedInAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Scan history */}
      {scanHistory.length > 0 ? (
        <div className="glass rounded-3xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted" />
            <h3 className="text-sm font-bold">Recent scans ({scanHistory.length})</h3>
            <button
              type="button"
              onClick={() => setScanHistory([])}
              className="ml-auto text-xs text-muted hover:text-violet-neon"
            >
              Clear
            </button>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {scanHistory.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center gap-2 rounded-xl p-2 text-xs ${
                  entry.result.outcome === "VALID"
                    ? "bg-lime-neon/10"
                    : entry.result.outcome === "ALREADY_USED"
                    ? "bg-amber-500/10"
                    : "bg-red-500/10"
                }`}
              >
                {entry.result.outcome === "VALID" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-lime-neon" />
                ) : entry.result.outcome === "ALREADY_USED" ? (
                  <Clock className="h-4 w-4 shrink-0 text-amber-500" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {entry.result.ticket?.holderName ?? "Unknown"}
                  </p>
                  <p className="truncate text-muted">
                    {entry.result.ticket?.tierName ?? "—"} ·{" "}
                    {new Date(entry.timestamp).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </p>
                </div>
                <span className="font-mono text-[10px] text-muted">
                  {entry.qrHash.slice(0, 8)}…
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
