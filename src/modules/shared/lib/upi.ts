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

/** Validates a UPI ID format: name@bank (e.g. basement@upi, john.ok@okhdfcbank). */
export function validateUpiId(id: string): boolean {
  // UPI ID: 2-256 chars before @, 2-64 chars after @, alphanumeric + . - _
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/.test(id.trim());
}

/** Validates that a URL is a Google Maps link. */
export function isGoogleMapsLink(url: string): boolean {
  const lower = url.toLowerCase().trim();
  return (
    lower.startsWith("https://maps.google.com/") ||
    lower.startsWith("https://maps.app.goo.gl/") ||
    lower.startsWith("https://www.google.com/maps/") ||
    lower.startsWith("https://google.com/maps/")
  );
}
