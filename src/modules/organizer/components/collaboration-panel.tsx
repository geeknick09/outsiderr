"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Search, Check, Clock } from "lucide-react";
import Image from "next/image";
import {
  searchOrganizersAction,
  inviteCollaboratorAction,
  removeCollaboratorAction,
  changeCollaboratorPermissionAction,
} from "@/modules/shared/actions/engagement";

type PermissionLevel = "LIMITED" | "ANALYTICS" | "FULL";

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  LIMITED: "Ops",
  ANALYTICS: "Ops + Money",
  FULL: "Full access",
};

const PERMISSION_DESCRIPTIONS: Record<PermissionLevel, string> = {
  LIMITED: "View + orders + analytics (no money) + scanner/box-office PINs",
  ANALYTICS: "Everything in Ops + revenue, payout and money analytics",
  FULL: "Everything - except delete, date, venue or city (owner only)",
};

interface Collaborator {
  id: string;
  organizerId: string;
  organizerName: string;
  organizerPhotoUrl: string | null;
  status: string;
  permissionLevel?: string;
  createdAt: string;
}

function statusLabel(status: string): { text: string; tone: string } {
  if (status === "ACCEPTED") return { text: "Invite accepted", tone: "text-emerald-500" };
  if (status === "PENDING") return { text: "Invite sent", tone: "text-amber-500" };
  return { text: "Declined", tone: "text-red-500" };
}

export function CollaborationPanel({
  eventId,
  collaborators,
  canManage = true,
}: {
  eventId: string;
  collaborators: Collaborator[];
  canManage?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; avatarUrl: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selectedPerm, setSelectedPerm] = useState<PermissionLevel>("LIMITED");
  const [changingPerm, setChangingPerm] = useState<string | null>(null);
  const [justInvited, setJustInvited] = useState<string[]>([]);

  async function handleSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    setError(null);
    const result = await searchOrganizersAction(q.trim());
    if (result.error) {
      setError(result.error);
    } else {
      setResults(result.organizers);
    }
    setSearching(false);
  }

  function handleInvite(organizerId: string) {
    startTransition(async () => {
      const result = await inviteCollaboratorAction(eventId, organizerId, selectedPerm);
      if (result.error) {
        setError(result.error);
      } else {
        // Leave the row in place - button flips to "Invite sent"
        setJustInvited((prev) => [...prev, organizerId]);
      }
    });
  }

  function handleRemove(collaboratorId: string) {
    startTransition(async () => {
      const result = await removeCollaboratorAction(eventId, collaboratorId);
      if (result.error) {
        setError(result.error);
      }
    });
  }

  function handleChangePermission(collaboratorId: string, perm: PermissionLevel) {
    setChangingPerm(collaboratorId);
    startTransition(async () => {
      const result = await changeCollaboratorPermissionAction(eventId, collaboratorId, perm);
      if (result.error) {
        setError(result.error);
      }
      setChangingPerm(null);
    });
  }

  return (
    <div className="glass space-y-4 rounded-3xl p-5">
      <div>
        <h3 className="text-sm font-bold">Collaborators</h3>
        <p className="mt-0.5 text-xs text-muted">
          {canManage
            ? "Search an organizer to invite them as co-host."
            : "Other organizers co-hosting this event."}
        </p>
      </div>

      {error ? <p className="text-xs text-red-500">{error}</p> : null}

      {/* Invite - owner only; the result rows carry the invite action */}
      {canManage ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search organizer by name…"
              className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-zinc-900"
            />
          </div>

          {results.length > 0 ? (
            <div className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
              <p className="mb-2 text-xs font-bold text-muted">Permission level for new invite:</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(Object.keys(PERMISSION_LABELS) as PermissionLevel[]).map((perm) => (
                  <button
                    key={perm}
                    type="button"
                    onClick={() => setSelectedPerm(perm)}
                    className={`rounded-xl border p-2 text-left text-xs transition-colors ${
                      selectedPerm === perm
                        ? "border-violet-neon bg-violet-neon/10 text-violet-neon"
                        : "border-zinc-200 text-muted hover:border-violet-neon/50 dark:border-white/10"
                    }`}
                  >
                    <span className="block font-bold">{PERMISSION_LABELS[perm]}</span>
                    <span className="mt-0.5 block text-[10px] opacity-70">{PERMISSION_DESCRIPTIONS[perm]}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {searching ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((org) => {
                const existing = collaborators.find((c) => c.organizerId === org.id);
                const invited = !!existing || justInvited.includes(org.id);
                const label = existing?.status === "ACCEPTED"
                  ? "Invite accepted"
                  : invited ? "Invite sent" : "Invite";
                return (
                  <div
                    key={org.id}
                    className="flex items-center justify-between rounded-2xl border border-zinc-200 p-3 dark:border-white/10"
                  >
                    <div className="flex items-center gap-2">
                      {org.avatarUrl ? (
                        <Image
                          src={org.avatarUrl}
                          alt={org.name}
                          width={32}
                          height={32}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neon-gradient text-xs font-bold text-white">
                          {org.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <Link
                        href={`/organizers/${org.id}`}
                        className="text-sm font-semibold hover:text-violet-neon"
                      >
                        {org.name}
                      </Link>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleInvite(org.id)}
                      disabled={invited || pending}
                      className={`rounded-full px-3 py-1 text-xs font-bold disabled:opacity-50 ${
                        invited
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-violet-neon/10 text-violet-neon hover:bg-violet-neon/20"
                      }`}
                    >
                      {label}
                    </button>
                  </div>
                );
              })}
              {results.length === 0 && query.trim().length >= 2 ? (
                <p className="py-4 text-center text-xs text-muted">No organizers found.</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {/* Collaborator roster - visible to everyone on the event */}
      <div className="space-y-2">
        {collaborators.length === 0 ? (
          <p className="text-xs text-muted">
            No collaborators yet. Invite another organizer to co-host this event.
          </p>
        ) : (
          collaborators.map((c) => {
            const st = statusLabel(c.status);
            return (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-2xl border border-zinc-200 p-3 dark:border-white/10"
              >
                <div className="flex items-center gap-2">
                  {c.organizerPhotoUrl ? (
                    <Image
                      src={c.organizerPhotoUrl}
                      alt={c.organizerName}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neon-gradient text-xs font-bold text-white">
                      {c.organizerName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <Link
                      href={`/organizers/${c.organizerId}`}
                      className="block text-sm font-semibold hover:text-violet-neon"
                    >
                      {c.organizerName}
                    </Link>
                    <span className={`flex items-center gap-1 text-[10px] font-bold ${st.tone}`}>
                      {c.status === "ACCEPTED" ? <Check className="h-3 w-3" /> : null}
                      {c.status === "PENDING" ? <Clock className="h-3 w-3" /> : null}
                      {st.text}
                      {c.permissionLevel && c.status === "ACCEPTED"
                        ? ` · ${PERMISSION_LABELS[c.permissionLevel as PermissionLevel] ?? c.permissionLevel}`
                        : ""}
                    </span>
                  </div>
                </div>
                {canManage ? (
                  <div className="flex items-center gap-2">
                    {c.status === "ACCEPTED" ? (
                      <select
                        value={(c.permissionLevel as PermissionLevel) ?? "LIMITED"}
                        onChange={(e) => handleChangePermission(c.id, e.target.value as PermissionLevel)}
                        disabled={changingPerm === c.id || pending}
                        className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-[10px] font-bold outline-none focus:border-violet-neon dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                        title="Change permission level"
                      >
                        {(Object.keys(PERMISSION_LABELS) as PermissionLevel[]).map((perm) => (
                          <option key={perm} value={perm}>
                            {PERMISSION_LABELS[perm]}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleRemove(c.id)}
                      disabled={pending}
                      className="rounded-full p-1.5 text-muted hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                      aria-label="Remove collaborator"
                    >
                      ×
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
