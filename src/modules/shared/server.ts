import "server-only";

/**
 * modules/shared — SERVER-ONLY public API.
 *
 * Import via `@/modules/shared/server` from Server Components, Server Actions,
 * and route handlers. Never import from client components — this pulls in
 * `server-only` data access, the server Supabase client, the service-role
 * client, pino logger, and node SDKs.
 */

// ---- server Supabase clients + auth ----
export { createClient } from "./auth/server";
export { createServiceClient } from "./auth/service";
export { getCurrentUser } from "./auth/auth";
export type { CurrentUser } from "./auth/auth";
export { createBearerClient } from "./auth/bearer";
export { withApiContext, extractBearerToken, getApiContextToken } from "./auth/api-context";

// ---- data access (all files carry `import "server-only"`) ----
export * from "./data/boosts";
export * from "./data/box-office-pins";
export * from "./data/clubs";
export * from "./data/door-staff";
export * from "./data/engagement";
export * from "./data/event-orders";
export * from "./data/events";
export * from "./data/hero-boosts";
export * from "./data/notifications";
export * from "./data/orders";
export * from "./data/organizer-profile";
export * from "./data/organizers";
export * from "./data/platform-settings";
export * from "./data/profile";
export * from "./data/reviews";
export * from "./data/scanner-pins";
export * from "./data/tickets";
export * from "./data/waitlist";
export * from "./notifications";

// ---- server infra ----
export * from "./lib/logger";
export * from "./lib/audit";
export * from "./lib/backup";
export * from "./lib/cron";
export * from "./lib/razorpay";
export * from "./lib/razorpay-verify";
export * from "./lib/api";

// ---- orchestration services (shared by server actions + /api/v1 routes) ----
export * from "./services/orders";

// ---- server-only components ----
export { Navbar } from "./ui/layout/navbar";
