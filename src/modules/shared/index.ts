/**
 * modules/shared — CLIENT-SAFE public API.
 *
 * Re-exports only modules that are safe to import from client components:
 * presentational/client components, types, constants, pure helpers, hooks.
 * Anything server-only (data access, server auth, logger, node SDKs) lives in
 * `./server.ts` — import it via `@/modules/shared/server`.
 *
 * Server component(s) that fetch (e.g. Navbar) are exported from `server.ts`.
 */

// ---- types (type-only; erased at runtime) ----
export type * from "./lib/types";
export type * from "./lib/types/scanner-pins";
export type * from "./lib/types/box-office-pins";
export type * from "./db/database.types";
export type { CurrentUser } from "./auth/auth";

// ---- constants & pure helpers ----
export * from "./lib/constants";
export * from "./lib/format";
export * from "./lib/datetime";
export * from "./lib/utils";
export * from "./lib/pricing";
export * from "./lib/phases";
export * from "./lib/validation";
export * from "./lib/upi";
export * from "./lib/event-lifecycle";
export * from "./lib/organizer-eligibility";
export * from "./lib/rate-limit";

// ---- client-side upload + supabase browser client + env config ----
export * from "./lib/upload";
export { createClient } from "./auth/client";
export * from "./auth/config";

// ---- hooks ----
export * from "./hooks/use-realtime";

// ---- UI primitives (client + presentational) ----
export * from "./ui/ui/badge";
export * from "./ui/ui/branded-loader";
export * from "./ui/ui/button";
export * from "./ui/ui/download-qr-button";
export * from "./ui/ui/image-cropper";
export * from "./ui/ui/instagram-icon";
export * from "./ui/ui/modal";
export * from "./ui/ui/navigation-progress";
export * from "./ui/ui/phone-input";
export * from "./ui/ui/qr-code";
export * from "./ui/ui/skeleton";
export * from "./ui/ui/submit-button";
export * from "./ui/ui/whatsapp-icon";

// ---- layout (presentational / client) — Navbar is server, see server.ts ----
export * from "./ui/layout/footer";
export * from "./ui/layout/location-selector";
export * from "./ui/layout/notification-bell";
export * from "./ui/layout/theme-logo";
export * from "./ui/layout/user-menu";

// ---- theme + pwa + auth ----
export * from "./ui/theme/theme-provider";
export * from "./ui/theme/theme-toggle";
export * from "./ui/pwa/push-subscribe";
export * from "./ui/pwa/register-sw";
export * from "./ui/auth/login-panel";
// ---- community UI (cross-domain: used by organizer dashboard + public web) ----
export * from "./ui/community/club-form";
export * from "./ui/community/club-members-panel";
export * from "./ui/payment/razorpay-checkout";
