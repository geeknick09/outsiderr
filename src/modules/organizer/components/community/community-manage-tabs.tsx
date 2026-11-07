"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2, Mail, Phone, Send, X } from "lucide-react";

import { setMemberStatusAction, sendOutreachBlastAction } from "@/modules/shared/actions/communities";
import { Badge, Button, formatDateTime, formatPaise } from "@/modules/shared";
import { BADGE_TONES, computeBadges } from "@/modules/shared";
import { MemberImportPanel } from "./member-import-panel";
import { CommunityForm } from "@/modules/shared";
import type { Community, CommunityMemberDetail } from "@/modules/shared";
import { cn } from "@/modules/shared";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

interface Analytics {
  total_members: number;
  new_members_30d: number;
  pending_requests: number;
  events_total: number;
  attendees: number;
  repeat_attendees: number;
  views: number;
  followers: number;
}

export interface CommunityEventRow {
  id: string;
  title: string;
  startsAt: string;
  status: string;
  views: number;
  confirmedOrders: number;
  checkIns: number;
  netPayoutPaise: number;
}

export interface CommunityWarmLead {
  userId: string;
  userName: string;
  email: string | null;
  phone: string | null;
  entityType: "EVENT" | "COMMUNITY";
  entityName: string;
  lastViewedAt: string;
}

export function CommunityManageTabs({
  community,
  members,
  imports,
  analytics,
  demographics = null,
  events = [],
  warmLeads = [],
  inviteToken = null,
  initialTab = "details",
  editInitial,
  joinQuestions = [],
}: {
  community: Community;
  members: CommunityMemberDetail[];
  imports: { id: string; filename: string; status: string; validRows: number; invalidRows: number; createdAt: string }[];
  analytics: Analytics | null;
  demographics?: { dau: number; mau: number; gender: Record<string, number>; age: Record<string, number> } | null;
  events?: CommunityEventRow[];
  warmLeads?: CommunityWarmLead[];
  inviteToken?: string | null;
  initialTab?: "details" | "members" | "requests" | "import" | "analytics" | "events";
  editInitial?: React.ComponentProps<typeof CommunityForm>["initial"];
  joinQuestions?: { question: string; isMandatory: boolean }[];
}) {
  const [tab, setTab] = useState<"details" | "members" | "requests" | "import" | "analytics" | "events">(initialTab);
  const pending = members.filter((m) => m.status === "PENDING");

  const tabs = [
    { key: "details" as const, label: "Details" },
    { key: "members" as const, label: `Members (${members.filter((m) => m.status === "ACCEPTED").length})` },
    { key: "requests" as const, label: `Requests${pending.length ? ` (${pending.length})` : ""}` },
    { key: "import" as const, label: "Import" },
    { key: "events" as const, label: `Events${events.length ? ` (${events.length})` : ""}` },
    { key: "analytics" as const, label: "Analytics" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-all",
              tab === t.key
                ? "bg-neon-gradient text-white"
                : "border border-zinc-200 text-muted hover:border-violet-neon dark:border-white/10",
            )}
          >
            {t.label}
          </button>
        ))}
        {community.membershipType === "INVITE_ONLY" && inviteToken ? (
          <Link
            href={`/communities/${community.id}?invite=${inviteToken}`}
            className="ml-auto rounded-full border border-dashed border-violet-neon px-4 py-2 text-xs font-bold text-violet-neon"
            title="Your invite link - share it to admit members"
          >
            Invite link: /communities/{community.id.slice(0, 8)}…?invite={inviteToken}
          </Link>
        ) : null}
      </div>

      {tab === "details" ? (
        editInitial ? <CommunityForm initial={{ ...editInitial, joinQuestions }} /> : null
      ) : null}
      {tab === "members" ? <MembersTab community={community} members={members} showActions={false} /> : null}
      {tab === "requests" ? <MembersTab community={community} members={pending} showActions /> : null}
      {tab === "import" ? <MemberImportPanel communityId={community.id} imports={imports} /> : null}
      {tab === "events" ? <EventsTab events={events} /> : null}
      {tab === "analytics" ? <AnalyticsTab community={community} analytics={analytics} warmLeads={warmLeads} demographics={demographics} /> : null}
    </div>
  );
}

function MembersTab({
  community,
  members,
  showActions,
}: {
  community: Community;
  members: CommunityMemberDetail[];
  showActions: boolean;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [, startTransition] = useTransition();
  const PAGE_SIZE = 20;

  if (!members.length) {
    return <p className="glass rounded-3xl p-5 text-sm text-muted">Nothing here yet.</p>;
  }

  function printMembers() {
    const rows = members.map((m) =>
      `<tr><td>${m.userName}</td><td>${m.status}</td><td>${new Date(m.memberSince).toLocaleDateString("en-IN")}</td><td>${m.email ?? "-"}</td><td>${m.phone ?? "-"}</td><td>${m.eventsAttended}</td><td>${(m.answers ?? []).map((a) => `${a.question}: ${a.answer}`).join("; ") || "-"}</td></tr>`,
    ).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>${community.name} - Members</title><style>body{font-family:sans-serif;padding:24px}h1{font-size:18px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #ddd;padding:6px;text-align:left}th{background:#f4f4f4}</style></head><body><h1>${community.name} - ${members.length} members</h1><table><tr><th>Name</th><th>Status</th><th>Joined</th><th>Email</th><th>Phone</th><th>Events</th><th>Answers</th></tr>${rows}</table><script>window.print()</scr` + `ipt></body></html>`);
    w.document.close();
  }

  function act(memberId: string, status: "ACCEPTED" | "REJECTED") {
    setPendingId(memberId);
    startTransition(async () => {
      await setMemberStatusAction(memberId, community.id, status);
      setPendingId(null);
    });
  }

  const totalPages = Math.max(1, Math.ceil(members.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = members.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{members.length} member{members.length === 1 ? "" : "s"}</p>
        <button type="button" onClick={printMembers} className="rounded-full bg-neon-gradient px-3 py-1.5 text-xs font-bold text-white">Print</button>
      </div>
      {visible.map((m) => {
        const badges = computeBadges({ attendedTotal: m.eventsAttended });
        return (
          <div key={m.id} className="glass rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <button
                onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{m.userName}</p>
                  <Badge tone={m.status === "ACCEPTED" ? "success" : m.status === "PENDING" ? "warning" : "neutral"}>
                    {m.status.toLowerCase()}
                  </Badge>
                  {m.imported ? <Badge tone="neutral">imported</Badge> : null}
                  {badges.map((b: { key: string; label: string }) => (
                    <span key={b.key} className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", BADGE_TONES[b.key])}>
                      {b.label}
                    </span>
                  ))}
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  joined {new Date(m.memberSince).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  {" · "}{m.eventsAttended} community event{m.eventsAttended === 1 ? "" : "s"} attended
                </p>
              </button>
              {showActions ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => act(m.id, "ACCEPTED")}
                    disabled={pendingId === m.id}
                    className="rounded-full bg-lime-500/15 p-2 text-lime-500 hover:bg-lime-500/25 disabled:opacity-50"
                    title="Approve"
                  >
                    {pendingId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => act(m.id, "REJECTED")}
                    disabled={pendingId === m.id}
                    className="rounded-full bg-red-500/15 p-2 text-red-500 hover:bg-red-500/25 disabled:opacity-50"
                    title="Reject"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
            {expanded === m.id ? (
              <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3 text-xs dark:border-white/10">
                <p className="flex items-center gap-1.5 text-muted"><Mail className="h-3 w-3" />{m.email ?? "-"}</p>
                <p className="flex items-center gap-1.5 text-muted"><Phone className="h-3 w-3" />{m.phone ?? "-"}</p>
                <Link href={`/members/${m.userId}`} className="text-violet-neon hover:underline">View member profile →</Link>
                {m.answers.length ? (
                  <div className="space-y-1">
                    <p className="font-semibold">Join answers</p>
                    {m.answers.map((a: { question: string; answer: string }, i: number) => (
                      <p key={i} className="text-muted"><span className="font-medium text-zinc-700 dark:text-zinc-300">{a.question}:</span> {a.answer}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold disabled:opacity-40 dark:border-white/10">Prev</button>
          <span className="text-xs text-muted">Page {currentPage} of {totalPages}</span>
          <button type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold disabled:opacity-40 dark:border-white/10">Next</button>
        </div>
      ) : null}
    </div>
  );
}

function AnalyticsTab({
  community,
  analytics,
  warmLeads,
  demographics,
}: {
  community: Community;
  analytics: Analytics | null;
  warmLeads: CommunityWarmLead[];
  demographics?: { dau: number; mau: number; gender: Record<string, number>; age: Record<string, number> } | null;
}) {
  function downloadReport() {
    if (!analytics) return;
    const lines = [
      `Community analytics - ${community.name}`, "",
      "Metric,Value",
      `Total members,${analytics.total_members}`,
      `New members (30d),${analytics.new_members_30d}`,
      `Pending requests,${analytics.pending_requests}`,
      `Followers,${analytics.followers}`,
      `Events,${analytics.events_total}`,
      `Attendees,${analytics.attendees}`,
      `Repeat attendees,${analytics.repeat_attendees}`,
      `Page views,${analytics.views}`,
      ...(demographics ? [
        `DAU,${demographics.dau}`,
        `MAU,${demographics.mau}`,
        ...Object.entries(demographics.gender).map(([k, v]) => `Gender: ${k},${v}`),
        ...Object.entries(demographics.age).map(([k, v]) => `Age: ${k},${v}`),
      ] : []),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${community.name.replace(/\W+/g, "-")}-analytics.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!analytics) return <p className="glass rounded-3xl p-5 text-sm text-muted">No analytics yet.</p>;

  const repeatRate = analytics.attendees > 0
    ? Math.round((analytics.repeat_attendees / analytics.attendees) * 100)
    : 0;
  const joinConv = analytics.views > 0
    ? Math.round((analytics.total_members / analytics.views) * 100)
    : 0;

  const stats = [
    { label: "Members", value: analytics.total_members },
    { label: "New (30d)", value: analytics.new_members_30d },
    { label: "Followers", value: analytics.followers },
    { label: "Events", value: analytics.events_total },
    { label: "Attendees", value: analytics.attendees },
    { label: "Repeat rate", value: `${repeatRate}%` },
    { label: "Page views", value: analytics.views },
    { label: "View→join", value: `${joinConv}%` },
    { label: "Saw, didn't join", value: Math.max(0, analytics.views - analytics.total_members) },
    ...(demographics ? [
      { label: "DAU", value: demographics.dau },
      { label: "MAU", value: demographics.mau },
    ] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">Community performance</p>
        <button type="button" onClick={downloadReport} className="rounded-full bg-neon-gradient px-3 py-1.5 text-xs font-bold text-white">Download report</button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-2xl p-4">
            <p className="text-2xl font-black">{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {demographics && (Object.keys(demographics.gender).length || Object.keys(demographics.age).length) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="glass rounded-2xl p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Gender</p>
            {Object.entries(demographics.gender).map(([k, v]) => (
              <p key={k} className="flex justify-between text-sm"><span className="text-muted">{k}</span><span className="font-bold">{v}</span></p>
            ))}
          </div>
          <div className="glass rounded-2xl p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Age</p>
            {Object.entries(demographics.age).map(([k, v]) => (
              <p key={k} className="flex justify-between text-sm"><span className="text-muted">{k}</span><span className="font-bold">{v}</span></p>
            ))}
            {Object.keys(demographics.age).length === 0 ? <p className="text-xs text-muted">No birth dates on file yet.</p> : null}
          </div>
        </div>
      ) : null}

      <WarmAudienceCard communityId={community.id} communityName={community.name} leads={warmLeads} />
    </div>
  );
}

function EventsTab({ events }: { events: CommunityEventRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = events.filter((e) => e.title.toLowerCase().includes(query.toLowerCase()));
  const groups = new Map<string, CommunityEventRow[]>();
  for (const e of filtered) {
    const key = new Date(e.startsAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  return (
    <div className="space-y-4">
      {events.length === 0 ? (
        <div className="glass rounded-3xl p-5 text-sm text-muted">
          No events linked to this community yet - create a community event or attach one from the
          event&apos;s edit page.
        </div>
      ) : (
        <div className="space-y-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events…"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
          {[...groups.entries()].map(([month, rows]) => (
            <div key={month} className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">{month}</p>
              <div className="glass overflow-hidden rounded-3xl">
                <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-muted dark:border-white/10">
                <th className="px-4 py-2.5">Event</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">Views</th>
                <th className="px-4 py-2.5">Sold</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">Check-ins</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Net</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-zinc-100 last:border-0 dark:border-white/5">
                  <td className="px-4 py-2.5">
                    <Link href={`/organizer/events/${e.id}`} className="font-semibold hover:text-violet-neon">
                      {e.title}
                    </Link>
                    <span className="block text-[10px] text-muted">{formatDateTime(e.startsAt)}</span>
                  </td>
                  <td className="hidden px-4 py-2.5 sm:table-cell">{e.views}</td>
                  <td className="px-4 py-2.5 font-bold">{e.confirmedOrders}</td>
                  <td className="hidden px-4 py-2.5 sm:table-cell">{e.checkIns}</td>
                  <td className="hidden px-4 py-2.5 md:table-cell">{formatPaise(e.netPayoutPaise)}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={e.status === "PUBLISHED" ? "success" : e.status === "CANCELLED" ? "danger" : "neutral"}>
                      {e.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

const LEAD_PAGE = 10;

function WarmAudienceCard({
  communityId,
  communityName,
  leads,
}: {
  communityId: string;
  communityName: string;
  leads: CommunityWarmLead[];
}) {
  const [msg, setMsg] = useState(`Hey! ${communityName} on Outsiderr is building something for you - come join us.`);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [page, setPage] = useState(0);

  const pages = Math.max(1, Math.ceil(leads.length / LEAD_PAGE));
  const slice = leads.slice(page * LEAD_PAGE, (page + 1) * LEAD_PAGE);

  function notify(userIds: string[], label: string) {
    startTransition(async () => {
      const res = await sendOutreachBlastAction("COMMUNITY", communityId, msg, userIds);
      if (!res.error) setSent(label);
    });
  }

  function exportCsv() {
    const rows = [
      ["name", "email", "phone", "viewed", "last_seen"],
      ...leads.map((l) => [
        l.userName,
        l.email ?? "",
        l.phone ?? "",
        `${l.entityType === "EVENT" ? "Event" : "Community"}: ${l.entityName}`,
        l.lastViewedAt,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${communityName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-warm-audience.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="glass space-y-3 rounded-3xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold">Interested, not converted yet</p>
          <p className="mt-0.5 text-xs text-muted">
            Signed-in users who viewed this community or its events but haven&apos;t joined or bought.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{leads.length} people</Badge>
          {leads.length ? (
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              Export CSV
            </Button>
          ) : null}
        </div>
      </div>

      {leads.length ? (
        <>
          <div className="overflow-auto rounded-2xl border border-zinc-200 dark:border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-muted dark:border-white/10">
                  <th className="px-3 py-2">User</th>
                  <th className="hidden px-3 py-2 md:table-cell">Viewed</th>
                  <th className="hidden px-3 py-2 sm:table-cell">Last seen</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {slice.map((l) => (
                  <tr key={l.userId + l.entityName} className="border-b border-zinc-100 last:border-0 dark:border-white/5">
                    <td className="px-3 py-2">
                      <span className="font-semibold">{l.userName}</span>
                      <span className="block text-[10px] text-muted">
                        {[l.email, l.phone].filter(Boolean).join(" \u00b7 ") || "-"}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2 text-xs md:table-cell">
                      {l.entityType === "EVENT" ? "Event" : "Community"}: {l.entityName}
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-muted sm:table-cell">{formatDateTime(l.lastViewedAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={pending || !msg.trim()}
                        onClick={() => notify([l.userId], l.userName)}
                        className="rounded-full border border-violet-neon/40 px-3 py-1 text-[10px] font-bold text-violet-neon transition-colors hover:bg-violet-neon/10 disabled:opacity-40"
                      >
                        Notify
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 ? (
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Page {page + 1} of {pages}</span>
              <div className="flex gap-2">
                <button type="button" disabled={page === 0} onClick={() => setPage((x) => x - 1)} className="rounded-full border border-zinc-300 px-3 py-1 disabled:opacity-40 dark:border-white/15">Prev</button>
                <button type="button" disabled={page >= pages - 1} onClick={() => setPage((x) => x + 1)} className="rounded-full border border-zinc-300 px-3 py-1 disabled:opacity-40 dark:border-white/15">Next</button>
              </div>
            </div>
          ) : null}

          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            rows={2}
            className={INPUT}
            maxLength={500}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={pending || !leads.length || !msg.trim()}
              onClick={() => notify(leads.map((l) => l.userId), `${leads.length} people`)}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Notify all {leads.length}
            </Button>
            {sent !== null ? <p className="text-xs font-semibold text-lime-neon">Sent to {sent}.</p> : null}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted">No warm audience yet - the list fills as people browse your community.</p>
      )}
    </div>
  );
}
