import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

import { runBackup } from "@/lib/backup";
import { getCronEnvironmentError } from "@/lib/cron";
import { logger } from "@/lib/logger";

// Must run on Node.js (not Edge) — needs zlib for gzip
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Backups can take a while on large databases
export const maxDuration = 300; // 5 minutes

/**
 * Cron endpoint to run a database backup.
 *
 * Called by Vercel Cron (or external scheduler) with:
 *   GET /api/cron/backup?type=daily   — daily backup (keep last 7)
 *   GET /api/cron/backup?type=weekly  — weekly backup (keep last 4)
 *
 * Security: verifies CRON_SECRET header to prevent unauthorized calls.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * Vercel Cron config (vercel.json):
 *   {
 *     "crons": [
 *       { "path": "/api/cron/backup?type=daily", "schedule": "0 2 * * *" },
 *       { "path": "/api/cron/backup?type=weekly", "schedule": "0 3 * * 0" }
 *     ]
 *   }
 *
 * Daily at 2 AM, weekly at 3 AM on Sundays.
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
    logger.warn("backup cron: no authorization header");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const a = Buffer.from(providedSecret);
    const b = Buffer.from(cronSecret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      logger.warn("backup cron: invalid secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    logger.warn("backup cron: secret comparison failed");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse backup type from query string
  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "weekly" ? "weekly" : "daily";

  const result = await runBackup(type);

  if (result.success) {
    logger.info(result, "backup cron: success");
    return NextResponse.json({
      status: "ok",
      type,
      ...result,
    });
  } else {
    logger.error(result, "backup cron: failed");
    return NextResponse.json(
      {
        status: "error",
        type,
        ...result,
      },
      { status: 500 },
    );
  }
}
