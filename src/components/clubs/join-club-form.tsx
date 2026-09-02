"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { joinClubAction } from "@/actions/clubs";
import { QrCode } from "@/components/ui/qr-code";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/format";
import { upiIntent } from "@/lib/upi";
import type { Club } from "@/lib/types";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function JoinClubForm({ club }: { club: Club }) {
  const [instagramLink, setInstagramLink] = useState("");
  const [utr, setUtr] = useState("");
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
              : "The club owner will verify your payment and confirm your membership."}
          </p>
        </div>
      </div>
    );
  }

  function handleJoin() {
    setError(null);
    if (club.membershipType === "AUDITION" && !instagramLink.trim()) {
      setError("Paste your Instagram link so the crew can review your talent.");
      return;
    }
    if (club.membershipType === "PAID" && !utr.trim()) {
      setError("Pay the membership fee and enter your UTR reference.");
      return;
    }
    startTransition(async () => {
      try {
        await joinClubAction(club.id, {
          instagramLink: instagramLink.trim() || undefined,
          utrReference: utr.trim() || undefined,
        });
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  // For PAID clubs: use the club's own UPI ID (set by the creator), fallback to platform
  const clubUpiId = club.upiId ?? "outsiderr@upi";

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

      {/* PAID: UPI QR + UTR */}
      {club.membershipType === "PAID" ? (
        <>
          <div className="flex flex-col items-center gap-2">
            <QrCode
              value={upiIntent({
                upiId: clubUpiId,
                payeeName: club.name,
                amountPaise: club.membershipFeePaise,
                note: `Membership — ${club.name}`,
              })}
              size={160}
              className="rounded-2xl bg-white p-2"
            />
            <p className="text-center text-xs text-muted">
              Scan to pay {formatPaise(club.membershipFeePaise)}/month
            </p>
            <p className="text-center text-xs font-mono text-muted">{clubUpiId}</p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              UTR / Transaction reference *
            </span>
            <input
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="Enter UTR number"
              className={INPUT}
            />
          </label>
        </>
      ) : null}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button className="w-full" disabled={pending} onClick={handleJoin}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Joining…
          </>
        ) : club.membershipType === "FREE" ? (
          "Join Now"
        ) : club.membershipType === "AUDITION" ? (
          "Submit Audition"
        ) : (
          "Submit Payment"
        )}
      </Button>
    </div>
  );
}
