import "server-only";

import { createClient } from "../auth/server";
import { createServiceClient } from "../auth/service";
import type { CurrentUser } from "../auth/auth";
import { getSettingInt } from "./platform-settings";
import type { PromoterDashboard } from "../lib/types";

export type { PromoterDashboard, PromoterEarningView } from "../lib/types";

/** The signed-in user's promoter record (created on first registration). */
export async function getPromoterRecord(user: CurrentUser) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("promoters")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return data;
}

/** Register the signed-in user as a promoter for an event → share link or code. */
export async function registerForEvent(user: CurrentUser, eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_event_promoter", { p_event_id: eventId });
  if (error) throw new Error(error.message);
  return data as { mode: "LINK" | "PROMO_CODE"; slug?: string; code?: string };
}

/** Full promoter dashboard bundle. */
export async function getPromoterDashboard(user: CurrentUser): Promise<PromoterDashboard> {
  const supabase = createServiceClient();
  const promoter = await getPromoterRecord(user);
  const holdDays = (await getSettingInt("promoter_hold_days")) || 7;

  if (!promoter) {
    return {
      isPromoter: false,
      payoutReady: false,
      payouts: [],
      balances: { clicks: 0, redemptions: 0, earnedPaise: 0, payablePaise: 0, paidPaise: 0, clawedPaise: 0 },
      programs: [],
      earnings: [],
      hasPayoutDetails: false,
      masked: { account: null, ifsc: null, pan: null, upi: null },
    };
  }

  const [{ data: links }, { data: codes }, { data: earnings }, { data: payouts }] = await Promise.all([
    supabase.from("promoter_links").select("id, event_id, slug, is_active").eq("promoter_id", promoter.id),
    supabase.from("promoter_promo_codes").select("id, event_id, code, is_active").eq("promoter_id", promoter.id),
    supabase.from("promoter_earnings").select("id, event_id, via, kind, amount_paise, status, reversed_paise, ticket_subtotal_paise, created_at")
      .eq("promoter_id", promoter.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("promoter_payouts").select("id, amount_paise, status, initiated_at").eq("promoter_id", promoter.id).order("initiated_at", { ascending: false }).limit(20),
  ]);

  const eventIds = [...new Set([
    ...(links ?? []).map((l) => l.event_id),
    ...(codes ?? []).map((c) => c.event_id),
    ...(earnings ?? []).map((e) => e.event_id),
  ])];
  const { data: eventRows } = eventIds.length
    ? await supabase.from("events").select("id, title, ends_at").in("id", eventIds)
    : { data: [] as { id: string; title: string; ends_at: string }[] };
  const eventMap = new Map((eventRows ?? []).map((e) => [e.id, e]));

  const linkIds = (links ?? []).map((l) => l.id);
  const { data: clicks } = linkIds.length
    ? await supabase.from("promoter_clicks").select("link_id").in("link_id", linkIds)
    : { data: [] as { link_id: string }[] };
  const clicksByLink = new Map<string, number>();
  for (const c of clicks ?? []) clicksByLink.set(c.link_id, (clicksByLink.get(c.link_id) ?? 0) + 1);

  const salesByEvent = new Map<string, { paise: number; earned: number; count: number }>();
  let earned = 0, clawed = 0;
  for (const e of earnings ?? []) {
    const ev = salesByEvent.get(e.event_id) ?? { paise: 0, earned: 0, count: 0 };
    if (e.kind === "EARNING") {
      ev.count += 1;
      ev.paise += e.ticket_subtotal_paise ?? 0;
      ev.earned += e.amount_paise - e.reversed_paise;
      earned += e.amount_paise - e.reversed_paise;
    } else {
      clawed += Math.abs(e.amount_paise);
    }
    salesByEvent.set(e.event_id, ev);
  }

  const paidTotal = (payouts ?? [])
    .filter((p) => p.status === "COMPLETED")
    .reduce((s, p) => s + p.amount_paise, 0);

  const now = Date.now();
  const payablePaise = (earnings ?? [])
    .filter((e) => e.status !== "PAID")
    .filter((e) => {
      const ends = eventMap.get(e.event_id)?.ends_at;
      return ends ? new Date(ends).getTime() + holdDays * 86400000 <= now : false;
    })
    .reduce((s, e) => s + e.amount_paise - e.reversed_paise, 0);

  const programs = [
    ...(links ?? []).map((l) => ({
      eventId: l.event_id,
      eventTitle: eventMap.get(l.event_id)?.title ?? "Event",
      mode: "LINK" as const,
      slug: l.slug,
      clicks: clicksByLink.get(l.id) ?? 0,
      salesPaise: salesByEvent.get(l.event_id)?.paise ?? 0,
      earnedPaise: salesByEvent.get(l.event_id)?.earned ?? 0,
    })),
    ...(codes ?? []).map((c) => ({
      eventId: c.event_id,
      eventTitle: eventMap.get(c.event_id)?.title ?? "Event",
      mode: "PROMO_CODE" as const,
      code: c.code,
      clicks: 0,
      salesPaise: salesByEvent.get(c.event_id)?.paise ?? 0,
      earnedPaise: salesByEvent.get(c.event_id)?.earned ?? 0,
    })),
  ];

  return {
    isPromoter: true,
    payoutReady: payablePaise > 0,
    payouts: (payouts ?? []).map((p) => ({
      id: p.id, amountPaise: p.amount_paise, status: p.status, initiatedAt: p.initiated_at,
    })),
    balances: {
      clicks: (clicks ?? []).length,
      redemptions: (earnings ?? []).filter((e) => e.kind === "EARNING").length,
      earnedPaise: earned,
      payablePaise,
      paidPaise: paidTotal,
      clawedPaise: clawed,
    },
    programs,
    earnings: (earnings ?? []).map((e) => ({
      id: e.id,
      eventTitle: eventMap.get(e.event_id)?.title ?? "Event",
      via: e.via,
      kind: e.kind as "EARNING" | "CLAWBACK",
      amountPaise: e.amount_paise,
      status: e.status,
      createdAt: e.created_at,
    })),
    hasPayoutDetails: !!(promoter.payout_account_number && promoter.payout_ifsc),
    masked: {
      account: promoter.payout_account_number ? `••••${promoter.payout_account_number.slice(-4)}` : null,
      ifsc: promoter.payout_ifsc ? promoter.payout_ifsc.slice(0, 2) + "****" + promoter.payout_ifsc.slice(-2) : null,
      pan: promoter.payout_pan ? promoter.payout_pan.slice(0, 2) + "****" + promoter.payout_pan.slice(-1) : null,
      upi: promoter.upi_id,
    },
  };
}

/** Organizers see per-event promoter stats on the manage page. */
export async function getEventPromoters(organizerId: string, eventId: string) {
  const supabase = createServiceClient();
  const [{ data: links }, { data: codes }, { data: earnings }] = await Promise.all([
    supabase.from("promoter_links")
      .select("id, promoter_id, slug, is_active")
      .eq("event_id", eventId),
    supabase.from("promoter_promo_codes")
      .select("id, promoter_id, code, is_active")
      .eq("event_id", eventId),
    supabase.from("promoter_earnings").select("promoter_id, amount_paise, reversed_paise, kind").eq("event_id", eventId),
  ]);

  const promoterIds = [...new Set([
    ...(links ?? []).map((l) => l.promoter_id),
    ...(codes ?? []).map((c) => c.promoter_id),
  ])];
  const { data: promoterRows } = promoterIds.length
    ? await supabase.from("promoters").select("id, user_id").in("id", promoterIds)
    : { data: [] as { id: string; user_id: string }[] };
  const userIds = (promoterRows ?? []).map((p) => p.user_id);
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameByPromoter = new Map(
    (promoterRows ?? []).map((p) => [p.id, (profiles ?? []).find((x) => x.id === p.user_id)?.full_name ?? "Promoter"]),
  );

  const linkIds = (links ?? []).map((l) => l.id);
  const { data: clicks } = linkIds.length
    ? await supabase.from("promoter_clicks").select("link_id").in("link_id", linkIds)
    : { data: [] as { link_id: string }[] };
  const clicksBy = new Map<string, number>();
  for (const c of clicks ?? []) clicksBy.set(c.link_id, (clicksBy.get(c.link_id) ?? 0) + 1);

  const earnedBy = new Map<string, { paise: number; sales: number }>();
  for (const e of earnings ?? []) {
    const b = earnedBy.get(e.promoter_id) ?? { paise: 0, sales: 0 };
    if (e.kind === "EARNING") { b.paise += e.amount_paise - e.reversed_paise; b.sales += 1; }
    else b.paise += e.amount_paise; // clawback rows are negative
    earnedBy.set(e.promoter_id, b);
  }

  return [
    ...(links ?? []).map((l) => ({
      promoterId: l.promoter_id,
      name: nameByPromoter.get(l.promoter_id) ?? "Promoter",
      via: "LINK" as const,
      handle: l.slug,
      clicks: clicksBy.get(l.id) ?? 0,
      sales: earnedBy.get(l.promoter_id)?.sales ?? 0,
      earnedPaise: earnedBy.get(l.promoter_id)?.paise ?? 0,
      active: l.is_active,
    })),
    ...(codes ?? []).map((c) => ({
      promoterId: c.promoter_id,
      name: nameByPromoter.get(c.promoter_id) ?? "Promoter",
      via: "PROMO_CODE" as const,
      handle: c.code,
      clicks: 0,
      sales: earnedBy.get(c.promoter_id)?.sales ?? 0,
      earnedPaise: earnedBy.get(c.promoter_id)?.paise ?? 0,
      active: c.is_active,
    })),
  ];
}

/** Admin: all promoters with balances. */
export async function getAdminPromoters() {
  const supabase = createServiceClient();
  const { data: promoters } = await supabase
    .from("promoters")
    .select("*")
    .order("created_at", { ascending: false });
  const { data: earnings } = await supabase
    .from("promoter_earnings")
    .select("promoter_id, kind, amount_paise, reversed_paise, status, event_id");
  const { data: payouts } = await supabase
    .from("promoter_payouts")
    .select("id, promoter_id, amount_paise, status, bank_reference, initiated_at, completed_at, payout_snapshot")
    .order("initiated_at", { ascending: false });

  const userIds = (promoters ?? []).map((p) => p.user_id);
  const evIds = [...new Set((earnings ?? []).map((e) => e.event_id))];
  const [{ data: profileRows }, { data: evRows }] = await Promise.all([
    userIds.length ? supabase.from("profiles").select("id, full_name, email").in("id", userIds) : Promise.resolve({ data: [] }),
    evIds.length ? supabase.from("events").select("id, ends_at").in("id", evIds) : Promise.resolve({ data: [] }),
  ]);
  const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p]));
  const evEndsMap = new Map((evRows ?? []).map((e) => [e.id, e.ends_at]));

  const holdDays = (await getSettingInt("promoter_hold_days")) || 7;
  const now = Date.now();
  const stats = new Map<string, { earned: number; payable: number; paid: number }>();
  for (const e of earnings ?? []) {
    const s = stats.get(e.promoter_id) ?? { earned: 0, payable: 0, paid: 0 };
    s.earned += e.amount_paise - (e.status === "PAID" ? 0 : e.reversed_paise);
    const ends = evEndsMap.get(e.event_id);
    if (e.status !== "PAID" && ends && new Date(ends).getTime() + holdDays * 86400000 <= now) {
      s.payable += e.amount_paise - e.reversed_paise;
    }
    stats.set(e.promoter_id, s);
  }
  for (const p of payouts ?? []) {
    if (p.status === "COMPLETED") {
      const s = stats.get(p.promoter_id) ?? { earned: 0, payable: 0, paid: 0 };
      s.paid += p.amount_paise;
      stats.set(p.promoter_id, s);
    }
  }

  return {
    promoters: (promoters ?? []).map((p) => ({
      id: p.id,
      name: profileMap.get(p.user_id)?.full_name ?? "Promoter",
      email: profileMap.get(p.user_id)?.email ?? "",
      isBlocked: p.is_blocked,
      hasBank: !!(p.payout_account_number && p.payout_ifsc),
      earnedPaise: stats.get(p.id)?.earned ?? 0,
      payablePaise: Math.max(0, stats.get(p.id)?.payable ?? 0),
      paidPaise: stats.get(p.id)?.paid ?? 0,
      snapshot: {
        name: p.payout_account_name,
        account: p.payout_account_number,
        ifsc: p.payout_ifsc,
        pan: p.payout_pan,
      },
    })),
    payouts: (payouts ?? []).map((p) => ({
      id: p.id,
      promoterId: p.promoter_id,
      amountPaise: p.amount_paise,
      status: p.status,
      bankReference: p.bank_reference,
      initiatedAt: p.initiated_at,
      completedAt: p.completed_at,
      snapshot: p.payout_snapshot,
    })),
  };
}
