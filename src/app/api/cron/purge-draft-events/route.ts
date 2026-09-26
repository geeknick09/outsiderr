import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

import { purgeOldDraftEvents } from "@/modules/shared/server";
import { getCronEnvironmentError } from "@/modules/shared/server";
import { logger } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron endpoint to permanently delete stale draft events.
 *
 * Drafts older than `draft_retention_days` (admin setting, default 60 —
 * measured from created_at) are removed entirely: the events row (children
 * cascade) plus their poster/teaser/gallery files in the storage bucket.
 * Organizers are warned at save time that abandoned drafts are purged.
 *
 * Run daily.
 *
 * Security: verifies CRON_SECRET header via timing-safe comparison.
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
    const result = await purgeOldDraftEvents();
    return NextResponse.json({
      status: "ok",
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "purge draft events failed");
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
