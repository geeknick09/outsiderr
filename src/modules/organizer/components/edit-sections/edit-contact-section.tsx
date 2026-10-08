"use client";

import { useActionState, useEffect, useState } from "react";
import { CollapsibleSection } from "@/modules/shared";
import { PhoneInput } from "@/modules/shared";
import { updateEventSectionAction, type UpdateEventSectionState } from "../../actions/events";
import type { EventDetail } from "@/modules/shared";

const INPUT =
  "w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white disabled:opacity-50";

export function EditContactSection({ event }: { event: EventDetail }) {
  const [state, formAction, pending] = useActionState<UpdateEventSectionState, FormData>(
    updateEventSectionAction,
    { error: null },
  );
  const [isEditing, setIsEditing] = useState(false);
  const [contactEmail, setContactEmail] = useState(event.contactEmail ?? "");
  const [instagramUrl, setInstagramUrl] = useState(event.instagramUrl ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(event.youtubeUrl ?? "");
  const [xUrl, setXUrl] = useState(event.xUrl ?? "");
  const [facebookUrl, setFacebookUrl] = useState(event.facebookUrl ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(event.linkedinUrl ?? "");

  useEffect(() => {
    if (state.saved === "contact") setIsEditing(false);
  }, [state.saved]);

  function handleCancel() {
    setContactEmail(event.contactEmail ?? "");
    setInstagramUrl(event.instagramUrl ?? "");
    setYoutubeUrl(event.youtubeUrl ?? "");
    setXUrl(event.xUrl ?? "");
    setFacebookUrl(event.facebookUrl ?? "");
    setLinkedinUrl(event.linkedinUrl ?? "");
    setIsEditing(false);
  }

  return (
    <CollapsibleSection
      title="Contact & Social"
      description="Attendee contact info and social links."
      onEdit={() => setIsEditing(true)}
      isEditing={isEditing}
      onCancel={handleCancel}
      formId="sec-contact"
      pending={pending}
      error={state.error}
      saved={state.saved === "contact"}
    >
      <form id="sec-contact" action={formAction} className="space-y-4">
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="section" value="contact" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Contact email</label>
            <input
              name="contactEmail"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              readOnly={!isEditing}
              placeholder="organizer@email.com"
              className={INPUT}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Contact phone</label>
            {isEditing ? (
              <PhoneInput name="contactPhone" defaultValue={event.contactPhone ?? ""} />
            ) : (
              <>
                <p className="py-2.5 text-sm text-muted">{event.contactPhone || "-"}</p>
                <input type="hidden" name="contactPhone" value={event.contactPhone ?? ""} />
              </>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Instagram URL</label>
          <input
            name="instagramUrl"
            type="text"
            value={instagramUrl}
            onChange={(e) => setInstagramUrl(e.target.value)}
            readOnly={!isEditing}
            placeholder="https://instagram.com/yourevent"
            className={INPUT}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">YouTube URL</label>
            <input
              name="youtubeUrl"
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              readOnly={!isEditing}
              placeholder="https://youtube.com/@yourevent"
              className={INPUT}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">X URL</label>
            <input
              name="xUrl"
              type="text"
              value={xUrl}
              onChange={(e) => setXUrl(e.target.value)}
              readOnly={!isEditing}
              placeholder="https://x.com/yourevent"
              className={INPUT}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Facebook URL</label>
            <input
              name="facebookUrl"
              type="text"
              value={facebookUrl}
              onChange={(e) => setFacebookUrl(e.target.value)}
              readOnly={!isEditing}
              placeholder="https://facebook.com/yourevent"
              className={INPUT}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">LinkedIn URL</label>
            <input
              name="linkedinUrl"
              type="text"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              readOnly={!isEditing}
              placeholder="https://linkedin.com/in/yourevent"
              className={INPUT}
            />
          </div>
        </div>
      </form>
    </CollapsibleSection>
  );
}
