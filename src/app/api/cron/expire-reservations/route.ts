import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

import { expireReservedOrders } from "@/lib/data/orders";

// Must run on Node.js (not Edge)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron endpoint to expire stale RESERVED orders.
 *
 * Called every 1 minute by Vercel Cron or pg_cron.
 * Releases reserved inventory for orders whose 15-minute reservation window
 * has expired.
 *
 * Security: verifies CRON_SECRET header to prevent unauthorized calls.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }

  // Verify the authorization header using timing-safe comparison
  const authHeader = request.headers.get("authorization");
  const providedSecret = authHeader?.replace(/^Bearer\s+/i, "");

  if (!providedSecret) {
    console.warn("[cron] No authorization header provided");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const a = Buffer.from(providedSecret);
    const b = Buffer.from(cronSecret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      console.warn("[cron] Invalid secret provided");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    console.warn("[cron] Secret comparison failed");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const expiredCount = await expireReservedOrders();
    if (expiredCount > 0) {
      console.log(`[cron] Expired ${expiredCount} stale reserved orders`);
    }
    return NextResponse.json({
      status: "ok",
      expired_orders: expiredCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron] Expire reservations failed:", error);
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
