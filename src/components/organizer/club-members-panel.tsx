"use client";

import { useTransition } from "react";
import { AtSign, Check, Loader2, X } from "lucide-react";

import { acceptMemberAction, rejectMemberAction } from "@/actions/clubs";
import { Badge } from "@/components/ui/badge";
import type { Club, ClubMember } from "@/lib/types";

export function ClubMembersPanel({
  club,
  members,
}: {
  club: Club;
  members: ClubMember[];
}) {
  const pending = members.filter((m) => m.status === "PENDING");
  const accepted = members.filter((m) => m.status === "ACCEPTED");
  const rejected = members.filter((m) => m.status === "REJECTED");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-bold">{club.name}</h3>
        <Badge tone="neutral">{accepted.length} members</Badge>
        {pending.length > 0 ? <Badge tone="warning">{pending.length} pending</Badge> : null}
      </div>

      {/* Pending requests */}
      {pending.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Pending requests
          </h4>
          {pending.map((member) => (
            <MemberRow key={member.id} member={member} clubId={club.id} showActions />
          ))}
        </section>
      ) : null}

      {/* Accepted members */}
      {accepted.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Members
          </h4>
          {accepted.map((member) => (
            <MemberRow key={member.id} member={member} clubId={club.id} />
          ))}
        </section>
      ) : null}

      {/* Rejected */}
      {rejected.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Rejected
          </h4>
          {rejected.map((member) => (
            <MemberRow key={member.id} member={member} clubId={club.id} />
          ))}
        </section>
      ) : null}

      {members.length === 0 ? (
        <p className="text-sm text-muted">No members yet.</p>
      ) : null}
    </div>
  );
}

function MemberRow({
  member,
  clubId,
  showActions,
}: {
  member: ClubMember;
  clubId: string;
  showActions?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{member.userName}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {member.instagramLink ? (
            <a
              href={member.instagramLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 hover:text-violet-neon"
            >
              <AtSign className="h-3 w-3" />
              View Instagram
            </a>
          ) : null}
          {member.utrReference ? <span>UTR: {member.utrReference}</span> : null}
        </div>
      </div>

      {showActions ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => { await acceptMemberAction(member.id, clubId); })}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-muted hover:border-lime-400 hover:text-lime-600 disabled:opacity-50 dark:border-white/10"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {pending ? "Accepting…" : "Accept"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => { await rejectMemberAction(member.id, clubId); })}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-muted hover:border-red-400 hover:text-red-500 disabled:opacity-50 dark:border-white/10"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            {pending ? "Rejecting…" : "Reject"}
          </button>
        </div>
      ) : (
        <Badge tone={member.status === "ACCEPTED" ? "success" : member.status === "REJECTED" ? "danger" : "warning"}>
          {member.status}
        </Badge>
      )}
    </div>
  );
}
