"use client";

import dynamic from "next/dynamic";
import { Suspense, useActionState, useState } from "react";
import { MapPin, Plus, ShieldCheck, Trash2, Upload, Users } from "lucide-react";

import { createEventAction, type CreateEventState } from "@/actions/events";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { GalleryUploader } from "@/components/organizer/gallery-uploader";
import { CATEGORIES, CITIES, PREDEFINED_EVENT_TAGS } from "@/lib/constants";
import { uploadPublicFile } from "@/lib/upload";
import { isGoogleMapsLink } from "@/lib/upi";
import { cn } from "@/lib/utils";

// Lazy load MapPicker with ssr: false — Leaflet requires `window`
const MapPicker = dynamic(
  () => import("@/components/organizer/map-picker").then((m) => m.MapPicker),
  { ssr: false },
);

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white";

const SELECT_OPTION = "bg-white text-zinc-900 dark:bg-zinc-900 dark:text-white";

type PricingMode = "FREE" | "FLAT" | "PAID" | "PHASED";

interface TierRow {
  key: string;
  name: string;
  price: string;
  quantity: string;
  perks: string;
}

interface PhaseRow {
  key: string;
  name: string;
  price: string;
  quantity: string;
  opensAt: string;
  closesAt: string;
}

function emptyTier(): TierRow {
  return {
    key: crypto.randomUUID(),
    name: "",
    price: "",
    quantity: "",
    perks: "",
  };
}

function emptyPhase(): PhaseRow {
  return {
    key: crypto.randomUUID(),
    name: "",
    price: "",
    quantity: "",
    opensAt: "",
    closesAt: "",
  };
}

export function TagPicker({ initialTags = [] }: { initialTags?: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialTags));

  function toggle(tag: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        Tags <span className="normal-case text-zinc-400">(tap to select)</span>
      </span>
      <div className="flex flex-wrap gap-2">
        {PREDEFINED_EVENT_TAGS.map((tag) => {
          const active = selected.has(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                active
                  ? "border-violet-neon bg-violet-neon/15 text-violet-neon"
                  : "border-zinc-200 text-zinc-600 hover:border-violet-neon/50 dark:border-white/10 dark:text-zinc-300",
              )}
            >
              {tag}
            </button>
          );
        })}
      </div>
      {/* Hidden input carrying the comma-joined selected tags */}
      <input type="hidden" name="tags" value={[...selected].join(",")} />
    </div>
  );
}

export function EventForm({
  organizerName = "organizer",
  termsVersion = "organizer-v1.0",
  doorStaffPricing = { "1": 1500, "2": 2500, "3": 3500, "4": 5000, "5": 6500 },
  doorStaffMax = 5,
}: {
  organizerName?: string;
  termsVersion?: string;
  doorStaffPricing?: Record<string, number>;
  doorStaffMax?: number;
}) {
  const [state, formAction, pending] = useActionState<CreateEventState, FormData>(
    createEventAction,
    { error: null },
  );

  // Restore values from a failed submit
  const sv = state.values;
  const [pricingMode, setPricingMode] = useState<PricingMode>(
    (sv?.pricingMode as PricingMode) ?? "PAID",
  );
  const [, setNeedsDoorStaff] = useState(sv?.needsDoorStaff ?? false);
  const [eventTitle, setEventTitle] = useState(sv?.title ?? "");
  const [startsAt, setStartsAt] = useState(sv?.startsAt ?? "");
  const [endsAt, setEndsAt] = useState(sv?.endsAt ?? "");
  const [dateError, setDateError] = useState<string | null>(null);
  const [venueMode, setVenueMode] = useState<"NOW" | "TBA">("NOW");
  const [mapsLink, setMapsLink] = useState(sv?.googleMapsLink ?? "");
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [instagramUrl, setInstagramUrl] = useState(sv?.instagramUrl ?? "");
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [lat, setLat] = useState(sv?.latitude ?? "");
  const [lng, setLng] = useState(sv?.longitude ?? "");

  function validateDates(start: string, end: string) {
    if (start && new Date(start) < new Date()) {
      setDateError("Start date and time cannot be in the past.");
    } else if (end && start && new Date(end) <= new Date(start)) {
      setDateError("End date and time must be after the start date and time.");
    } else {
      setDateError(null);
    }
  }
  const [tiers, setTiers] = useState<TierRow[]>(
    sv?.tiers && sv.tiers.length > 0
      ? sv.tiers.map((t) => ({ ...t, key: crypto.randomUUID() }))
      : [emptyTier()],
  );
  const [phases, setPhases] = useState<PhaseRow[]>([
    emptyPhase(),
    emptyPhase(),
  ]);

  // "Now" in local datetime-local format (YYYY-MM-DDTHH:mm) for min attributes
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [phaseError, setPhaseError] = useState<string | null>(null);

  function validatePhases(rows: PhaseRow[]) {
    for (let i = 0; i < rows.length; i++) {
      const p = rows[i];
      if (!p.opensAt) continue;
      // Phase opens must be in the future
      if (new Date(p.opensAt) < new Date()) {
        setPhaseError(`Phase ${i + 1} open date cannot be in the past.`);
        return;
      }
      // Phase closes must be after opens
      if (p.closesAt && p.opensAt && new Date(p.closesAt) <= new Date(p.opensAt)) {
        setPhaseError(`Phase ${i + 1} close date must be after its open date.`);
        return;
      }
      // Next phase opens must be after previous phase closes (or opens)
      if (i > 0) {
        const prev = rows[i - 1];
        const prevBoundary = prev.closesAt ?? prev.opensAt;
        if (prevBoundary && p.opensAt && new Date(p.opensAt) <= new Date(prevBoundary)) {
          setPhaseError(`Phase ${i + 1} must open after Phase ${i}'s ${prev.closesAt ? "close" : "open"} date.`);
          return;
        }
      }
    }
    setPhaseError(null);
  }

  function updatePhase(key: string, patch: Partial<PhaseRow>) {
    setPhases((rows) => {
      const updated = rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
      validatePhases(updated);
      return updated;
    });
  }

  function updateTier(key: string, patch: Partial<TierRow>) {
    setTiers((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Hidden pricing mode */}
      <input type="hidden" name="pricingMode" value={pricingMode} />

      <section className="glass space-y-4 rounded-3xl p-5">
        <h2 className="text-base font-bold">Event details</h2>

        <Field label="Title">
          <input
            name="title"
            required
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
            placeholder="Basement Cypher Vol. 4"
            className={INPUT}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select
              name="category"
              className={INPUT}
              defaultValue={sv?.category ?? "JAM_GIG"}
            >
              {CATEGORIES.filter((category) => category.value !== "ALL").map((category) => (
                <option key={category.value} value={category.value} className={SELECT_OPTION}>
                  {category.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="City">
            <select
              name="city"
              className={INPUT}
              defaultValue={sv?.city ?? "KOLKATA"}
            >
              {CITIES.map((c) => (
                <option key={c.value} value={c.value} className={SELECT_OPTION}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
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
        {dateError ? (
          <p className="text-sm text-red-500">{dateError}</p>
        ) : null}

      {/* Venue mode radio */}
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
          <p className="text-sm font-bold">Add venue details now</p>
          <p className="text-xs text-muted">Enter venue name, address, and Google Maps link</p>
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
          <p className="text-xs text-muted">Announce venue later (deadline applies)</p>
        </button>
      </div>
      <input type="hidden" name="venueMode" value={venueMode} />

      {venueMode === "TBA" ? (
        <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
          <p className="font-bold">Venue to be announced</p>
          <p className="mt-1">
            You must announce the venue at least <strong>48 hours</strong> before the event start time.
            If the venue is not announced by the deadline, the event may be cancelled and all tickets
            refunded.
          </p>
          <input type="hidden" name="venueName" value="TBA" />
          <input type="hidden" name="venueAddress" value="" />
          <input type="hidden" name="googleMapsLink" value="" />
        </div>
      ) : (
        <>
          <Field label="Venue name *">
            <input
              name="venueName"
              required
              defaultValue={sv?.venueName ?? ""}
              placeholder="The Basement, Park Street"
              className={INPUT}
            />
          </Field>
          <Field label="Venue address *">
            <textarea
              name="venueAddress"
              rows={2}
              required
              defaultValue={sv?.venueAddress ?? ""}
              className={INPUT}
            />
          </Field>

          <Field label="Google Maps link (preferred)">
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
              }}
              placeholder="https://maps.app.goo.gl/… or https://maps.google.com/…"
              className={`${INPUT} ${mapsError ? "border-red-500" : ""}`}
            />
            {mapsError ? (
              <span className="block text-xs text-red-500">{mapsError}</span>
            ) : (
              <span className="block text-xs text-muted">
                Paste a Google Maps link, or skip and use the map picker below.
              </span>
            )}
          </Field>

          {/* Hidden inputs for lat/lng — populated by the map picker */}
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
                    initialLat={lat || sv?.latitude}
                    initialLng={lng || sv?.longitude}
                    onLocationChange={(newLat, newLng) => {
                      setLat(String(newLat));
                      setLng(String(newLng));
                    }}
                  />
                </Suspense>
              </div>
            ) : null}
          </div>
        </>
      )}

        <Field label="About the event">
          <textarea
            name="description"
            rows={4}
            defaultValue={sv?.description ?? ""}
            className={INPUT}
          />
        </Field>
        <Field label="Things to know (one per line)">
          <textarea
            name="thingsToKnow"
            rows={3}
            defaultValue={sv?.thingsToKnow ?? ""}
            className={INPUT}
          />
        </Field>

        {/* Tag chip picker */}
        <TagPicker initialTags={sv?.tags ? sv.tags.split(",").filter(Boolean) : []} />

        <Field label="Terms & conditions (one per line, defaults applied when empty)">
          <textarea
            name="terms"
            rows={3}
            defaultValue={sv?.terms ?? ""}
            className={INPUT}
          />
        </Field>
      </section>

      <section className="glass grid gap-4 rounded-3xl p-5 sm:grid-cols-2">
        <PosterField
          name="cardPosterUrl"
          label="Card poster (4:5)"
          organizerName={organizerName}
          eventTitle={eventTitle}
          subFolder="card-posters"
          initialValue={sv?.cardPosterUrl ?? ""}
        />
        <PosterField
          name="bannerPosterUrl"
          label="Banner poster (16:9)"
          organizerName={organizerName}
          eventTitle={eventTitle}
          subFolder="banner-posters"
          initialValue={sv?.bannerPosterUrl ?? ""}
        />
      </section>

      {/* Gallery + Contact */}
      <section className="glass space-y-4 rounded-3xl p-5">
        <div>
          <h3 className="text-sm font-bold">Event gallery</h3>
          <p className="text-xs text-muted">Add up to 8 photos of past events, venue, or promo shots.</p>
        </div>
        <GalleryUploader
          name="photoUrls"
          initialUrls={sv?.photoUrls ?? []}
          organizerName={organizerName}
          eventTitle={eventTitle}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact email (for attendee queries)">
            <input
              name="contactEmail"
              type="email"
              defaultValue={sv?.contactEmail ?? ""}
              placeholder="organizer@email.com"
              className={INPUT}
            />
          </Field>
          <Field label="Contact phone (for attendee queries)">
            <PhoneInput name="contactPhone" defaultValue={sv?.contactPhone ?? ""} />
          </Field>
        </div>

        <Field label="Instagram URL (optional)">
          <input
            value={instagramUrl}
            onChange={(e) => setInstagramUrl(e.target.value)}
            placeholder="https://instagram.com/yourevent"
            className={INPUT}
          />
        </Field>
        <input type="hidden" name="instagramUrl" value={instagramUrl} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="YouTube URL (optional)">
            <input
              name="youtubeUrl"
              defaultValue={sv?.youtubeUrl ?? ""}
              placeholder="https://youtube.com/@yourevent"
              className={INPUT}
            />
          </Field>
          <Field label="X URL (optional)">
            <input
              name="xUrl"
              defaultValue={sv?.xUrl ?? ""}
              placeholder="https://x.com/yourevent"
              className={INPUT}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Facebook URL (optional)">
            <input
              name="facebookUrl"
              defaultValue={sv?.facebookUrl ?? ""}
              placeholder="https://facebook.com/yourevent"
              className={INPUT}
            />
          </Field>
          <Field label="LinkedIn URL (optional)">
            <input
              name="linkedinUrl"
              defaultValue={sv?.linkedinUrl ?? ""}
              placeholder="https://linkedin.com/in/yourevent"
              className={INPUT}
            />
          </Field>
        </div>
      </section>

      {/* ── Pricing mode + tickets ── */}
      <section className="glass space-y-4 rounded-3xl p-5">
        <h2 className="text-base font-bold">Tickets</h2>

        {/* Pricing mode selector */}
        <div className="grid gap-3 sm:grid-cols-4">
          <PricingModeCard
            mode="FREE"
            active={pricingMode === "FREE"}
            onClick={() => setPricingMode("FREE")}
            title="Free Entry"
            description="No charge. RSVP with quantity."
          />
          <PricingModeCard
            mode="FLAT"
            active={pricingMode === "FLAT"}
            onClick={() => setPricingMode("FLAT")}
            title="Flat Price"
            description="One price for all. No tier names."
          />
          <PricingModeCard
            mode="PAID"
            active={pricingMode === "PAID"}
            onClick={() => setPricingMode("PAID")}
            title="Tiered"
            description="Multiple tiers with names & perks."
          />
          <PricingModeCard
            mode="PHASED"
            active={pricingMode === "PHASED"}
            onClick={() => {
              setPricingMode("PHASED");
              // In PHASED mode, named tiers are optional — clear the default empty tier
              setTiers((prev) => prev.length === 1 && !prev[0].name && !prev[0].price ? [] : prev);
            }}
            title="Phased"
            description="Time-based flat pricing with carry-forward + optional named tiers."
          />
        </div>

        {/* FREE mode — just quantity */}
        {pricingMode === "FREE" ? (
          <div className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
            <Field label="Total tickets available">
              <input
                name="freeQuantity"
                type="number"
                min={1}
                required
                defaultValue={sv?.freeQuantity ?? ""}
                placeholder="100"
                className={INPUT}
              />
            </Field>
            <p className="mt-2 text-xs text-muted">
              Attendees will RSVP for free and get an instant confirmed ticket with a QR code.
            </p>
          </div>
        ) : null}

        {/* FLAT mode — single price + quantity */}
        {pricingMode === "FLAT" ? (
          <div className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
            <input type="hidden" name="tierName" value="Entry" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Price (₹)">
                <input
                  name="tierPrice"
                  type="number"
                  min={1}
                  required
                  defaultValue={sv?.flatPrice ?? ""}
                  placeholder="399"
                  className={INPUT}
                />
              </Field>
              <Field label="Quantity">
                <input
                  name="tierQuantity"
                  type="number"
                  min={1}
                  required
                  defaultValue={sv?.flatQuantity ?? ""}
                  placeholder="100"
                  className={INPUT}
                />
              </Field>
            </div>
          </div>
        ) : null}

        {/* PAID mode — full multi-tier UI */}
        {pricingMode === "PAID" ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Ticket tiers
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setTiers((rows) => [...rows, emptyTier()])}
              >
                <Plus className="h-4 w-4" />
                Add tier
              </Button>
            </div>

            {tiers.map((tier, index) => (
              <div
                key={tier.key}
                className="space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-white/10"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Tier {index + 1}
                  </p>
                  {tiers.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Remove tier ${index + 1}`}
                      onClick={() =>
                        setTiers((rows) => rows.filter((row) => row.key !== tier.key))
                      }
                      className="text-muted hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Name">
                    <input
                      name="tierName"
                      required
                      minLength={2}
                      maxLength={50}
                      value={tier.name}
                      onChange={(event) => updateTier(tier.key, { name: event.target.value })}
                      placeholder="Early Bird"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Price (₹)">
                    <input
                      name="tierPrice"
                      required
                      type="number"
                      min={1}
                      max={100000}
                      inputMode="decimal"
                      value={tier.price}
                      onChange={(event) => updateTier(tier.key, { price: event.target.value })}
                      placeholder="399"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Quantity">
                    <input
                      name="tierQuantity"
                      required
                      type="number"
                      min={1}
                      max={10000}
                      inputMode="numeric"
                      value={tier.quantity}
                      onChange={(event) =>
                        updateTier(tier.key, { quantity: event.target.value })
                      }
                      placeholder="100"
                      className={INPUT}
                    />
                  </Field>
                </div>

                <Field label="Perks (comma separated)">
                  <input
                    name="tierPerks"
                    value={tier.perks}
                    onChange={(event) => updateTier(tier.key, { perks: event.target.value })}
                    placeholder="Priority entry, Free drink"
                    className={INPUT}
                  />
                </Field>
              </div>
            ))}
          </>
        ) : null}

        {/* PHASED mode — time-based flat pricing phases + optional named tiers */}
        {pricingMode === "PHASED" ? (
          <>
            <div className="rounded-2xl border border-violet-neon/30 bg-violet-neon/5 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-violet-neon">
                How phased pricing works
              </p>
              <ul className="space-y-1 text-xs text-muted">
                <li>• Phases activate sequentially based on date or when the previous phase sells out</li>
                <li>• Unsold tickets from each phase carry forward to the next phase</li>
                <li>• Example: Early Bird (₹199, 50 tix) → Phase 2 (₹299, 100 tix) → Normal (₹499, remaining)</li>
                <li>• You can also add named tiers (VIP, etc.) that sell alongside the phases</li>
              </ul>
            </div>

            {/* Phases */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Flat pricing phases
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPhases((rows) => [...rows, emptyPhase()])}
              >
                <Plus className="h-4 w-4" />
                Add phase
              </Button>
            </div>

            {phases.map((phase, index) => (
              <div
                key={phase.key}
                className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-violet-neon">
                    Phase {index + 1}
                  </span>
                  {phases.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Remove phase ${index + 1}`}
                      onClick={() =>
                        setPhases((rows) => rows.filter((row) => row.key !== phase.key))
                      }
                      className="text-muted hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>

                {/* Hidden fields for form submission */}
                <input type="hidden" name="phaseName" value={phase.name} />
                <input type="hidden" name="phasePrice" value={phase.price} />
                <input type="hidden" name="phaseQuantity" value={phase.quantity} />
                <input type="hidden" name="phaseOpensAt" value={phase.opensAt} />
                <input type="hidden" name="phaseClosesAt" value={phase.closesAt} />

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Phase name">
                    <input
                      required
                      minLength={2}
                      maxLength={50}
                      value={phase.name}
                      onChange={(e) => updatePhase(phase.key, { name: e.target.value })}
                      placeholder="Early Bird"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Price (₹)">
                    <input
                      type="number"
                      min={1}
                      required
                      inputMode="decimal"
                      value={phase.price}
                      onChange={(e) => updatePhase(phase.key, { price: e.target.value })}
                      placeholder="199"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Tickets in this phase">
                    <input
                      type="number"
                      min={1}
                      required
                      inputMode="numeric"
                      value={phase.quantity}
                      onChange={(e) => updatePhase(phase.key, { quantity: e.target.value })}
                      placeholder="50"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Phase opens at">
                    <input
                      type="datetime-local"
                      min={index === 0 ? nowLocal : (phases[index - 1].closesAt ?? phases[index - 1].opensAt ?? nowLocal)}
                      value={phase.opensAt}
                      onChange={(e) => updatePhase(phase.key, { opensAt: e.target.value })}
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Phase closes at (optional)">
                    <input
                      type="datetime-local"
                      min={phase.opensAt || nowLocal}
                      value={phase.closesAt}
                      onChange={(e) => updatePhase(phase.key, { closesAt: e.target.value })}
                      className={INPUT}
                    />
                  </Field>
                </div>
                {index > 0 ? (
                  <p className="mt-2 text-xs text-muted">
                    Unsold tickets from Phase {index} will carry forward to this phase.
                  </p>
                ) : null}
              </div>
            ))}
            {phaseError ? (
              <p className="text-sm text-red-500">{phaseError}</p>
            ) : null}

            {/* Optional named tiers alongside phases */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Named tiers (optional, e.g. VIP)
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setTiers((rows) => [...rows, emptyTier()])}
              >
                <Plus className="h-4 w-4" />
                Add tier
              </Button>
            </div>

            {tiers.map((tier, index) => (
              <div
                key={tier.key}
                className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-muted">Tier {index + 1}</span>
                  <button
                    type="button"
                    aria-label={`Remove tier ${index + 1}`}
                    onClick={() =>
                      setTiers((rows) => rows.filter((row) => row.key !== tier.key))
                    }
                    className="text-muted hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Name">
                    <input
                      name="tierName"
                      required
                      minLength={2}
                      maxLength={50}
                      value={tier.name}
                      onChange={(event) => updateTier(tier.key, { name: event.target.value })}
                      placeholder="VIP"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Price (₹)">
                    <input
                      name="tierPrice"
                      required
                      type="number"
                      min={1}
                      max={100000}
                      inputMode="decimal"
                      value={tier.price}
                      onChange={(event) => updateTier(tier.key, { price: event.target.value })}
                      placeholder="999"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Quantity">
                    <input
                      name="tierQuantity"
                      required
                      type="number"
                      min={1}
                      max={10000}
                      inputMode="numeric"
                      value={tier.quantity}
                      onChange={(event) =>
                        updateTier(tier.key, { quantity: event.target.value })
                      }
                      placeholder="20"
                      className={INPUT}
                    />
                  </Field>
                </div>

                <Field label="Perks (comma separated)">
                  <input
                    name="tierPerks"
                    value={tier.perks}
                    onChange={(event) => updateTier(tier.key, { perks: event.target.value })}
                    placeholder="VIP entry, Free drink"
                    className={INPUT}
                  />
                </Field>
              </div>
            ))}
          </>
        ) : null}
      </section>

      <section className="glass space-y-4 rounded-3xl p-5">
        <h2 className="text-base font-bold">Platform fee &amp; staffing</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <FeeOption
            value="BUYER"
            title="Pass 5% fee to buyer"
            description="Buyer pays ticket price + 5%."
            defaultChecked={sv?.feePayer !== "ORGANIZER"}
          />
          <FeeOption
            value="ORGANIZER"
            title="Absorb 5% fee"
            description="Buyer pays the listed price; 5% is deducted from your payout."
            defaultChecked={sv?.feePayer === "ORGANIZER"}
          />
        </div>

        {/* Door staff premium upsell card (includes staff count selector + terms) */}
        <DoorStaffCard
          defaultChecked={sv?.needsDoorStaff ?? false}
          onCheckedChange={setNeedsDoorStaff}
          pricing={doorStaffPricing}
          maxStaff={doorStaffMax}
          defaultTermsChecked={sv?.doorStaffTerms ?? false}
        />

      </section>

      {/* General T&C for the whole form */}
      <label className="flex cursor-pointer items-start gap-2 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
        <input
          type="checkbox"
          name="organizerTerms"
          required
          defaultChecked={sv?.organizerTerms ?? false}
          className="mt-0.5 h-4 w-4 accent-violet-neon"
        />
        <span className="text-xs text-muted">
          I confirm that the event details are accurate and I have the rights to publish this event.
          I agree to Outsiderr&apos;s{" "}
          <strong className="text-violet-neon">Organizer Terms ({termsVersion})</strong> and
          understand that the platform fee (5%) is non-refundable. I am responsible for managing
          refunds to attendees if the event is cancelled.
        </span>
      </label>

      {state.error ? <p className="text-sm text-red-500">{state.error}</p> : null}

      <Button type="submit" size="lg" disabled={pending || !!dateError || !!mapsError || !!phaseError} loading={pending} loadingText="Publishing…">
        Publish event
      </Button>
    </form>
  );
}

/* ── Door staff premium card ── */
function DoorStaffCard({
  defaultChecked,
  onCheckedChange,
  pricing,
  maxStaff,
  defaultTermsChecked = false,
}: {
  defaultChecked: boolean;
  onCheckedChange: (checked: boolean) => void;
  pricing: Record<string, number>;
  maxStaff: number;
  defaultTermsChecked?: boolean;
}) {
  const [checked, setChecked] = useState(defaultChecked);
  const [staffCount, setStaffCount] = useState(1);

  const priceForCount = pricing[String(staffCount)] ?? 0;
  const staffOptions = Array.from({ length: maxStaff }, (_, i) => i + 1);

  return (
    <div
      className={cn(
        "rounded-2xl border p-5 transition-all",
        checked
          ? "border-violet-neon bg-violet-neon/5 shadow-[0_0_20px_rgba(139,92,246,0.25)]"
          : "border-zinc-200 dark:border-white/10",
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-neon-gradient text-white">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black">Outsiderr Door Staff</h3>
              <p className="text-xs text-muted">Professional check-in team for your event</p>
            </div>
            {checked ? (
              <div className="text-right">
                <p className="text-lg font-black text-violet-neon">
                  ₹{priceForCount.toLocaleString("en-IN")}
                </p>
                <p className="text-[10px] text-muted">
                  for {staffCount} {staffCount === 1 ? "staff" : "staff"}
                </p>
              </div>
            ) : null}
          </div>

          <ul className="space-y-1 text-xs text-muted">
            <li className="flex items-center gap-1.5">
              <Users className="h-3 w-3 text-violet-neon" />
              Trained staff with QR scanners
            </li>
            <li className="flex items-center gap-1.5">
              <Users className="h-3 w-3 text-violet-neon" />
              Handle up to 500 attendees smoothly
            </li>
            <li className="flex items-center gap-1.5">
              <Users className="h-3 w-3 text-violet-neon" />
              Real-time attendance dashboard
            </li>
          </ul>

          <label className="flex cursor-pointer items-center gap-2 pt-1">
            <input
              type="checkbox"
              name="needsDoorStaff"
              checked={checked}
              onChange={(e) => {
                setChecked(e.target.checked);
                onCheckedChange(e.target.checked);
              }}
              className="h-4 w-4 accent-violet-neon"
            />
            <span className="text-sm font-semibold">
              Yes, I want Outsiderr door staff for my event
            </span>
          </label>

          {checked ? (
            <div className="space-y-3 pt-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                  Number of staff
                </label>
                <div className="flex flex-wrap gap-2">
                  {staffOptions.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setStaffCount(n)}
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-bold transition-all",
                        staffCount === n
                          ? "border-violet-neon bg-violet-neon text-white"
                          : "border-zinc-200 text-muted hover:border-violet-neon/50 dark:border-white/10",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <input type="hidden" name="doorStaffCount" value={staffCount} />
              <input type="hidden" name="doorStaffAmount" value={priceForCount} />

              <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                <p className="font-bold">Disclaimer</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>
                    Service amount:{" "}
                    <strong>₹{priceForCount.toLocaleString("en-IN")}</strong> for {staffCount}{" "}
                    {staffCount === 1 ? "staff" : "staff"}.
                  </li>
                  <li>
                    Staff count must be confirmed at least <strong>2 days before</strong> the event.
                  </li>
                  <li>
                    Requests made within 2 days of the event may be cancelled if staff is
                    unavailable.
                  </li>
                  <li>
                    <strong>No refund</strong> for door staff charges once the organizer pays.
                  </li>
                </ul>
              </div>

              <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-white/5">
                <input
                  type="checkbox"
                  name="doorStaffTerms"
                  defaultChecked={defaultTermsChecked}
                  className="mt-0.5 h-4 w-4 accent-violet-neon"
                />
                <span className="text-xs text-muted">
                  I agree to the door staff terms &amp; refund policy. I understand that door staff
                  charges are <strong>non-refundable</strong> once paid.
                </span>
              </label>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── Pricing mode card ── */
function PricingModeCard({
  active,
  onClick,
  title,
  description,
}: {
  mode: PricingMode;
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 text-left transition-all",
        active
          ? "border-violet-neon bg-violet-neon/10 shadow-glow-violet"
          : "border-zinc-200 hover:border-violet-neon/50 dark:border-white/10",
      )}
    >
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 text-xs text-muted">{description}</p>
    </button>
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

function FeeOption({
  value,
  title,
  description,
  defaultChecked,
}: {
  value: string;
  title: string;
  description: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-2xl border border-zinc-200 p-4 text-sm transition-colors hover:border-violet-neon dark:border-white/10">
      <input
        type="radio"
        name="feePayer"
        value={value}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 accent-violet-neon"
      />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
    </label>
  );
}

function PosterField({
  name,
  label,
  organizerName,
  eventTitle,
  subFolder,
  initialValue,
}: {
  name: string;
  label: string;
  organizerName: string;
  eventTitle: string;
  subFolder: string;
  initialValue?: string;
}) {
  const [url, setUrl] = useState(initialValue ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);

  // Build path: organizer-name/event-title/subFolder/filename
  // Sanitize: lowercase, replace spaces/special chars with hyphens
  const safeOrg = organizerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "organizer";
  const safeTitle = eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled-event";
  const folder = `${safeOrg}/${safeTitle}/${subFolder}`;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadPublicFile(file, folder);
      if (uploaded) setUrl(uploaded);
      else setUploadError(true);
    } catch {
      setUploadError(true);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-zinc-300 px-4 py-4 text-sm text-muted hover:border-violet-neon dark:border-white/15">
        <Upload className="h-4 w-4" />
        {uploading ? "Uploading…" : url ? "Uploaded" : "Choose image"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </label>
      <input
        name={name}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder={uploadError ? "Upload failed — paste an image URL" : "or paste an image URL"}
        className={INPUT}
      />
    </div>
  );
}
