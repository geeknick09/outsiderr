// modules/campaigns — ad-click aggregation + attribution (FOUNDATION STUB).
//
// Purpose: track outbound campaign/ad clicks and attribute downstream bookings
// so Outsiderr can report which channels/organizer links drive sales.
//
// Planned data model (full spec in docs/prd.md § Campaigns):
//   campaigns       — a tracked initiative (organizer promo, influencer link, ad)
//   campaign_links  — slug → destination URL + campaign ref (mounted at /c/[slug])
//   click_events    — raw click log (link_id, ua, ip-hash, referrer, ts)
//   attributions    — click_id → order_id (first-touch within window)
//
// This module intentionally has NO live UI/data yet — types define the contract
// so web/organizer/analytics can start emitting/consuming clicks without churn.

export interface Campaign {
  id: string;
  name: string;
  organizerId: string | null; // null = platform-run campaign
  channel: "ORGANIZER_LINK" | "INFLUENCER" | "PAID_AD" | "SOCIAL" | "OTHER";
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED";
  startsAt: string | null;
  endsAt: string | null;
}

export interface CampaignLink {
  id: string;
  campaignId: string;
  slug: string;          // /c/<slug>
  targetUrl: string;     // redirect destination (usually an event or organizer page)
  eventId: string | null;
}

export interface ClickEvent {
  id: string;
  linkId: string;
  clickedAt: string;
  referrer: string | null;
  userAgentHash: string | null; // never store raw UA/IP — hash only (privacy)
  ipHash: string | null;
}

export interface Attribution {
  id: string;
  clickId: string;
  orderId: string;
  attributedAt: string;
  model: "FIRST_TOUCH" | "LAST_CLICK";
}
