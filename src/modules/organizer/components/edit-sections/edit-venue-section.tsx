"use client";

import { useState } from "react";
import { CollapsibleSection } from "@/modules/shared";
import { cn, isGoogleMapsLink } from "@/modules/shared";

interface EditVenueSectionProps {
  event: {
    venueName: string;
    venueAddress: string;
    googleMapsLink: string | null;
    city: string;
  };
  lockLogistics?: boolean;
  onDirtyChange: () => void;
}

export function EditVenueSection({ event, lockLogistics, onDirtyChange }: EditVenueSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [venueMode, setVenueMode] = useState<"NOW" | "TBA">(
    event.venueName === "TBA" ? "TBA" : "NOW",
  );
  const [venueName, setVenueName] = useState(event.venueName === "TBA" ? "" : event.venueName);
  const [venueAddress, setVenueAddress] = useState(event.venueAddress);
  const [mapsLink, setMapsLink] = useState(event.googleMapsLink ?? "");
  const [mapsError, setMapsError] = useState<string | null>(null);

  function handleSave() {
    if (venueMode === "NOW" && !mapsLink) {
      setMapsError("Google Maps link is required when venue is not TBA.");
      return;
    }
    if (venueMode === "NOW" && mapsLink && !isGoogleMapsLink(mapsLink)) {
      setMapsError("Link must be a Google Maps URL (maps.google.com or maps.app.goo.gl)");
      return;
    }
    setMapsError(null);
    setIsEditing(false);
    onDirtyChange();
  }

  function handleCancel() {
    setVenueMode(event.venueName === "TBA" ? "TBA" : "NOW");
    setVenueName(event.venueName === "TBA" ? "" : event.venueName);
    setVenueAddress(event.venueAddress);
    setMapsLink(event.googleMapsLink ?? "");
    setMapsError(null);
    setIsEditing(false);
  }

  return (
    <CollapsibleSection
      title="Venue Details"
      defaultOpen={false}
      onEdit={() => setIsEditing(true)}
      isEditing={isEditing}
      onCancel={handleCancel}
      onSave={handleSave}
      disabled={lockLogistics}
    >
      {!isEditing ? (
        <div className="space-y-2 text-sm text-muted">
          <p><strong>Mode:</strong> {venueMode === "TBA" ? "Venue TBA" : "Venue confirmed"}</p>
          {venueMode === "NOW" ? (
            <>
              <p><strong>Name:</strong> {venueName}</p>
              <p><strong>Address:</strong> {venueAddress}</p>
              <p><strong>Maps:</strong> {mapsLink || "Not set"}</p>
            </>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setVenueMode("NOW")}
              className={cn(
                "rounded-2xl border p-4 text-left transition-all",
                venueMode === "NOW"
                  ? "border-violet-neon bg-violet-neon/5"
                  : "border-zinc-200 dark:border-white/10",
              )}
            >
              <p className="text-sm font-bold">Venue confirmed</p>
              <p className="text-xs text-muted">Name, address, and Google Maps link</p>
            </button>
            <button
              type="button"
              onClick={() => setVenueMode("TBA")}
              className={cn(
                "rounded-2xl border p-4 text-left transition-all",
                venueMode === "TBA"
                  ? "border-violet-neon bg-violet-neon/5"
                  : "border-zinc-200 dark:border-white/10",
              )}
            >
              <p className="text-sm font-bold">Venue TBA</p>
              <p className="text-xs text-muted">Announce later (deadline applies)</p>
            </button>
          </div>

          {venueMode === "TBA" ? (
            <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              <p className="font-bold">Venue to be announced</p>
              <p className="mt-1">
                You must announce the venue at least <strong>48 hours</strong> before the event starts.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">Venue name</label>
                <input
                  type="text"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">Venue address</label>
                <textarea
                  rows={2}
                  value={venueAddress}
                  onChange={(e) => setVenueAddress(e.target.value)}
                  className="w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">Google Maps link *</label>
                <input
                  type="text"
                  value={mapsLink}
                  onChange={(e) => {
                    setMapsLink(e.target.value);
                    if (e.target.value && !isGoogleMapsLink(e.target.value)) {
                      setMapsError("Link must be a Google Maps URL (maps.google.com or maps.app.goo.gl)");
                    } else {
                      setMapsError(null);
                    }
                  }}
                  placeholder="https://maps.app.goo.gl/… or https://maps.google.com/…"
                  className={`w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white ${mapsError ? "border-red-500" : ""}`}
                />
                {mapsError ? <span className="block text-xs text-red-500">{mapsError}</span> : null}
              </div>
            </>
          )}
        </div>
      )}

      {/* Hidden form fields */}
      <input type="hidden" name="venueMode" value={venueMode} />
      <input type="hidden" name="venueName" value={venueMode === "TBA" ? "TBA" : venueName} />
      <input type="hidden" name="venueAddress" value={venueMode === "TBA" ? "" : venueAddress} />
      <input type="hidden" name="googleMapsLink" value={venueMode === "TBA" ? "" : mapsLink} />
      <input type="hidden" name="city" value={event.city} />
    </CollapsibleSection>
  );
}
