import { createHash } from "crypto";
import { NextResponse } from "next/server";

import { createServiceClient } from "@/modules/shared/server";

export const dynamic = "force-dynamic";

const COOKIE = "outsiderr_ref";

/**
 * GET /r/<slug> - promoter creator-referral link.
 * Logs the click, drops an attribution cookie (TTL = promoter_org_attribution_days)
 * and 302s to the creator landing page. Expired/dead links redirect with no
 * cookie so no attribution can happen.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: link } = await supabase
    .from("promoter_links")
    .select("id, promoter_id, is_active, link_kind, expires_at")
    .eq("slug", slug.toLowerCase())
    .eq("link_kind", "ORGANIZER")
    .maybeSingle();

  const base = new URL(request.url);
  const expired = link?.expires_at ? new Date(link.expires_at) <= new Date() : false;
  const { data: promoter } = link
    ? await supabase.from("promoters").select("is_blocked").eq("id", link.promoter_id).maybeSingle()
    : { data: null };

  const valid = !!link && link.is_active && !expired && !promoter?.is_blocked;

  // Clicks are counted even on expired links so promoters see real traffic.
  if (link) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "";
    const ua = request.headers.get("user-agent") ?? "";
    const referrer = request.headers.get("referer") ?? "";
    await supabase.from("promoter_clicks").insert({
      link_id: link.id,
      ip_hash: ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : null,
      ua_hash: ua ? createHash("sha256").update(ua).digest("hex").slice(0, 32) : null,
      referrer: referrer.slice(0, 500) || null,
    });
  }

  const res = NextResponse.redirect(new URL("/list-your-event", base), 302);
  if (valid) {
    const { data: setting } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "promoter_org_attribution_days")
      .maybeSingle();
    const days = Number(setting?.value) || 30;
    res.cookies.set(COOKIE, slug.toLowerCase(), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: days * 24 * 60 * 60,
      path: "/",
    });
  }
  return res;
}
