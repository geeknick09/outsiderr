"use client";

import { useState } from "react";
import { Pencil, Rocket, ScanLine } from "lucide-react";
import Link from "next/link";

import { EditOrganizerProfile } from "@/components/organizer/edit-organizer-profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Organizer } from "@/lib/types";

export function OrganizerHeader({ organizer }: { organizer: Organizer }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {organizer.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={organizer.avatarUrl}
            alt={organizer.name}
            className="h-16 w-16 rounded-2xl border border-zinc-200 object-cover dark:border-white/10"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neon-gradient text-2xl font-black text-white">
            {organizer.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{organizer.name}</h1>
            {organizer.verified ? (
              <Badge tone="lime">Verified</Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted">
            {organizer.bio ?? "Publish events and manage your community."}
          </p>
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
        <Link href="/organizer/scan">
          <Button variant="secondary" size="sm">
            <ScanLine className="h-4 w-4" />
            Door scanner
          </Button>
        </Link>
      </div>

      {editing ? (
        <EditOrganizerProfile organizer={organizer} onClose={() => setEditing(false)} />
      ) : null}
    </div>
  );
}
