"use client";

import { useActionState, useState } from "react";

import { updateEventAction, type UpdateEventState } from "../actions/events";
import { GalleryUploader } from "./gallery-uploader";
import { PosterGuidelines } from "./poster-guidelines";
import { PosterField, TeaserVideoField } from "./event-form";
import {
  EditDetailsSection,
  EditTimeSection,
  EditVenueSection,
  EditTicketsSection,
} from "./edit-sections";
import { Button } from "@/modules/shared";
import { PhoneInput } from "@/modules/shared";
import type { EventDetail } from "@/modules/shared";

const INPUT =
  "w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white";

export function EditEventForm({ event, lockLogistics = false }: { event: EventDetail; /** Collaborators: city/venue/date fields are locked — owner only. */ lockLogistics?: boolean }) {
  const [, formAction, pending] = useActionState<UpdateEventState, FormData>(
    updateEventAction,
    { error: null },
  );

  const [dirty, setDirty] = useState(false);

  function updateField() {
    setDirty(true);
  }

  return (
    <form action={formAction} className="glass space-y-4 rounded-3xl p-5">
      <div>
        <h2 className="text-base font-bold">Manage event details</h2>
        <p className="mt-1 text-xs text-muted">Changes are submitted together so the event stays consistent.</p>
      </div>

      {/* Hidden event id */}
      <input type="hidden" name="eventId" value={event.id} />

      <nav aria-label="Event sections" className="sticky top-16 z-20 -mx-1 flex gap-2 overflow-x-auto bg-zinc-50/95 px-1 py-2 backdrop-blur-sm dark:bg-ink/95">
        {[
          ["event-details", "Details"],
          ["event-schedule", "Schedule & venue"],
          ["event-media", "Media"],
          ["event-information", "Information"],
          ["event-contact", "Contact"],
          ["event-tickets", "Tickets"],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/10"
          >
            {label}
          </a>
        ))}
      </nav>

      <EditDetailsSection event={event} lockLogistics={lockLogistics} onSave={() => setDirty(true)} />\n\n      <EditTimeSection event={event} lockLogistics={lockLogistics} onSave={() => setDirty(true)} />\n      <EditVenueSection event={event} lockLogistics={lockLogistics} latitude={event.latitude ? String(event.latitude) : ""} longitude={event.longitude ? String(event.longitude) : ""} onLocationChange={(newLat, newLng) => { setLat(String(newLat)); setLng(String(newLng)); setDirty(true); }} onSave={() => setDirty(true)} />\n\n      <section id="event-media" className="scroll-mt-36 space-y-4 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
      <h3 className="text-sm font-bold">Media & gallery</h3>
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

      {/* Posters */}
      <PosterGuidelines />
      <div className="grid gap-4 sm:grid-cols-2">
        <PosterField
          name="cardPosterUrl"
          label="Card poster (3:4)"
          organizerName={event.organizer.name}
          eventTitle={event.title}
          subFolder="card-posters"
          initialValue={event.cardPosterUrl ?? ""}
          aspect={3 / 4}
        />
        <PosterField
          name="bannerPosterUrl"
          label="Banner poster (16:9)"
          organizerName={event.organizer.name}
          eventTitle={event.title}
          subFolder="banner-posters"
          initialValue={event.bannerPosterUrl ?? ""}
          aspect={16 / 9}
        />
      </div>

      {/* Optional teaser video — muted autoplay on the discovery card */}
      <div className="glass rounded-3xl p-5">
        <TeaserVideoField
          name="teaserVideoUrl"
          label="Teaser video"
          organizerName={event.organizer.name}
          eventTitle={event.title}
          subFolder="teasers"
          initialValue={event.teaserVideoUrl ?? ""}
        />
      </div>
      </section>

      <section id="event-information" className="scroll-mt-36 space-y-4 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
      <h3 className="text-sm font-bold">Event information</h3>
      {/* Things to know */}
      <Field label="Things to know (one per line)">
        <textarea
          name="thingsToKnow"
          rows={4}
          defaultValue={event.thingsToKnow.join("\n")}
          onChange={() => updateField()}
          placeholder={"Bring valid ID\nNo outside food"}
          className={INPUT}
        />
      </Field>

      {/* Terms & conditions */}
      <Field label="Terms & conditions (one per line, defaults applied when empty)">
        <textarea
          name="terms"
          rows={4}
          defaultValue={event.terms.join("\n")}
          onChange={() => updateField()}
          placeholder={"No refunds after purchase\nEntry closes 30 min before start"}
          className={INPUT}
        />
      </Field>
      </section>

      <section id="event-contact" className="scroll-mt-36 space-y-4 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
      <h3 className="text-sm font-bold">Contact & social</h3>
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
          <PhoneInput name="contactPhone" defaultValue={event.contactPhone ?? ""} />
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
      </section>

      <EditTicketsSection event={event} lockLogistics={lockLogistics} onSave={() => setDirty(true)} />\n\n      <Button type="submit" disabled={pending || !dirty} loading={pending} loadingText="Saving…">
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
