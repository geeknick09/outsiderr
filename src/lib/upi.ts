/** Builds a UPI intent string that any UPI app can parse from a QR code. */
export function upiIntent({
  upiId,
  payeeName,
  amountPaise,
  note,
}: {
  upiId: string;
  payeeName: string;
  amountPaise: number;
  note: string;
}): string {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: (amountPaise / 100).toFixed(2),
    cu: "INR",
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}
