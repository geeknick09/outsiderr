import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

import { cleanupExpiredTeasers } from "@/modules/shared/server";
import { getCronEnvironmentError } from "@/modules/shared/server";
import { logger } from "@/modules/shared/server";

// Must run on Node.js (not Edge)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron endpoint to delete teaser videos for finished/cancelled events.
 *
 * Run daily by Vercel Cron or pg_cron. Removes the video object from the
 * event-media bucket and clears events.teaser_video_url so storage doesn't
 * accumulate dead teaser clips.
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

  // Verify the authorization header using timing-safe comparison
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
    const cleanedCount = await cleanupExpiredTeasers();
    if (cleanedCount > 0) {
      logger.info({ cleanedCount }, "deleted expired event teaser videos");
    }
    return NextResponse.json({
      status: "ok",
      cleaned_teasers: cleanedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "cleanup teasers failed");
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
