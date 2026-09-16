"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";

import { submitReview } from "@/actions/reviews";

interface ReviewFormProps {
  eventId: string;
  eventTitle: string;
  onSubmitted?: () => void;
}

export function ReviewForm({ eventId, eventTitle, onSubmitted }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (rating < 1 || rating > 5) {
      setError("Please select a rating (1-5 stars).");
      return;
    }

    startTransition(async () => {
      const result = await submitReview(eventId, rating, text.trim() || null);
      if (result.success) {
        setSuccess(true);
        onSubmitted?.();
      } else {
        setError(result.error ?? "Failed to submit review.");
      }
    });
  }

  if (success) {
    return (
      <div className="glass rounded-2xl p-4 text-center">
        <p className="text-sm font-semibold text-violet-neon">Thanks for your review!</p>
        <p className="mt-1 text-xs text-muted">Your feedback helps the community.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass space-y-3 rounded-2xl p-4">
      <div>
        <p className="text-sm font-bold">Review: {eventTitle}</p>
        <p className="text-xs text-muted">Share your experience with the community.</p>
      </div>

      {/* Star rating */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="rounded p-0.5 transition-transform hover:scale-110"
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
          >
            <Star
              className={`h-7 w-7 ${
                (hover || rating) >= star
                  ? "fill-violet-neon text-violet-neon"
                  : "fill-transparent text-zinc-300 dark:text-zinc-600"
              }`}
            />
          </button>
        ))}
        {rating > 0 && (
          <span className="ml-2 text-sm font-semibold text-muted">
            {["", "Poor", "Fair", "Good", "Great", "Excellent"][rating]}
          </span>
        )}
      </div>

      {/* Review text */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Optional — tell others about the vibe, organization, music, etc."
        maxLength={1000}
        rows={3}
        className="w-full resize-none rounded-xl border border-zinc-200 bg-white/50 px-3 py-2 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{text.length}/1000</span>
        <button
          type="submit"
          disabled={isPending || rating === 0}
          className="rounded-xl bg-neon-gradient px-4 py-2 text-sm font-bold text-white shadow-glow-violet transition-opacity disabled:opacity-50"
        >
          {isPending ? "Submitting..." : "Submit Review"}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </form>
  );
}
