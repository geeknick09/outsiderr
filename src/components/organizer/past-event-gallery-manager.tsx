"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

export function PastEventGalleryManager({
  eventId,
  photoUrls,
}: {
  eventId: string;
  photoUrls: string[];
}) {
  const [photos, setPhotos] = useState(photoUrls);
  const [pending, startTransition] = useTransition();

  function handleDelete(url: string) {
    startTransition(async () => {
      const updated = photos.filter((p) => p !== url);
      setPhotos(updated);
      // Update the event's photo_urls via a server action
      const { updateEventAction } = await import("@/actions/events");
      const formData = new FormData();
      formData.append("eventId", eventId);
      formData.append("galleryOnly", "true");
      updated.forEach((u) => formData.append("photoUrls[]", u));
      await updateEventAction({ error: null }, formData);
    });
  }

  if (photos.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Gallery</h2>
        <p className="glass rounded-2xl p-4 text-sm text-muted">
          No gallery photos. This event is completed — only photo deletion is allowed.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Gallery (read-only event)</h2>
      <p className="text-xs text-muted">
        This event has ended. You can delete gallery photos but cannot edit other details.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((url) => (
          <div key={url} className="group relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Gallery" className="aspect-square w-full object-cover" />
            <button
              type="button"
              disabled={pending}
              onClick={() => handleDelete(url)}
              className="absolute right-2 top-2 rounded-xl bg-red-500/80 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600 disabled:opacity-50"
              aria-label="Delete photo"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
