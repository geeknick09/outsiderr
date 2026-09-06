"use client";

import { useState } from "react";
import { Pencil, Rocket } from "lucide-react";
import Link from "next/link";

import { EditOrganizerProfile } from "@/components/organizer/edit-organizer-profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Organizer } from "@/lib/types";

/* ── Brand SVG icons (lucide-react removed brand icons) ── */

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.12 1.38C1.35 2.68.94 3.35.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.12.66.66 1.33 1.08 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.79-.3 1.46-.72 2.12-1.38.66-.66 1.08-1.33 1.38-2.12.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91-.3-.79-.72-1.46-1.38-2.12C21.32 1.35 20.65.94 19.86.63 19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0Zm0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84Zm0 10.16A4 4 0 1 1 16 12a4 4 0 0 1-4 4Zm6.41-10.85a1.44 1.44 0 1 0 1.44 1.44 1.44 1.44 0 0 0-1.44-1.44Z" />
    </svg>
  );
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.63 7.58H.48l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93Zm-1.29 19.5h2.04L6.49 3.24H4.3L17.61 20.65Z" />
    </svg>
  );
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

export function OrganizerHeader({ organizer }: { organizer: Organizer }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-3">
      {/* Avatar + name row */}
      <div className="flex items-end gap-4 px-2">
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
          {/* Social links — show icons for all provided URLs */}
          {(organizer.instagramUrl || organizer.youtubeUrl || organizer.facebookUrl || organizer.xUrl || organizer.linkedinUrl) ? (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {organizer.instagramUrl ? (
                <a
                  href={organizer.instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted transition-colors hover:text-violet-neon"
                  aria-label="Instagram"
                >
                  <InstagramIcon className="h-4 w-4" />
                </a>
              ) : null}
              {organizer.youtubeUrl ? (
                <a
                  href={organizer.youtubeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted transition-colors hover:text-violet-neon"
                  aria-label="YouTube"
                >
                  <YoutubeIcon className="h-4 w-4" />
                </a>
              ) : null}
              {organizer.facebookUrl ? (
                <a
                  href={organizer.facebookUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted transition-colors hover:text-violet-neon"
                  aria-label="Facebook"
                >
                  <FacebookIcon className="h-4 w-4" />
                </a>
              ) : null}
              {organizer.xUrl ? (
                <a
                  href={organizer.xUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted transition-colors hover:text-violet-neon"
                  aria-label="X"
                >
                  <XIcon className="h-4 w-4" />
                </a>
              ) : null}
              {organizer.linkedinUrl ? (
                <a
                  href={organizer.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted transition-colors hover:text-violet-neon"
                  aria-label="LinkedIn"
                >
                  <LinkedinIcon className="h-4 w-4" />
                </a>
              ) : null}
            </div>
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
