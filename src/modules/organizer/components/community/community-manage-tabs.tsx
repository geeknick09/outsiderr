"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2, Mail, Phone, Send, X } from "lucide-react";

import { setMemberStatusAction, sendOutreachBlastAction } from "@/modules/shared/actions/communities";
import { Badge, Button } from "@/modules/shared";
import { BADGE_TONES, computeBadges } from "@/modules/shared";
import { MemberImportPanel } from "./member-import-panel";
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

export function CommunityManageTabs({
  community,
  members,
  imports,
  analytics,
  nonJoiners,
  inviteToken = null,
  initialTab = "members",
}: {
  community: Community;
  members: CommunityMemberDetail[];
  imports: { id: string; filename: string; status: string; validRows: number; invalidRows: number; createdAt: string }[];
  analytics: Analytics | null;
  nonJoiners: string[];
  inviteToken?: string | null;
  initialTab?: "members" | "requests" | "import" | "analytics";
}) {
  const [tab, setTab] = useState<"members" | "requests" | "import" | "analytics">(initialTab);
  const pending = members.filter((m) => m.status === "PENDING");

  const tabs = [
    { key: "members" as const, label: `Members (${members.filter((m) => m.status === "ACCEPTED").length})` },
    { key: "requests" as const, label: `Requests${pending.length ? ` (${pending.length})` : ""}` },
    { key: "import" as const, label: "Import" },
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
            title="Your invite link — share it to admit members"
          >
            Invite link: /communities/{community.id.slice(0, 8)}…?invite={inviteToken}
          </Link>
        ) : null}
      </div>

      {tab === "members" ? <MembersTab community={community} members={members} showActions={false} /> : null}
      {tab === "requests" ? <MembersTab community={community} members={pending} showActions /> : null}
      {tab === "import" ? <MemberImportPanel communityId={community.id} imports={imports} /> : null}
      {tab === "analytics" ? <AnalyticsTab community={community} analytics={analytics} nonJoiners={nonJoiners} /> : null}
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
  const [_, startTransition] = useTransition();

  if (!members.length) {
    return <p className="glass rounded-3xl p-5 text-sm text-muted">Nothing here yet.</p>;
  }

  function act(memberId: string, status: "ACCEPTED" | "REJECTED") {
    setPendingId(memberId);
    startTransition(async () => {
      await setMemberStatusAction(memberId, community.id, status);
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-2">
      {members.map((m) => {
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
                <p className="flex items-center gap-1.5 text-muted"><Mail className="h-3 w-3" />{m.email ?? "—"}</p>
                <p className="flex items-center gap-1.5 text-muted"><Phone className="h-3 w-3" />{m.phone ?? "—"}</p>
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
    </div>
  );
}

function AnalyticsTab({
  community,
  analytics,
  nonJoiners,
}: {
  community: Community;
  analytics: Analytics | null;
  nonJoiners: string[];
}) {
  const [msg, setMsg] = useState(`Hey! ${community.name} on Outsiderr is building something for you — come join us.`);
  const [sent, setSent] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

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
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-2xl p-4">
            <p className="text-2xl font-black">{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="glass space-y-3 rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">Viewed but didn&apos;t join</p>
          <Badge tone="neutral">{nonJoiners.length} people</Badge>
        </div>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={2}
          className={INPUT}
          maxLength={500}
        />
        <Button
          disabled={pending || !nonJoiners.length || !msg.trim()}
          onClick={() =>
            startTransition(async () => {
              const res = await sendOutreachBlastAction("COMMUNITY", community.id, msg, nonJoiners);
              if (!res.error) setSent(res.sent ?? 0);
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Notify {nonJoiners.length} non-joiners
        </Button>
        {sent !== null ? <p className="text-xs font-semibold text-lime-neon">Sent {sent} notifications.</p> : null}
      </div>
    </div>
  );
}
