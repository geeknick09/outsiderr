"use client";

import { useActionState, useEffect, useState } from "react";
import { CollapsibleSection } from "@/modules/shared";
import { GalleryUploader } from "../gallery-uploader";
import { PosterGuidelines } from "../poster-guidelines";
import { PosterField, TeaserVideoField } from "../event-form";
import { updateEventSectionAction, type UpdateEventSectionState } from "../../actions/events";
import type { EventDetail } from "@/modules/shared";

export function EditMediaSection({ event }: { event: EventDetail }) {
  const [state, formAction, pending] = useActionState<UpdateEventSectionState, FormData>(
    updateEventSectionAction,
    { error: null },
  );
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (state.saved === "media") setIsEditing(false);
  }, [state.saved]);

  return (
    <CollapsibleSection
      title="Media & Gallery"
      description="Card poster, banner, teaser video and event photos."
      onEdit={() => setIsEditing(true)}
      isEditing={isEditing}
      onCancel={() => setIsEditing(false)}
      formId="sec-media"
      pending={pending}
      error={state.error}
      saved={state.saved === "media"}
    >
      <form id="sec-media" action={formAction} className="space-y-4">
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="section" value="media" />

        {!isEditing ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {event.cardPosterUrl ? (
              <div className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={event.cardPosterUrl} alt="Card poster" className="aspect-[3/4] w-full rounded-xl object-cover" />
                <p className="text-[10px] font-semibold uppercase text-muted">Card</p>
              </div>
            ) : null}
            {event.bannerPosterUrl ? (
              <div className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={event.bannerPosterUrl} alt="Banner poster" className="aspect-video w-full rounded-xl object-cover" />
                <p className="text-[10px] font-semibold uppercase text-muted">Banner</p>
              </div>
            ) : null}
            {(event.photoUrls ?? []).map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="Gallery" className="aspect-square w-full rounded-xl object-cover" />
            ))}
            {!event.cardPosterUrl && !event.bannerPosterUrl && (event.photoUrls ?? []).length === 0 ? (
              <p className="col-span-full text-sm text-muted">No media uploaded yet.</p>
            ) : null}
          </div>
        ) : (
          <>
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

            <TeaserVideoField
              name="teaserVideoUrl"
              label="Teaser video"
              organizerName={event.organizer.name}
              eventTitle={event.title}
              subFolder="teasers"
              initialValue={event.teaserVideoUrl ?? ""}
            />
          </>
        )}

        {/* When not editing, still post current values so section saves don't wipe media. */}
        {!isEditing ? (
          <>
            {(event.photoUrls ?? []).map((url) => (
              <input key={url} type="hidden" name="photoUrls[]" value={url} />
            ))}
            <input type="hidden" name="cardPosterUrl" value={event.cardPosterUrl ?? ""} />
            <input type="hidden" name="bannerPosterUrl" value={event.bannerPosterUrl ?? ""} />
            <input type="hidden" name="teaserVideoUrl" value={event.teaserVideoUrl ?? ""} />
          </>
        ) : null}
      </form>
    </CollapsibleSection>
  );
}
