"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Clock, MapPin, Printer, Ticket as TicketIcon, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { QrCode } from "@/components/ui/qr-code";
import { DownloadQrButton } from "@/components/ui/download-qr-button";
import { formatDateTime, isPast } from "@/lib/format";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TicketCard({ ticket }: { ticket: Ticket }) {
  const [expanded, setExpanded] = useState(false);
  const expired = isPast(ticket.startsAt);
  const used = ticket.status === "USED";
  const cancelled = ticket.status === "CANCELLED";
  const void_ = ticket.status === "VOID";
  const notOpenable = expired || cancelled || void_;

  // Status badge logic
  const badgeTone = expired || cancelled || void_ ? "neutral" : used ? "success" : "success";
  const badgeLabel = expired
    ? "Expired"
    : cancelled
    ? "Cancelled"
    : void_
    ? "Void"
    : used
    ? "Scanned"
    : "Valid";

  return (
    <>
      {/* Compact card */}
      <button
        type="button"
        onClick={() => !notOpenable && setExpanded(true)}
        disabled={notOpenable}
        className={cn(
          "glass flex w-full flex-col gap-4 rounded-3xl p-4 text-left transition-all",
          notOpenable
            ? "cursor-not-allowed opacity-50 grayscale"
            : "cursor-pointer hover:border-violet-neon/50 hover:shadow-[0_0_20px_rgba(139,92,246,0.25)]",
        )}
      >
        <div className="flex gap-4">
          <div className="relative shrink-0">
            <QrCode
              value={ticket.qrHash}
              size={104}
              className="h-26 rounded-xl bg-white p-1.5"
            />
            {expired ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                <span className="rotate-[-20deg] rounded-md bg-red-500/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                  Expired
                </span>
              </div>
            ) : null}
            {cancelled ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
                <span className="rotate-[-20deg] rounded-md bg-red-600/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                  Cancelled
                </span>
              </div>
            ) : null}
            {void_ ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                <span className="rotate-[-20deg] rounded-md bg-zinc-600/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                  Void
                </span>
              </div>
            ) : null}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-bold">{ticket.eventTitle}</p>
            <p className="text-xs text-muted">{ticket.tierName}</p>
            <p className="text-xs text-muted">{formatDateTime(ticket.startsAt)}</p>
            <p className="truncate text-xs text-muted">{ticket.venueName}</p>
            <Badge tone={badgeTone as "success" | "neutral"}>{badgeLabel}</Badge>
          </div>
        </div>
        <p
          className={cn(
            "text-center text-xs font-semibold",
            notOpenable ? "text-muted" : "text-violet-neon",
          )}
        >
          {expired ? "Event has ended" : cancelled ? "Event cancelled" : void_ ? "Ticket voided" : "Tap to view full ticket"}
        </p>
      </button>

      {/* Expanded modal overlay — only for non-expired/non-cancelled tickets */}
      {expanded && !notOpenable ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
        >
          <div
            className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Header band */}
            <div className="bg-neon-gradient px-6 py-4 text-white">
              <p className="text-xs font-bold uppercase tracking-widest opacity-80">Outsiderr</p>
              <p className="text-lg font-black leading-tight">{ticket.eventTitle}</p>
            </div>

            {/* QR section */}
            <div className="flex flex-col items-center px-6 py-6">
              <div className="rounded-2xl bg-white p-4 shadow-lg">
                <QrCode value={ticket.qrHash} size={220} className="rounded-lg" />
              </div>
              <p className="mt-3 font-mono text-[10px] text-muted">
                {ticket.qrHash.slice(0, 24)}…
              </p>
              <Badge tone={used ? "success" : "success"} className="mt-3">
                {used ? "Scanned" : "Valid"}
              </Badge>
            </div>

            {/* Details */}
            <div className="space-y-3 border-t border-zinc-200 px-6 py-5 dark:border-white/10">
              <DetailRow icon={TicketIcon} label="Tier" value={ticket.tierName} />
              <DetailRow icon={CalendarDays} label="Date & Time" value={formatDateTime(ticket.startsAt)} />
              <DetailRow icon={MapPin} label="Venue" value={ticket.venueName} />
              {ticket.checkedInAt ? (
                <DetailRow
                  icon={Clock}
                  label="Checked in"
                  value={formatDateTime(ticket.checkedInAt)}
                />
              ) : null}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 dark:border-white/10">
              <DownloadQrButton
                qrHash={ticket.qrHash}
                filename={`ticket-${ticket.id.slice(0, 8)}.png`}
              />
              <Link
                href={`/tickets/${ticket.id}/print`}
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700"
              >
                <Printer className="h-4 w-4" />
                Print ticket
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-neon" />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="text-sm font-medium text-zinc-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}
