"use client";

import { useState, useTransition } from "react";
import { Loader2, Search, UserPlus, X, Check, Clock } from "lucide-react";
import Image from "next/image";
import {
  searchOrganizersAction,
  inviteCollaboratorAction,
  removeCollaboratorAction,
} from "@/actions/engagement";

interface Collaborator {
  id: string;
  organizerId: string;
  organizerName: string;
  organizerPhotoUrl: string | null;
  status: string;
  createdAt: string;
}

export function CollaborationPanel({
  eventId,
  collaborators,
}: {
  eventId: string;
  collaborators: Collaborator[];
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; avatarUrl: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      const result = await inviteCollaboratorAction(eventId, organizerId);
      if (result.error) {
        setError(result.error);
      } else {
        setShowSearch(false);
        setQuery("");
        setResults([]);
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

  return (
    <div className="glass space-y-4 rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Collaborators</h3>
        <button
          type="button"
          onClick={() => setShowSearch(!showSearch)}
          className="flex items-center gap-1.5 rounded-full bg-neon-gradient px-3 py-1.5 text-xs font-bold text-white"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Invite
        </button>
      </div>

      {error ? <p className="text-xs text-red-500">{error}</p> : null}

      {/* Search box */}
      {showSearch ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search organizer by name..."
              className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-zinc-900"
              autoFocus
            />
          </div>

          {searching ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((org) => {
                const alreadyInvited = collaborators.some((c) => c.organizerId === org.id);
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
                      <span className="text-sm font-semibold">{org.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleInvite(org.id)}
                      disabled={alreadyInvited || pending}
                      className="rounded-full bg-violet-neon/10 px-3 py-1 text-xs font-bold text-violet-neon hover:bg-violet-neon/20 disabled:opacity-50"
                    >
                      {alreadyInvited ? "Invited" : "Invite"}
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

      {/* Collaborator list */}
      <div className="space-y-2">
        {collaborators.length === 0 ? (
          <p className="text-xs text-muted">
            No collaborators yet. Invite another organizer to co-host this event.
          </p>
        ) : (
          collaborators.map((c) => (
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
                  <span className="block text-sm font-semibold">{c.organizerName}</span>
                  <span
                    className={`flex items-center gap-1 text-[10px] font-bold ${
                      c.status === "ACCEPTED"
                        ? "text-emerald-500"
                        : c.status === "PENDING"
                          ? "text-amber-500"
                          : "text-red-500"
                    }`}
                  >
                    {c.status === "ACCEPTED" ? (
                      <>
                        <Check className="h-3 w-3" /> Co-host
                      </>
                    ) : c.status === "PENDING" ? (
                      <>
                        <Clock className="h-3 w-3" /> Pending
                      </>
                    ) : (
                      "Rejected"
                    )}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(c.id)}
                disabled={pending}
                className="rounded-full p-1.5 text-muted hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                aria-label="Remove collaborator"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
