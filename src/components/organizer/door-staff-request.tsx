"use client";

import { useState } from "react";
import { ShieldCheck, Users } from "lucide-react";

import { createDoorStaffOrderAction } from "@/actions/door-staff";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DoorStaffRequest({
  eventId,
  pricing,
  maxStaff,
}: {
  eventId: string;
  pricing: Record<string, number>;
  maxStaff: number;
}) {
  const [staffCount, setStaffCount] = useState(1);
  const [termsChecked, setTermsChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const priceForCount = pricing[String(staffCount)] ?? 0;
  const staffOptions = Array.from({ length: maxStaff }, (_, i) => i + 1);

  async function handleSubmit() {
    if (!termsChecked) {
      setError("Please accept the door staff terms to continue.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createDoorStaffOrderAction(eventId, staffCount, priceForCount * 100);
    if (result.error) {
      setError(result.error);
    }
    setSubmitting(false);
  }

  return (
    <div className="glass space-y-4 rounded-3xl p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-neon-gradient text-white">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-black">Add Outsiderr Door Staff</h3>
          <p className="text-xs text-muted">Professional check-in team for your event</p>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Number of staff
        </label>
        <div className="flex flex-wrap gap-2">
          {staffOptions.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setStaffCount(n)}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-bold transition-all",
                staffCount === n
                  ? "border-violet-neon bg-violet-neon text-white"
                  : "border-zinc-200 text-muted hover:border-violet-neon/50 dark:border-white/10",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="text-right">
        <p className="text-lg font-black text-violet-neon">
          ₹{priceForCount.toLocaleString("en-IN")}
        </p>
        <p className="text-[10px] text-muted">
          for {staffCount} {staffCount === 1 ? "staff" : "staff"}
        </p>
      </div>

      <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
        <p className="font-bold">Disclaimer</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>
            Service amount: <strong>₹{priceForCount.toLocaleString("en-IN")}</strong> for {staffCount} staff.
          </li>
          <li>
            Staff count must be confirmed at least <strong>2 days before</strong> the event.
          </li>
          <li>
            <strong>No refund</strong> for door staff charges once the organizer pays.
          </li>
        </ul>
      </div>

      <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-white/5">
        <input
          type="checkbox"
          checked={termsChecked}
          onChange={(e) => setTermsChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-violet-neon"
        />
        <span className="text-xs text-muted">
          I agree to the door staff terms &amp; refund policy. I understand that door staff
          charges are <strong>non-refundable</strong> once paid.
        </span>
      </label>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !termsChecked}
        className="w-full"
      >
        <Users className="h-4 w-4" />
        {submitting ? "Requesting…" : `Request ${staffCount} door staff`}
      </Button>
    </div>
  );
}
