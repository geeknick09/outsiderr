"use client";

import Image from "next/image";

export function PhotoGallery({
  photos,
  title,
}: {
  photos: string[];
  title: string;
}) {
  if (photos.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-base font-bold">Photos</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {photos.map((src, index) => (
          <div
            key={src}
            className="relative h-[186px] w-[280px] shrink-0 overflow-hidden rounded-2xl"
          >
            <Image
              src={src}
              alt={`${title} photo ${index + 1}`}
              fill
              sizes="280px"
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
