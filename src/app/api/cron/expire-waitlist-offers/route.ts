import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

import { expireWaitlistOffers } from "@/modules/shared/server";
import { getCronEnvironmentError } from "@/modules/shared/server";
import { logger } from "@/modules/shared/server";

// Must run on Node.js (not Edge)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron endpoint to expire stale waitlist offers.
 *
 * Waitlist offers have a 24h window. When one lapses, this re-queues the entry
 * to the back of the queue (position = max+1) and auto-offers the freed ticket
 * to the next WAITING user — keeps the FIFO queue moving.
 *
 * Run every ~5–15 minutes (offers are 24h, so this doesn't need to be fast).
 *
 * Security: verifies CRON_SECRET header to prevent unauthorized calls.
 * Uses timing-safe comparison to prevent timing attacks.
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
    logger.warn("cron: no authorization header provided");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const a = Buffer.from(providedSecret);
    const b = Buffer.from(cronSecret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      logger.warn("cron: invalid secret provided");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    logger.warn("cron: secret comparison failed");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await expireWaitlistOffers();
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "expire waitlist offers failed");
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
