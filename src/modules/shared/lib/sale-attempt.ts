export interface SaleAttempt {
  key: string;
  fingerprint: string;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Idempotency key for a counter sale. Retries of the same sale reuse the key,
 * so a double-click or a dropped response cannot create a second ticket.
 * Changing any sale input (tier, buyer, mode...) starts a fresh sale.
 */
export function nextSaleAttempt(
  prev: SaleAttempt | null,
  fingerprint: string,
  makeKey: () => string = () => crypto.randomUUID(),
): SaleAttempt {
  if (prev && prev.fingerprint === fingerprint) return prev;
  return { key: makeKey(), fingerprint };
}
