"use client";

import dynamic from "next/dynamic";
import { Suspense, useActionState, useEffect, useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";

import { updateEventAction, type UpdateEventState } from "@/actions/events";
import { GalleryUploader } from "@/components/organizer/gallery-uploader";
import { TagPicker } from "@/components/organizer/event-form";
import { Button } from "@/components/ui/button";
import { CATEGORIES, CITIES } from "@/lib/constants";
import { isGoogleMapsLink } from "@/lib/upi";
import type { EventDetail } from "@/lib/types";

// Lazy load MapPicker with ssr: false — Leaflet requires `window`
const MapPicker = dynamic(
  () => import("@/components/organizer/map-picker").then((m) => m.MapPicker),
  { ssr: false },
);

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

/** Convert an ISO datetime string to the value expected by datetime-local inputs. */
function toDatetimeLocal(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

interface EditableTier {
  id: string;
  name: string;
  price: string;
  quantity: string;
  quantitySold: number;
  isNew?: boolean;
  tierType?: string;
  phaseOpensAt?: string;
  phaseClosesAt?: string;
}

export function EditEventForm({ event }: { event: EventDetail }) {
  const [state, formAction, pending] = useActionState<UpdateEventState, FormData>(
    updateEventAction,
    { error: null },
  );

  const [startsAt, setStartsAt] = useState(toDatetimeLocal(event.startsAt));
  const [endsAt, setEndsAt] = useState(event.endsAt ? toDatetimeLocal(event.endsAt) : "");
  const [dateError, setDateError] = useState<string | null>(null);
  const [mapsLink, setMapsLink] = useState(event.googleMapsLink ?? "");
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [lat, setLat] = useState(event.latitude ? String(event.latitude) : "");
  const [lng, setLng] = useState(event.longitude ? String(event.longitude) : "");

  // "Now" in local datetime-local format for min attributes
  const nowLocal = new Date().toISOString().slice(0, 16);

  // Tier state
  const [tiers, setTiers] = useState<EditableTier[]>(
    event.tiers.map((t) => ({
      id: t.id,
      name: t.name,
      price: (t.pricePaise / 100).toFixed(0),
      quantity: String(t.quantity),
      quantitySold: t.quantitySold,
      tierType: t.tierType,
      phaseOpensAt: t.phaseOpensAt ?? "",
      phaseClosesAt: t.phaseClosesAt ?? "",
    })),
  );

  // Track dirty state by comparing current values to original
  const originalSnapshot = JSON.stringify({
    title: event.title,
    description: event.description,
    venueName: event.venueName,
    venueAddress: event.venueAddress,
    googleMapsLink: event.googleMapsLink ?? "",
    startsAt: toDatetimeLocal(event.startsAt),
    endsAt: event.endsAt ? toDatetimeLocal(event.endsAt) : "",
    tiers: event.tiers.map((t) => ({
      id: t.id,
      name: t.name,
      price: (t.pricePaise / 100).toFixed(0),
      quantity: String(t.quantity),
    })),
  });

  function checkDirty(current: unknown) {
    setDirty(JSON.stringify(current) !== originalSnapshot);
  }

  function updateField<T>(field: string, value: T) {
    const snapshot = {
      title: (document.querySelector('[name="title"]') as HTMLInputElement)?.value ?? event.title,
      description: (document.querySelector('[name="description"]') as HTMLTextAreaElement)?.value ?? event.description,
      venueName: (document.querySelector('[name="venueName"]') as HTMLInputElement)?.value ?? event.venueName,
      venueAddress: (document.querySelector('[name="venueAddress"]') as HTMLTextAreaElement)?.value ?? event.venueAddress,
      googleMapsLink: mapsLink,
      startsAt,
      endsAt,
      tiers: tiers.map((t) => ({ id: t.id, name: t.name, price: t.price, quantity: t.quantity })),
      [field]: value,
    };
    checkDirty(snapshot);
  }

  function validateDates(start: string, end: string) {
    if (end && start && new Date(end) <= new Date(start)) {
      setDateError("End date and time must be after the start date and time.");
    } else {
      setDateError(null);
    }
  }

  function updateTier(id: string, patch: Partial<EditableTier>) {
    const updated = tiers.map((t) => (t.id === id ? { ...t, ...patch } : t));
    setTiers(updated);
    checkDirty({
      title: event.title,
      description: event.description,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
      googleMapsLink: mapsLink,
      startsAt,
      endsAt,
      tiers: updated.map((t) => ({ id: t.id, name: t.name, price: t.price, quantity: t.quantity })),
    });
  }

  function addTier() {
    const newTier: EditableTier = {
      id: `new-${crypto.randomUUID()}`,
      name: "",
      price: "",
      quantity: "",
      quantitySold: 0,
      isNew: true,
    };
    const updated = [...tiers, newTier];
    setTiers(updated);
    setDirty(true);
  }

  function removeTier(id: string) {
    const tier = tiers.find((t) => t.id === id);
    if (tier && tier.quantitySold > 0) return; // Can't remove tiers with sales
    const updated = tiers.filter((t) => t.id !== id);
    setTiers(updated);
    checkDirty({
      title: event.title,
      description: event.description,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
      googleMapsLink: mapsLink,
      startsAt,
      endsAt,
      tiers: updated.map((t) => ({ id: t.id, name: t.name, price: t.price, quantity: t.quantity })),
    });
  }

  // Recompute dirty on any state change
  useEffect(() => {
    checkDirty({
      title: event.title,
      description: event.description,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
      googleMapsLink: mapsLink,
      startsAt,
      endsAt,
      tiers: tiers.map((t) => ({ id: t.id, name: t.name, price: t.price, quantity: t.quantity })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startsAt, endsAt, mapsLink, tiers]);

  return (
    <form action={formAction} className="glass space-y-4 rounded-3xl p-5">
      <h2 className="text-base font-bold">Edit event details</h2>

      {/* Hidden event id */}
      <input type="hidden" name="eventId" value={event.id} />

      <Field label="Title">
        <input
          name="title"
          required
          defaultValue={event.title}
          onChange={() => updateField("title", (document.querySelector('[name="title"]') as HTMLInputElement)?.value)}
          className={INPUT}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <select
            name="category"
            defaultValue={event.category}
            className={INPUT}
          >
            {CATEGORIES.filter((c) => c.value !== "ALL").map((c) => (
              <option key={c.value} value={c.value} className="bg-white dark:bg-zinc-900">
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="City">
          <select
            name="city"
            defaultValue={event.city}
            className={INPUT}
          >
            {CITIES.map((c) => (
              <option key={c.value} value={c.value} className="bg-white dark:bg-zinc-900">
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="About the event">
        <textarea
          name="description"
          rows={4}
          defaultValue={event.description}
          onChange={() => updateField("description", (document.querySelector('[name="description"]') as HTMLTextAreaElement)?.value)}
          className={INPUT}
        />
      </Field>

      <Field label="Venue name">
        <input
          name="venueName"
          required
          defaultValue={event.venueName}
          onChange={() => updateField("venueName", (document.querySelector('[name="venueName"]') as HTMLInputElement)?.value)}
          className={INPUT}
        />
      </Field>

      <Field label="Venue address">
        <textarea
          name="venueAddress"
          rows={2}
          defaultValue={event.venueAddress}
          onChange={() => updateField("venueAddress", (document.querySelector('[name="venueAddress"]') as HTMLTextAreaElement)?.value)}
          className={INPUT}
        />
      </Field>

      <Field label="Google Maps link">
        <input
          name="googleMapsLink"
          value={mapsLink}
          onChange={(e) => {
            setMapsLink(e.target.value);
            if (e.target.value && !isGoogleMapsLink(e.target.value)) {
              setMapsError("Link must be a Google Maps URL (maps.google.com or maps.app.goo.gl)");
            } else {
              setMapsError(null);
            }
            updateField("googleMapsLink", e.target.value);
          }}
          placeholder="https://maps.app.goo.gl/… or https://maps.google.com/…"
          className={`${INPUT} ${mapsError ? "border-red-500" : ""}`}
        />
        {mapsError ? <span className="block text-xs text-red-500">{mapsError}</span> : null}
      </Field>

      {/* Hidden inputs for lat/lng */}
      <input type="hidden" name="latitude" value={lat} />
      <input type="hidden" name="longitude" value={lng} />

      {/* Optional map picker — collapsible */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowMapPicker((v) => !v)}
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted hover:text-violet-neon"
        >
          <MapPin className="h-4 w-4" />
          {showMapPicker ? "Hide map picker" : "Choose location on map (optional)"}
        </button>
        {showMapPicker ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted">
              Use this if you don&apos;t have a Google Maps link. Click the map or drag the marker to set the exact location.
            </p>
            <Suspense
              fallback={
                <div className="flex h-64 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-white/5">
                  <p className="text-xs text-muted">Loading map…</p>
                </div>
              }
            >
              <MapPicker
                initialLat={lat || (event.latitude ? String(event.latitude) : undefined)}
                initialLng={lng || (event.longitude ? String(event.longitude) : undefined)}
                onLocationChange={(newLat, newLng) => {
                  setLat(String(newLat));
                  setLng(String(newLng));
                  setDirty(true);
                }}
              />
            </Suspense>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts at">
          <input
            type="datetime-local"
            name="startsAt"
            required
            min={nowLocal}
            value={startsAt}
            onChange={(e) => {
              setStartsAt(e.target.value);
              validateDates(e.target.value, endsAt);
            }}
            className={INPUT}
          />
        </Field>
        <Field label="Ends at">
          <input
            type="datetime-local"
            name="endsAt"
            required
            min={startsAt || nowLocal}
            value={endsAt}
            onChange={(e) => {
              setEndsAt(e.target.value);
              validateDates(startsAt, e.target.value);
            }}
            className={INPUT}
          />
        </Field>
      </div>
      {dateError ? <p className="text-sm text-red-500">{dateError}</p> : null}

      {/* Tag chip picker pre-seeded with existing tags */}
      <TagPicker initialTags={event.tags} />

      {/* Gallery */}
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Event gallery
        </span>
        <GalleryUploader
          name="photoUrls[]"
          initialUrls={event.photoUrls ?? []}
          organizerName={event.organizer.name}
          eventTitle={event.title}
        />
      </div>

      {/* Contact details */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact email (for attendee queries)">
          <input
            name="contactEmail"
            type="email"
            defaultValue={event.contactEmail ?? ""}
            placeholder="organizer@email.com"
            className={INPUT}
          />
        </Field>
        <Field label="Contact phone (for attendee queries)">
          <input
            name="contactPhone"
            type="tel"
            defaultValue={event.contactPhone ?? ""}
            placeholder="+91 98765 43210"
            className={INPUT}
          />
        </Field>
      </div>

      <Field label="Instagram URL (optional)">
        <input
          name="instagramUrl"
          defaultValue={event.instagramUrl ?? ""}
          placeholder="https://instagram.com/yourevent"
          className={INPUT}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="YouTube URL (optional)">
          <input
            name="youtubeUrl"
            defaultValue={event.youtubeUrl ?? ""}
            placeholder="https://youtube.com/@yourevent"
            className={INPUT}
          />
        </Field>
        <Field label="X URL (optional)">
          <input
            name="xUrl"
            defaultValue={event.xUrl ?? ""}
            placeholder="https://x.com/yourevent"
            className={INPUT}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Facebook URL (optional)">
          <input
            name="facebookUrl"
            defaultValue={event.facebookUrl ?? ""}
            placeholder="https://facebook.com/yourevent"
            className={INPUT}
          />
        </Field>
        <Field label="LinkedIn URL (optional)">
          <input
            name="linkedinUrl"
            defaultValue={event.linkedinUrl ?? ""}
            placeholder="https://linkedin.com/in/yourevent"
            className={INPUT}
          />
        </Field>
      </div>

      {/* Ticket tier editing — dynamic add/remove */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Ticket fares
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={addTier}>
            <Plus className="h-4 w-4" />
            Add tier
          </Button>
        </div>

        {tiers.map((tier, index) => (
          <div key={tier.id} className="space-y-2 rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {tier.isNew ? `New tier ${index + 1}` : `Tier ${index + 1}`}
                {tier.quantitySold > 0 ? ` (${tier.quantitySold} sold)` : ""}
              </p>
              {tiers.length > 1 && tier.quantitySold === 0 ? (
                <button
                  type="button"
                  aria-label={`Remove tier ${index + 1}`}
                  onClick={() => removeTier(tier.id)}
                  className="text-muted hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_100px_100px]">
              <input type="hidden" name="tierId[]" value={tier.isNew ? "" : tier.id} />
              <input
                name="tierName[]"
                required
                value={tier.name}
                onChange={(e) => updateTier(tier.id, { name: e.target.value })}
                placeholder="Tier name"
                className={INPUT}
              />
              <input
                name="tierPrice[]"
                type="number"
                min={0}
                step="1"
                required
                value={tier.price}
                onChange={(e) => updateTier(tier.id, { price: e.target.value })}
                placeholder="₹"
                className={INPUT}
              />
              <input
                name="tierQty[]"
                type="number"
                min={Math.max(0, tier.quantitySold)}
                step="1"
                required
                value={tier.quantity}
                onChange={(e) => updateTier(tier.id, { quantity: e.target.value })}
                placeholder="Qty"
                className={INPUT}
              />
            </div>
            {/* Phase date editing — only for FLAT_PHASE tiers */}
            {tier.tierType === "FLAT_PHASE" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] font-semibold uppercase text-muted">Phase opens at</label>
                  <input
                    name="tierPhaseOpensAt[]"
                    type="datetime-local"
                    value={toDatetimeLocal(tier.phaseOpensAt ?? "")}
                    onChange={(e) => updateTier(tier.id, { phaseOpensAt: e.target.value })}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-muted">Phase closes at</label>
                  <input
                    name="tierPhaseClosesAt[]"
                    type="datetime-local"
                    value={toDatetimeLocal(tier.phaseClosesAt ?? "")}
                    onChange={(e) => updateTier(tier.id, { phaseClosesAt: e.target.value })}
                    className={INPUT}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ))}
        <p className="text-[10px] text-muted">
          Price is in ₹ (rupees). Quantity cannot be less than already sold.
          Tiers with sales cannot be removed.
        </p>
      </div>

      {state.error ? <p className="text-sm text-red-500">{state.error}</p> : null}

      <Button type="submit" disabled={pending || !!dateError || !!mapsError || !dirty} loading={pending} loadingText="Saving…">
        Save changes
      </Button>
      {!dirty ? (
        <p className="text-xs text-muted">No changes to save.</p>
      ) : null}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
