import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

import { getCronEnvironmentError } from "@/modules/shared/server";
import { logger } from "@/modules/shared/server";
import { reconcilePayments, reconcileRefunds } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron: payment/refund reconciliation - catches the captures and refund
 * finals the webhook never delivered (dropped deliveries, closed tabs).
 * Called hourly by Vercel Cron / GitHub Actions.
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
  if (!providedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
    const payments = await reconcilePayments();
    const refunds = await reconcileRefunds();
    logger.info({ payments, refunds }, "reconcile sweep complete");
    return NextResponse.json({
      status: "ok",
      payments,
      refunds,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "reconcile failed");
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}