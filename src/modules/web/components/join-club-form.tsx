"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Lock } from "lucide-react";

import {
  handleClubFailureAction,
  joinClubAction,
  startClubCheckoutAction,
  verifyClubPaymentAction,
} from "@/modules/shared/actions/clubs";
import { Button, RazorpayCheckout, formatPaise } from "@/modules/shared";
import type { CheckoutSession, Club } from "@/modules/shared";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function JoinClubForm({ club }: { club: Club }) {
  const [instagramLink, setInstagramLink] = useState("");
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="glass flex flex-col items-center gap-3 rounded-3xl p-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-lime-neon" />
        <div>
          <p className="font-bold">
            {club.membershipType === "FREE" ? "You're in!" : "Request submitted!"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {club.membershipType === "FREE"
              ? `Welcome to ${club.name}.`
              : club.membershipType === "AUDITION"
              ? "The crew will review your Instagram and get back to you."
              : "Your membership confirms the moment the payment clears."}
          </p>
        </div>
      </div>
    );
  }

  // PAID club — after the member row exists, open Razorpay Checkout.
  if (session) {
    return (
      <RazorpayCheckout
        session={session}
        verifyAction={verifyClubPaymentAction}
        failureAction={handleClubFailureAction}
        successRedirect={`/clubs/${club.id}?paid=1`}
        onError={(msg) => {
          setSession(null);
          setError(msg);
        }}
        onCancel={() => setSession(null)}
      />
    );
  }

  function handleJoin() {
    setError(null);
    if (club.membershipType === "AUDITION" && !instagramLink.trim()) {
      setError("Paste your Instagram link so the crew can review your talent.");
      return;
    }
    startTransition(async () => {
      try {
        const { memberId } = await joinClubAction(club.id, {
          instagramLink: instagramLink.trim() || undefined,
        });
        if (club.membershipType === "PAID") {
          if (!memberId) {
            setError("Could not start the membership — try again.");
            return;
          }
          const result = await startClubCheckoutAction(memberId);
          if (result.error || !result.session) {
            setError(result.error ?? "Could not start payment.");
            return;
          }
          setSession(result.session);
          return;
        }
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="glass space-y-4 rounded-3xl p-5">
      <h3 className="text-sm font-bold">Join {club.name}</h3>

      {/* Terms */}
      {club.terms.length > 0 ? (
        <div className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Terms & Conditions
          </p>
          <ul className="space-y-1.5 text-xs text-muted">
            {club.terms.map((term, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-pink-neon" />
                {term}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* AUDITION: Instagram link */}
      {club.membershipType === "AUDITION" ? (
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Your Instagram link *
          </span>
          <input
            value={instagramLink}
            onChange={(e) => setInstagramLink(e.target.value)}
            placeholder="https://instagram.com/yourhandle"
            className={INPUT}
          />
          <span className="block text-xs text-muted">
            The crew will check your profile to see your talent.
          </span>
        </label>
      ) : null}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button className="w-full" disabled={pending} onClick={handleJoin}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {club.membershipType === "PAID" ? "Preparing payment…" : "Joining…"}
          </>
        ) : club.membershipType === "FREE" ? (
          "Join Now"
        ) : club.membershipType === "AUDITION" ? (
          "Submit Audition"
        ) : (
          <>
            <Lock className="mr-1.5 h-4 w-4" />
            Pay &amp; join — {formatPaise(club.membershipFeePaise)}/month
          </>
        )}
      </Button>
      {club.membershipType === "PAID" ? (
        <p className="text-center text-xs text-muted">
          UPI, cards and netbanking via Razorpay — membership activates instantly.
        </p>
      ) : null}
    </div>
  );
}
