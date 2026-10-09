import { z } from "zod";

import { apiError, apiOk, readJson, withApiUser } from "@/modules/shared/server";
import { createClient } from "@/modules/shared/auth/server";
import { getPromoterDashboard } from "@/modules/shared/server";
import { rateLimit, getRateLimitIdentifier } from "@/modules/shared";
import { headers } from "next/headers";

const registerSchema = z.object({
  eventId: z.string().uuid(),
});

const payoutSchema = z.object({
  accountName: z.string().min(2).max(200),
  accountNumber: z.string().regex(/^\d{9,18}$/),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/i),
  upiId: z.string().max(64).optional().nullable(),
});

/**
 * GET /api/v1/promoters — the caller's promoter dashboard bundle.
 * Auth: Bearer <supabase-access-token>
 */
export async function GET(request: Request) {
  return withApiUser(request, async (user) => {
    const dashboard = await getPromoterDashboard(user);
    return apiOk(dashboard);
  });
}

/**
 * POST /api/v1/promoters — register as a promoter for an event.
 * Body: { eventId } → { mode, slug | code }
 * Auth: Bearer <supabase-access-token>
 */
export async function POST(request: Request) {
  return withApiUser(request, async (user) => {
    const h = await headers();
    const rl = rateLimit(`promoter-register:${getRateLimitIdentifier(h)}`, { maxRequests: 20, windowMs: 60_000 });
    if (rl.limited) return apiError("Too many requests.", 429);

    const parsed = await readJson(request, registerSchema);
    if ("response" in parsed) return parsed.response;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("register_event_promoter", {
      p_event_id: parsed.data.eventId,
    });
    if (error) return apiError(error.message, 400);
    return apiOk(data);
  });
}

/**
 * PUT /api/v1/promoters — save payout bank + PAN details.
 * Auth: Bearer <supabase-access-token>
 */
export async function PUT(request: Request) {
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, payoutSchema);
    if ("response" in parsed) return parsed.response;

    const { createServiceClient } = await import("@/modules/shared/server");
    const supabase = createServiceClient();
    const { data: promoter } = await supabase
      .from("promoters")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!promoter) return apiError("Promote an event first.", 400);

    const { error } = await supabase.from("promoters").update({
      payout_account_name: parsed.data.accountName,
      payout_account_number: parsed.data.accountNumber,
      payout_ifsc: parsed.data.ifsc.toUpperCase(),
      payout_pan: parsed.data.pan.toUpperCase(),
      upi_id: parsed.data.upiId ?? null,
    }).eq("id", promoter.id);
    if (error) return apiError(error.message, 500);
    return apiOk({ saved: true });
  });
}
