"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
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
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  // Read view renders this, not event.* (stale until router.refresh() lands).
  const [viewMedia, setViewMedia] = useState({
    photoUrls: event.photoUrls ?? [],
    cardPosterUrl: event.cardPosterUrl ?? "",
    bannerPosterUrl: event.bannerPosterUrl ?? "",
    teaserVideoUrl: event.teaserVideoUrl ?? "",
  });
  const pendingMedia = useRef<typeof viewMedia | null>(null);

  useEffect(() => {
    if (state.saved === "media") {
      if (pendingMedia.current) setViewMedia(pendingMedia.current);
      setIsEditing(false);
      router.refresh();
    }
  }, [state]);

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
      <form
        id="sec-media"
        action={formAction}
        className="space-y-4"
        onSubmit={(e) => {
          const fd = new FormData(e.currentTarget);
          pendingMedia.current = {
            photoUrls: fd.getAll("photoUrls[]").map(String).filter(Boolean),
            cardPosterUrl: String(fd.get("cardPosterUrl") ?? ""),
            bannerPosterUrl: String(fd.get("bannerPosterUrl") ?? ""),
            teaserVideoUrl: String(fd.get("teaserVideoUrl") ?? ""),
          };
        }}
      >
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="section" value="media" />

        {!isEditing ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {viewMedia.cardPosterUrl ? (
              <div className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={viewMedia.cardPosterUrl} alt="Card poster" className="aspect-[3/4] w-full rounded-xl object-cover" />
                <p className="text-[10px] font-semibold uppercase text-muted">Card</p>
              </div>
            ) : null}
            {viewMedia.bannerPosterUrl ? (
              <div className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={viewMedia.bannerPosterUrl} alt="Banner poster" className="aspect-video w-full rounded-xl object-cover" />
                <p className="text-[10px] font-semibold uppercase text-muted">Banner</p>
              </div>
            ) : null}
            {viewMedia.photoUrls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="Gallery" className="aspect-square w-full rounded-xl object-cover" />
            ))}
            {!viewMedia.cardPosterUrl && !viewMedia.bannerPosterUrl && viewMedia.photoUrls.length === 0 ? (
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
                initialUrls={viewMedia.photoUrls}
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
                initialValue={viewMedia.cardPosterUrl}
                aspect={3 / 4}
              />
              <PosterField
                name="bannerPosterUrl"
                label="Banner poster (16:9)"
                organizerName={event.organizer.name}
                eventTitle={event.title}
                subFolder="banner-posters"
                initialValue={viewMedia.bannerPosterUrl}
                aspect={16 / 9}
              />
            </div>

            <TeaserVideoField
              name="teaserVideoUrl"
              label="Teaser video"
              organizerName={event.organizer.name}
              eventTitle={event.title}
              subFolder="teasers"
              initialValue={viewMedia.teaserVideoUrl}
            />
          </>
        )}

        {/* When not editing, still post current values so section saves don't wipe media. */}
        {!isEditing ? (
          <>
            {viewMedia.photoUrls.map((url) => (
              <input key={url} type="hidden" name="photoUrls[]" value={url} />
            ))}
            <input type="hidden" name="cardPosterUrl" value={viewMedia.cardPosterUrl} />
            <input type="hidden" name="bannerPosterUrl" value={viewMedia.bannerPosterUrl} />
            <input type="hidden" name="teaserVideoUrl" value={viewMedia.teaserVideoUrl} />
          </>
        ) : null}
      </form>
    </CollapsibleSection>
  );
}
