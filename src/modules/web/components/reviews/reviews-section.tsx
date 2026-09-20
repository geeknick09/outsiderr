import Image from "next/image";
import { Star } from "lucide-react";

import type { EventReview, OrganizerRating } from "@/modules/shared";
import { formatDateTime } from "@/modules/shared";

interface ReviewsSectionProps {
  reviews: EventReview[];
  rating: OrganizerRating;
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

export function ReviewsSection({ reviews, rating }: ReviewsSectionProps) {
  if (rating.totalReviews === 0) {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-violet-neon" />
          <h2 className="text-xl font-bold">Reviews</h2>
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
            0
          </span>
        </div>
        <p className="glass rounded-3xl p-6 text-sm text-muted">
          No reviews yet. Reviews appear after attendees check in at events.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Star className="h-5 w-5 text-violet-neon" />
        <h2 className="text-xl font-bold">Reviews</h2>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
          {rating.totalReviews}
        </span>
      </div>

      {/* Rating summary */}
      <div className="glass flex items-center gap-6 rounded-3xl p-5">
        <div className="text-center">
          <div className="text-4xl font-black">{rating.averageRating.toFixed(1)}</div>
          <StarRow rating={rating.averageRating} size="h-5 w-5" />
          <div className="mt-1 text-xs text-muted">{rating.totalReviews} review{rating.totalReviews !== 1 ? "s" : ""}</div>
        </div>
        {/* Distribution */}
        <div className="flex-1 space-y-1">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = rating.distribution[star - 1];
            const pct = rating.totalReviews > 0 ? (count / rating.totalReviews) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-2">
                <span className="w-3 text-xs text-muted">{star}</span>
                <Star className="h-3 w-3 fill-violet-neon text-violet-neon" />
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-violet-neon"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-6 text-right text-xs text-muted">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Individual reviews */}
      <div className="space-y-3">
        {reviews.map((review) => (
          <div key={review.id} className="glass rounded-2xl p-4">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              {review.userAvatarUrl ? (
                <Image
                  src={review.userAvatarUrl}
                  alt={review.userName ?? "Reviewer"}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neon-gradient text-sm font-bold text-white">
                  {(review.userName ?? "?").slice(0, 1).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      {review.userName ?? "Anonymous"}
                    </p>
                    <p className="text-xs text-muted">
                      {review.eventTitle} · {formatDateTime(review.createdAt)}
                    </p>
                  </div>
                  <StarRow rating={review.rating} />
                </div>
                {review.reviewText && (
                  <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {review.reviewText}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
