import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

import { createServiceClient } from "@/modules/shared/server";
import { getCronEnvironmentError } from "@/modules/shared/server";
import { logger } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron endpoint to refresh analytics rollups.
 *
 * Called hourly by GitHub Actions (see .github/workflows/cron.yml).
 * Recomputes analytics.daily_metrics / user_activity_days / user_order_stats /
 * organizer_rollup / event_rollup / totals from the transactional tables.
 *
 * Security: verifies CRON_SECRET header (timing-safe comparison).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const envError = getCronEnvironmentError();
  if (!cronSecret || envError) {
    logger.error({ envError }, "cron environment missing");
    return NextResponse.json({ error: envError ?? "Cron not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  const providedSecret = authHeader?.replace(/^Bearer\s+/i, "");
  if (!providedSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const a = Buffer.from(providedSecret);
    const b = Buffer.from(cronSecret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    // ?full=1 forces a complete rebuild (weekly cron safety net).
    const full = new URL(request.url).searchParams.get("full") === "1";
    const { error } = await supabase.rpc("refresh_analytics_rollups", { p_days: 90, p_full: full });
    if (error) throw new Error(error.message);
    logger.info({ full }, "analytics rollups refreshed");
    return NextResponse.json({ status: "ok", full, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "analytics rollup refresh failed");
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
