"use client";

import { useState } from "react";
import { GripVertical, ImagePlus, Trash2, Upload } from "lucide-react";

import { uploadPublicFile, compressImage, cn } from "@/modules/shared";

const MAX_PHOTOS = 8;

export function GalleryUploader({
  name,
  initialUrls = [],
  organizerName,
  eventTitle,
}: {
  name: string;
  initialUrls?: string[];
  organizerName: string;
  eventTitle: string;
}) {
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Build path: organizer-name/event-title/gallery
  const safeOrg = organizerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "organizer";
  const safeTitle = eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled-event";
  const folder = `${safeOrg}/${safeTitle}/gallery`;

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    if (urls.length >= MAX_PHOTOS) {
      setError(`Maximum ${MAX_PHOTOS} photos allowed.`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImage(file, 1_000_000);
      const url = await uploadPublicFile(compressed, folder);
      if (url) {
        setUrls((prev) => [...prev, url]);
      } else {
        setError("Upload failed. Paste an image URL instead.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function removeUrl(index: number) {
    setUrls((prev) => prev.filter((_, i) => i !== index));
  }

  function addManualUrl() {
    if (urls.length >= MAX_PHOTOS) {
      setError(`Maximum ${MAX_PHOTOS} photos allowed.`);
      return;
    }
    setUrls((prev) => [...prev, ""]);
  }

  function updateManualUrl(index: number, value: string) {
    setUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }

  function moveUrl(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setUrls((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {/* Photo grid */}
      {urls.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {urls.map((url, index) => (
            <div
              key={index}
              draggable
              onDragStart={(event) => {
                setDraggedIndex(index);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(index));
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const sourceIndex = draggedIndex ?? Number(event.dataTransfer.getData("text/plain"));
                moveUrl(sourceIndex, index);
                setDraggedIndex(null);
              }}
              onDragEnd={() => setDraggedIndex(null)}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-xl border border-zinc-200 transition-opacity dark:border-white/10",
                draggedIndex === index && "opacity-40",
              )}
            >
              <span className="pointer-events-none absolute left-1 top-1 z-10 flex h-6 w-6 cursor-grab items-center justify-center rounded-full bg-black/60 text-white opacity-70 active:cursor-grabbing">
                <GripVertical className="h-3.5 w-3.5" />
              </span>
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={`Gallery ${index + 1}`} className="h-full w-full object-cover" />
              ) : (
                <input
                  type="url"
                  value={url}
                  onChange={(e) => updateManualUrl(index, e.target.value)}
                  placeholder="Paste URL"
                  className="h-full w-full rounded-xl border-0 px-2 text-xs outline-none focus:ring-1 focus:ring-violet-neon"
                />
              )}
              <button
                type="button"
                onClick={() => removeUrl(index)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Upload controls */}
      <div className="flex flex-wrap gap-2">
        <label
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-4 py-2.5 text-sm text-muted hover:border-violet-neon dark:border-white/15",
            urls.length >= MAX_PHOTOS && "pointer-events-none opacity-50",
          )}
        >
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading…" : "Upload photo"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handleUpload(e.target.files?.[0])}
          />
        </label>
        <button
          type="button"
          onClick={addManualUrl}
          disabled={urls.length >= MAX_PHOTOS}
          className="flex items-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-4 py-2.5 text-sm text-muted hover:border-violet-neon disabled:opacity-50 dark:border-white/15"
        >
          <ImagePlus className="h-4 w-4" />
          Add URL
        </button>
        <span className="self-center text-xs text-muted">
          {urls.length}/{MAX_PHOTOS} photos
        </span>
      </div>

      {error ? <p className="text-xs text-amber-500">{error}</p> : null}

      {/* Hidden inputs for form submission */}
      {urls.filter(Boolean).map((url, index) => (
        <input key={index} type="hidden" name={name} value={url} />
      ))}
    </div>
  );
}
