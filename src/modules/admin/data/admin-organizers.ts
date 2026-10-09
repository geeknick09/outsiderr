import "server-only";

import { createClient } from "../../shared/auth/server";
import { createServiceClient } from "../../shared/auth/service";
import { getCurrentUser } from "../../shared/auth/auth";

async function requireAdmin(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Authentication required.");
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Admin access required.");
}

export interface AdminOrganizerRow {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string | null;
  ownerPhone: string | null;
  avatarUrl: string | null;
  verified: boolean;
  kycStatus: string;
  premiumUntil: string | null;
  isPremium: boolean;
  eventCount: number;
  createdAt: string;
}

export async function listAdminOrganizers(): Promise<AdminOrganizerRow[]> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { data: orgs } = await supabase
    .from("organizers")
    .select("id, name, owner_id, avatar_url, verified, kyc_status, premium_until, created_at")
    .order("created_at", { ascending: false });
  if (!orgs || orgs.length === 0) return [];

  const ownerIds = [...new Set(orgs.map((o) => o.owner_id))];
  const { data: owners } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .in("id", ownerIds);
  const ownerMap = new Map((owners ?? []).map((p) => [p.id, p]));

  const orgIds = orgs.map((o) => o.id);
  const { data: eventCounts } = await supabase
    .from("events")
    .select("organizer_id")
    .in("organizer_id", orgIds);
  const counts = new Map<string, number>();
  for (const e of eventCounts ?? []) {
    counts.set(e.organizer_id, (counts.get(e.organizer_id) ?? 0) + 1);
  }

  const now = Date.now();
  return orgs.map((o) => ({
    id: o.id,
    name: o.name,
    ownerId: o.owner_id,
    ownerName: ownerMap.get(o.owner_id)?.full_name ?? null,
    ownerPhone: ownerMap.get(o.owner_id)?.phone ?? null,
    avatarUrl: o.avatar_url,
    verified: o.verified,
    kycStatus: o.kyc_status ?? "NOT_SUBMITTED",
    premiumUntil: o.premium_until,
    isPremium: !!o.premium_until && new Date(o.premium_until).getTime() > now,
    eventCount: counts.get(o.id) ?? 0,
    createdAt: o.created_at,
  }));
}

export interface AdminOrganizerDetail {
  organizer: {
    id: string;
    name: string;
    bio: string | null;
    description: string | null;
    avatarUrl: string | null;
    verified: boolean;
    kycStatus: string;
    premiumUntil: string | null;
    upiId: string | null;
    panNumber: string | null;
    panName: string | null;
    gstNumber: string | null;
    gstBusinessName: string | null;
    bankAccountNumber: string | null;
    bankIfsc: string | null;
    bankAccountName: string | null;
    bankAccountType: string | null;
    instagramUrl: string | null;
    youtubeUrl: string | null;
    xUrl: string | null;
    facebookUrl: string | null;
    linkedinUrl: string | null;
    createdAt: string;
  };
  owner: {
    id: string;
    fullName: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  events: {
    id: string;
    title: string;
    status: string;
    city: string;
    startsAt: string;
  }[];
  communities: {
    id: string;
    name: string;
    city: string | null;
    memberCount: number;
    membershipType: string;
  }[];
  stats: {
    totalEvents: number;
    publishedEvents: number;
    grossRevenuePaise: number;
    ticketsSold: number;
    premiumPurchases: { months: number; amountPaise: number; paidAt: string | null }[];
    premiumAudit: {
      adminEmail: string | null;
      action: string;
      reason: string | null;
      oldValue: string | null;
      newValue: string | null;
      createdAt: string;
    }[];
  };
}

export async function getAdminOrganizerDetail(organizerId: string): Promise<AdminOrganizerDetail | null> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { data: org } = await supabase
    .from("organizers")
    .select("*")
    .eq("id", organizerId)
    .maybeSingle();
  if (!org) return null;

  const { data: events } = await supabase
    .from("events")
    .select("id, title, status, city, starts_at")
    .eq("organizer_id", organizerId)
    .order("starts_at", { ascending: false });
  const eventIds = (events ?? []).map((e) => e.id);

  const [{ data: owner }, { data: ledger }, { data: tiers }, { data: purchases }, { data: audit }, { data: comms }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name, phone, email").eq("id", org.owner_id).maybeSingle(),
      supabase.from("payment_ledger").select("gross_amount_paise").eq("organizer_id", organizerId).in("type", ["TICKET_SALE", "BOOST_SALE", "PREMIUM_SALE"]),
      eventIds.length
        ? supabase.from("ticket_tiers").select("quantity_sold").in("event_id", eventIds)
        : Promise.resolve({ data: [] }),
      supabase.from("organizer_premium_purchases").select("months, amount_paise, paid_at").eq("organizer_id", organizerId).eq("status", "PAID").order("paid_at", { ascending: false }),
      supabase.from("admin_change_log").select("admin_id, old_value, new_value, reason, created_at").eq("table_name", "organizers").eq("entity_id", organizerId).eq("field_name", "premium_until").order("created_at", { ascending: false }).limit(50),
      supabase.from("communities").select("id, name, city, member_count, membership_type").eq("owner_id", organizerId).order("created_at", { ascending: false }),
    ]);

  // Resolve admin emails for audit rows (service client bypasses RLS).
  const auditAdminIds = [...new Set((audit ?? []).map((a) => a.admin_id))];
  const { data: admins } = auditAdminIds.length
    ? await supabase.from("profiles").select("id, email").in("id", auditAdminIds)
    : { data: [] as { id: string; email: string | null }[] };
  const adminEmailMap = new Map((admins ?? []).map((p) => [p.id, p.email]));

  const gross = (ledger ?? []).reduce((s, l) => s + (l.gross_amount_paise ?? 0), 0);
  const tickets = (tiers ?? []).reduce((s, t) => s + (t.quantity_sold ?? 0), 0);
  const evts = events ?? [];

  return {
    organizer: {
      id: org.id,
      name: org.name,
      bio: org.bio,
      description: org.description ?? null,
      avatarUrl: org.avatar_url,
      verified: org.verified,
      kycStatus: org.kyc_status ?? "NOT_SUBMITTED",
      premiumUntil: org.premium_until,
      upiId: org.upi_id,
      panNumber: org.pan_number ?? null,
      panName: org.pan_name ?? null,
      gstNumber: org.gst_number ?? null,
      gstBusinessName: org.gst_business_name ?? null,
      bankAccountNumber: org.bank_account_number ?? null,
      bankIfsc: org.bank_ifsc ?? null,
      bankAccountName: org.bank_account_name ?? null,
      bankAccountType: org.bank_account_type ?? null,
      instagramUrl: org.instagram_url ?? null,
      youtubeUrl: org.youtube_url ?? null,
      xUrl: org.x_url ?? null,
      facebookUrl: org.facebook_url ?? null,
      linkedinUrl: org.linkedin_url ?? null,
      createdAt: org.created_at,
    },
    owner: owner
      ? { id: owner.id, fullName: owner.full_name, phone: owner.phone, email: owner.email }
      : null,
    communities: (comms ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      city: c.city,
      memberCount: c.member_count ?? 0,
      membershipType: c.membership_type ?? "OPEN",
    })),
    events: evts.map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      city: e.city,
      startsAt: e.starts_at,
    })),
    stats: {
      totalEvents: evts.length,
      publishedEvents: evts.filter((e) => e.status === "PUBLISHED").length,
      grossRevenuePaise: gross,
      ticketsSold: tickets,
      premiumPurchases: (purchases ?? []).map((p) => ({
        months: p.months,
        amountPaise: p.amount_paise,
        paidAt: p.paid_at,
      })),
      premiumAudit: (audit ?? []).map((a) => ({
        adminEmail: adminEmailMap.get(a.admin_id) ?? null,
        action: a.new_value === "null" ? "REVOKE" : "GRANT",
        reason: a.reason,
        oldValue: a.old_value,
        newValue: a.new_value,
        createdAt: a.created_at,
      })),
    },
  };
}
