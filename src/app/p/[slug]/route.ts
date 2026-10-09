import { createHash } from "crypto";
import { NextResponse } from "next/server";

import { createServiceClient } from "@/modules/shared/server";

export const dynamic = "force-dynamic";

const COOKIE = "oc_promo";

/**
 * GET /p/<slug> — promoter share link.
 * Logs the click, drops a 30d httpOnly cookie (last click wins) and 302s to
 * the event page. Stale/dead slugs redirect with no cookie.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: link } = await supabase
    .from("promoter_links")
    .select("id, event_id, is_active, promoter_id")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();

  const base = new URL(request.url);
  const { data: promoter } = link
    ? await supabase.from("promoters").select("is_blocked").eq("id", link.promoter_id).maybeSingle()
    : { data: null };
  if (!link || !link.is_active || promoter?.is_blocked) {
    return NextResponse.redirect(new URL("/", base), 302);
  }

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

  const res = NextResponse.redirect(new URL(`/events/${link.event_id}`, base), 302);
  res.cookies.set(COOKIE, slug.toLowerCase(), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}
