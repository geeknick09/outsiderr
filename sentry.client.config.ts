import * as Sentry from "@sentry/nextjs";

/**
 * Sentry client-side initialization.
 * Only activates when NEXT_PUBLIC_SENTRY_DSN is set.
 * Errors are silently dropped if no DSN is configured.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  debug: false,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
