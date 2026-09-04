"use client";

import { useState } from "react";
import { AtSign, Pencil, Rocket } from "lucide-react";
import Link from "next/link";

import { EditOrganizerProfile } from "@/components/organizer/edit-organizer-profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Organizer } from "@/lib/types";

export function OrganizerHeader({ organizer }: { organizer: Organizer }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-3">
      {/* Cover banner */}
      <div className="relative h-40 w-full overflow-hidden rounded-3xl sm:h-52">
        {organizer.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={organizer.coverUrl}
            alt={`${organizer.name} cover`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-neon-gradient opacity-80" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
      </div>

      {/* Avatar + name row */}
      <div className="flex items-end gap-4 -mt-12 px-2">
        {organizer.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={organizer.avatarUrl}
            alt={organizer.name}
            className="h-20 w-20 rounded-2xl border-4 border-zinc-50 object-cover shadow-lg dark:border-ink sm:h-24 sm:w-24"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-zinc-50 bg-neon-gradient text-3xl font-black text-white shadow-lg dark:border-ink sm:h-24 sm:w-24">
            {organizer.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1 pb-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{organizer.name}</h1>
            {organizer.verified ? (
              <Badge tone="lime">Verified</Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted">
            {organizer.bio ?? "Publish events and manage your community."}
          </p>
          {organizer.instagramUrl ? (
            <a
              href={organizer.instagramUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-neon hover:underline"
            >
              <AtSign className="h-4 w-4" />
              Instagram
            </a>
          ) : null}
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" />
          <span className="hidden sm:inline">Edit profile</span>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/organizer/boost">
          <Button variant="secondary" size="sm">
            <Rocket className="h-4 w-4" />
            Boost event
          </Button>
        </Link>
      </div>

      {editing ? (
        <EditOrganizerProfile organizer={organizer} onClose={() => setEditing(false)} />
      ) : null}
    </div>
  );
}
