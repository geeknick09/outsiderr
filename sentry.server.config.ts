import * as Sentry from "@sentry/nextjs";

/**
 * Sentry server-side initialization.
 * Only activates when SENTRY_DSN is set (server-only env var).
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? "",
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  debug: false,
  enabled: !!process.env.SENTRY_DSN,
});
