import * as Sentry from "@sentry/nextjs";

/**
 * Sentry edge runtime initialization (middleware).
 * Only activates when SENTRY_DSN is set.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? "",
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  debug: false,
  enabled: !!process.env.SENTRY_DSN,
});
