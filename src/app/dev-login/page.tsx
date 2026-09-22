import { notFound } from "next/navigation";

import { DevLoginPanel } from "./dev-login-panel";

export const dynamic = "force-dynamic";

/**
 * DEV-ONLY test login — instant sign-in as seeded test users (no magic link /
 * OAuth roundtrip). Hard-404s in production builds.
 */
export default function DevLoginPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="mb-4 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-300">
        ⚠️ DEV-ONLY — test sign-in. Never available in production.
      </div>
      <h1 className="text-3xl font-black tracking-tight">Dev Login</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Pick a seeded role — creates a real session (no email verification).
      </p>
      <DevLoginPanel />
    </div>
  );
}
