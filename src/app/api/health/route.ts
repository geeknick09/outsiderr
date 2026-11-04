import { NextResponse } from "next/server";

import { logger } from "@/modules/shared/server";

export const dynamic = "force-dynamic";

const startTime = Date.now();

/**
 * Deep health check endpoint.
 *
 * Checks connectivity to critical dependencies:
 * - Supabase database (via a simple query)
 * - Razorpay API (via a fetch to the API base)
 *
 * Returns 200 if all deps are healthy, 503 if any are degraded.
 * Used by uptime monitors (UptimeRobot, Vercel monitors, etc.)
 */
export async function GET() {
  const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

  // Check Supabase database connectivity — a REAL query, not a reachability
  // ping: /rest/v1/ answers in ~400ms even while Postgres is still resuming,
  // so only an actual table read proves the DB path is warm. This also keeps
  // the compute warm when a cron pings this endpoint periodically.
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      checks.supabase = { status: "degraded", error: "Supabase env vars not set" };
    } else {
      const start = Date.now();
      const res = await fetch(`${supabaseUrl}/rest/v1/events?select=id&limit=1`, {
        method: "GET",
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        signal: AbortSignal.timeout(15000),
      });
      checks.supabase = {
        status: res.ok ? "ok" : "degraded",
        latencyMs: Date.now() - start,
        ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
      };
    }
  } catch (e) {
    checks.supabase = { status: "down", error: e instanceof Error ? e.message : "unknown" };
  }

  // Check Razorpay API connectivity (only if configured)
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    if (!keyId) {
      checks.razorpay = { status: "skipped", error: "RAZORPAY_KEY_ID not set" };
    } else {
      const start = Date.now();
      // Razorpay API responds with 401 for unauthenticated requests,
      // which still proves the API is reachable
      const res = await fetch("https://api.razorpay.com/v1/payments", {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      checks.razorpay = {
        // 401 is expected without auth - it means the API is up
        status: res.status === 401 || res.ok ? "ok" : "degraded",
        latencyMs: Date.now() - start,
      };
    }
  } catch (e) {
    checks.razorpay = { status: "down", error: e instanceof Error ? e.message : "unknown" };
  }

  const allOk = Object.values(checks).every((c) => c.status === "ok" || c.status === "skipped");
  const httpStatus = allOk ? 200 : 503;

  const response = {
    status: allOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
  };

  if (!allOk) {
    logger.warn({ checks }, "health check degraded");
  }

  return NextResponse.json(response, { status: httpStatus });
}
