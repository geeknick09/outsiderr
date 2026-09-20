import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";

import type { EventReview } from "@/modules/shared";
import { formatDateTime } from "@/modules/shared";

interface EventReviewsProps {
  reviews: EventReview[];
  organizerId: string;
}

function StarRow({ rating, size = "h-4 w-4" }: { rating: number; size?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${size} ${
            star <= Math.round(rating)
              ? "fill-violet-neon text-violet-neon"
              : "fill-transparent text-zinc-300 dark:text-zinc-600"
          }`}
        />
      ))}
    </div>
  );
}

export function EventReviews({ reviews, organizerId }: EventReviewsProps) {
  if (reviews.length === 0) return null;

  const avg =
    reviews.length > 0
      ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
      : 0;

  return (
    <section className="glass rounded-3xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Star className="h-4 w-4 text-violet-neon" />
          Attendee Reviews
        </h2>
        <div className="flex items-center gap-1.5 rounded-full bg-violet-neon/10 px-3 py-1">
          <Star className="h-3.5 w-3.5 fill-violet-neon text-violet-neon" />
          <span className="text-xs font-bold text-violet-neon">{avg}</span>
          <span className="text-xs text-muted">({reviews.length})</span>
        </div>
      </div>

      {/* Show up to 3 most recent reviews */}
      <div className="space-y-3">
        {reviews.slice(0, 3).map((review) => (
          <div key={review.id} className="flex items-start gap-3 border-b border-zinc-100 pb-3 last:border-0 last:pb-0 dark:border-white/5">
            {review.userAvatarUrl ? (
              <Image
                src={review.userAvatarUrl}
                alt={review.userName ?? "Reviewer"}
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neon-gradient text-xs font-bold text-white">
                {(review.userName ?? "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold">{review.userName ?? "Anonymous"}</p>
                <StarRow rating={review.rating} size="h-3 w-3" />
              </div>
              {review.reviewText && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                  {review.reviewText}
                </p>
              )}
              <p className="mt-1 text-xs text-muted">{formatDateTime(review.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>

      {reviews.length > 3 && (
        <Link
          href={`/organizers/${organizerId}`}
          className="mt-3 block text-center text-xs font-semibold text-violet-neon hover:underline"
        >
          See all {reviews.length} reviews on organizer profile →
        </Link>
      )}
    </section>
  );
}
