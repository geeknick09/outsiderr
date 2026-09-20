import pino from "pino";

/**
 * Structured logger built on pino.
 *
 * Emits JSON to stdout in all environments. This is compatible with:
 * - Vercel Logs / Axiom / Logtail (production)
 * - Next.js dev server (no worker thread issues)
 * - Vitest (no transport needed)
 *
 * Use `logger.info()`, `logger.warn()`, `logger.error()` instead of console.*
 * Include context: `logger.info({ userId, eventId }, "event published")`
 *
 * For request-scoped logging, use `logger.child({ requestId, userId })`.
 *
 * NOTE: pino-pretty's worker thread transport conflicts with Next.js's
 * own worker threads in dev mode, so we use plain JSON output everywhere.
 * For local dev readability, pipe stdout through `pino-pretty` CLI:
 *   npm run dev | npx pino-pretty
 */

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  base: {
    service: "outsiderr",
    env: process.env.NODE_ENV ?? "development",
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    // Never log secrets or sensitive fields
    paths: [
      "*.password",
      "*.token",
      "*.secret",
      "*.apiKey",
      "*.razorpay_signature",
      "*.razorpay_key_secret",
      "*.webhook_secret",
      "*.service_role_key",
      "*.supabase_service_role_key",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
});

/**
 * Create a child logger with additional context.
 * Useful for request-scoped logging:
 *   const reqLogger = logger.child({ requestId, userId });
 *   reqLogger.info({ eventId }, "event published");
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Log an error with context. Use instead of console.error.
 * Automatically reports to Sentry if configured.
 */
export async function logError(
  error: Error | unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  logger.error(context, error instanceof Error ? error.message : String(error));
  // Report to Sentry if available
  try {
    const Sentry = await import("@sentry/nextjs");
    if (error instanceof Error) {
      Sentry.captureException(error, { extra: context });
    } else {
      Sentry.captureException(new Error(String(error)), { extra: context });
    }
  } catch {
    // Sentry not configured — structured log is enough
  }
}
