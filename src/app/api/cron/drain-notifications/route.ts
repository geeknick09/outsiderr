import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

import { createServiceClient } from "@/modules/shared/server";
import { getCronEnvironmentError } from "@/modules/shared/server";
import { logger } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron endpoint to drain the notification outbox.
 *
 * Called every 5 minutes by GitHub Actions (see .github/workflows/cron.yml).
 * Claims due notification_outbox rows and delivers them to external channels
 * (push/email/whatsapp). While no provider env is configured the endpoint
 * skips claiming — rows expire automatically after 24h.
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

  // No external provider configured yet — the outbox still records intent and
  // rows expire after 24h. Flip on by setting one of these env vars.
  const hasPushProvider = Boolean(
    process.env.EXPO_ACCESS_TOKEN ?? process.env.FCM_SERVER_KEY ?? process.env.WEB_PUSH_PRIVATE_KEY,
  );
  if (!hasPushProvider) {
    return NextResponse.json({ status: "skipped", reason: "no external notification provider configured" });
  }

  try {
    const supabase = createServiceClient();
    const { data: claimed, error } = await supabase.rpc("claim_notification_outbox", { p_batch: 50 });
    if (error) throw new Error(error.message);

    let delivered = 0;
    let failedCount = 0;
    for (const row of claimed ?? []) {
      // Provider delivery lands with the push/email adapters (M3). Until then
      // this path is unreachable — hasPushProvider gate above.
      const ok = false;
      const err = "provider adapter not implemented";
      await supabase.rpc("complete_notification_outbox", {
        p_id: row.id,
        p_success: ok,
        p_error: ok ? null : err,
      });
      ok ? delivered++ : failedCount++;
    }

    logger.info({ claimed: claimed?.length ?? 0, delivered, failedCount }, "notification outbox drained");
    return NextResponse.json({
      status: "ok",
      claimed: claimed?.length ?? 0,
      delivered,
      failed: failedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "notification drain failed");
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
