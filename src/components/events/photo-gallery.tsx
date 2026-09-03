"use client";

import Image from "next/image";
import { useState } from "react";
import { X, ZoomIn } from "lucide-react";

export function PhotoGallery({
  photos,
  title,
}: {
  photos: string[];
  title: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  if (photos.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-base font-bold">Photos</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {photos.map((src, index) => (
          <button
            key={src}
            type="button"
            onClick={() => setSelected(src)}
            className="group relative h-[186px] w-[280px] shrink-0 overflow-hidden rounded-2xl"
          >
            <Image
              src={src}
              alt={`${title} photo ${index + 1}`}
              fill
              sizes="280px"
              className="object-cover transition-transform group-hover:scale-105"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
              <ZoomIn className="h-6 w-6 text-white" />
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="relative h-full max-h-[85vh] w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={selected}
              alt={`${title} photo`}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
