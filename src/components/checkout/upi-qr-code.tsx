"use client";

import { QrCode } from "@/components/ui/qr-code";
import { upiIntent } from "@/lib/upi";

/**
 * Renders a UPI QR code dynamically from the organizer's UPI ID.
 * This is a client component because QrCode uses canvas (browser-only).
 */
export function UpiQrCode({
  upiId,
  payeeName,
  amountPaise,
  note,
  size = 160,
}: {
  upiId: string;
  payeeName: string;
  amountPaise: number;
  note: string;
  size?: number;
}) {
  const upiString = upiIntent({ upiId, payeeName, amountPaise, note });

  return (
    <div className="flex flex-col items-center gap-2">
      <QrCode
        value={upiString}
        size={size}
        className="rounded-xl bg-white p-1"
      />
      <p className="text-xs text-muted">Scan this QR with any UPI app to pay</p>
    </div>
  );
}
