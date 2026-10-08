"use client";

import { useActionState, useEffect, useState } from "react";
import { CollapsibleSection, CITIES, cn, isGoogleMapsLink } from "@/modules/shared";
import { updateEventSectionAction, type UpdateEventSectionState } from "../../actions/events";
import type { EventDetail } from "@/modules/shared";

const INPUT =
  "w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white disabled:opacity-50";

export function EditVenueSection({ event, lockLogistics = false }: { event: EventDetail; lockLogistics?: boolean }) {
  const [state, formAction, pending] = useActionState<UpdateEventSectionState, FormData>(
    updateEventSectionAction,
    { error: null },
  );
  const [isEditing, setIsEditing] = useState(false);
  const [venueMode, setVenueMode] = useState<"NOW" | "TBA">(
    event.venueName === "TBA" ? "TBA" : "NOW",
  );
  const [venueName, setVenueName] = useState(event.venueName === "TBA" ? "" : event.venueName);
  const [venueAddress, setVenueAddress] = useState(event.venueAddress);
  const [city, setCity] = useState(event.city);
  const [mapsLink, setMapsLink] = useState(event.googleMapsLink ?? "");
  const [mapsError, setMapsError] = useState<string | null>(null);

  useEffect(() => {
    if (state.saved === "venue") setIsEditing(false);
  }, [state.saved]);

  function handleCancel() {
    setVenueMode(event.venueName === "TBA" ? "TBA" : "NOW");
    setVenueName(event.venueName === "TBA" ? "" : event.venueName);
    setVenueAddress(event.venueAddress);
    setCity(event.city);
    setMapsLink(event.googleMapsLink ?? "");
    setMapsError(null);
    setIsEditing(false);
  }

  return (
    <CollapsibleSection
      title="Venue Details"
      description="Venue mode, name, address, city and Maps link."
      onEdit={() => setIsEditing(true)}
      isEditing={isEditing}
      onCancel={handleCancel}
      formId="sec-venue"
      pending={pending}
      disabled={lockLogistics}
      error={state.error ?? mapsError}
      saved={state.saved === "venue"}
    >
      <form id="sec-venue" action={formAction} className="space-y-4">
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="section" value="venue" />
        <input type="hidden" name="venueMode" value={venueMode} />
        <input type="hidden" name="latitude" value={event.latitude ?? ""} />
        <input type="hidden" name="longitude" value={event.longitude ?? ""} />

        {!isEditing ? (
          <div className="space-y-2 text-sm text-muted">
            <p><strong>Mode:</strong> {venueMode === "TBA" ? "Venue TBA" : "Venue confirmed"}</p>
            {venueMode === "NOW" ? (
              <>
                <p><strong>Name:</strong> {venueName || "-"}</p>
                <p><strong>Address:</strong> {venueAddress || "-"}</p>
                <p className="break-all"><strong>Maps:</strong> {mapsLink || "Not set"}</p>
              </>
            ) : (
              <p>Venue to be announced - must be published at least 48h before the event.</p>
            )}
          </div>
        ) : (
          <>
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
                <p className="text-xs text-muted">Announce later (48h deadline applies)</p>
              </button>
            </div>

            {venueMode === "TBA" ? (
              <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                <p className="font-bold">Venue to be announced</p>
                <p className="mt-1">
                  You must announce the venue at least <strong>48 hours</strong> before the event
                  starts, or the event may be cancelled and all tickets refunded.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted">Venue name</label>
                  <input
                    type="text"
                    name="venueName"
                    value={venueName}
                    onChange={(e) => setVenueName(e.target.value)}
                    required
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted">Venue address</label>
                  <textarea
                    name="venueAddress"
                    rows={2}
                    value={venueAddress}
                    onChange={(e) => setVenueAddress(e.target.value)}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted">Google Maps link *</label>
                  <input
                    type="text"
                    name="googleMapsLink"
                    value={mapsLink}
                    onChange={(e) => {
                      setMapsLink(e.target.value);
                      if (e.target.value && !isGoogleMapsLink(e.target.value)) {
                        setMapsError("Link must be a Google Maps URL (maps.google.com or maps.app.goo.gl)");
                      } else {
                        setMapsError(null);
                      }
                    }}
                    required
                    placeholder="https://maps.app.goo.gl/… or https://maps.google.com/…"
                    className={`${INPUT} ${mapsError ? "border-red-500" : ""}`}
                  />
                </div>
              </>
            )}

            {/* City is editable regardless of venue mode - TBA affects venue, not city */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">City</label>
              <select
                name="city"
                value={city}
                onChange={(e) => setCity(e.target.value as typeof city)}
                className={INPUT}
              >
                {CITIES.map((c) => (
                  <option key={c.value} value={c.value} className="bg-white dark:bg-zinc-900">
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Always post the current effective values (read-only mode included). */}
        {!isEditing || venueMode === "TBA" ? (
          <>
            <input type="hidden" name="venueName" value={venueMode === "TBA" ? "TBA" : venueName} />
            <input type="hidden" name="venueAddress" value={venueMode === "TBA" ? "" : venueAddress} />
            <input type="hidden" name="googleMapsLink" value={venueMode === "TBA" ? "" : mapsLink} />
          </>
        ) : null}
        {!isEditing ? <input type="hidden" name="city" value={city} /> : null}
      </form>
    </CollapsibleSection>
  );
}
