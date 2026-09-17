import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook — runs once on server startup.
 * Loads Sentry server config if available.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export function onRequestError(err: unknown, request: Request, context: { routePath?: string; routeType?: string; routerKind?: string } = {}) {
  const requestInfo = {
    path: new URL(request.url).pathname,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
  };

  Sentry.captureRequestError(err, requestInfo, {
    routerKind: context.routerKind ?? "app",
    routePath: context.routePath ?? requestInfo.path,
    routeType: context.routeType ?? "route",
  });
}
