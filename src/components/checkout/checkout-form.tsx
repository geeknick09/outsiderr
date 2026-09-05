"use client";

import { useActionState, useState } from "react";
import { Upload } from "lucide-react";

import { submitPaymentAction, type CheckoutState } from "@/actions/orders";
import { Button } from "@/components/ui/button";
import { uploadPublicFile } from "@/lib/upload";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function CheckoutForm({
  eventId,
  tierId,
  quantity,
  defaultName,
  defaultPhone,
  isFree = false,
}: {
  eventId: string;
  tierId: string;
  quantity: number;
  defaultName: string;
  defaultPhone: string;
  isFree?: boolean;
}) {
  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(
    submitPaymentAction,
    { error: null },
  );
  const [proofUrl, setProofUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadPublicFile(file, "payment-proofs");
      if (url) setProofUrl(url);
      else setUploadError("Upload failed. Paste a link instead.");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="tierId" value={tierId} />
      <input type="hidden" name="quantity" value={quantity} />
      <input type="hidden" name="isFree" value={isFree ? "1" : "0"} />
      <input type="hidden" name="paymentProofUrl" value={proofUrl} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Full name
          </span>
          <input name="buyerName" defaultValue={defaultName} required className={INPUT} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Phone
          </span>
          <input
            name="buyerPhone"
            defaultValue={defaultPhone}
            inputMode="tel"
            required
            className={INPUT}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Email <span className="normal-case text-zinc-400">(optional)</span>
          </span>
          <input
            name="buyerEmail"
            type="email"
            defaultValue=""
            placeholder="you@example.com"
            className={INPUT}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Gender <span className="normal-case text-zinc-400">(optional)</span>
          </span>
          <select name="buyerGender" defaultValue="" className={INPUT}>
            <option value="" className="bg-white dark:bg-zinc-900">Prefer not to say</option>
            <option value="male" className="bg-white dark:bg-zinc-900">Male</option>
            <option value="female" className="bg-white dark:bg-zinc-900">Female</option>
            <option value="non-binary" className="bg-white dark:bg-zinc-900">Non-binary</option>
            <option value="other" className="bg-white dark:bg-zinc-900">Other</option>
          </select>
        </label>
      </div>

      {/* UTR + screenshot — only for paid events */}
      {!isFree ? (
        <>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              UTR / transaction reference
            </span>
            <input
              name="utrReference"
              required
              minLength={6}
              placeholder="e.g. 428193756201"
              className={INPUT}
            />
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Payment screenshot
            </span>
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-zinc-300 px-4 py-4 text-sm text-muted hover:border-violet-neon dark:border-white/15">
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : proofUrl ? "Screenshot attached" : "Upload screenshot"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
            </label>
            {uploadError ? (
              <input
                value={proofUrl}
                onChange={(event) => setProofUrl(event.target.value)}
                placeholder="Paste screenshot URL"
                className={INPUT}
              />
            ) : null}
            {uploadError ? <p className="text-xs text-amber-500">{uploadError}</p> : null}
          </div>
        </>
      ) : null}

      {state.error ? <p className="text-sm text-red-500">{state.error}</p> : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending || uploading} loading={pending} loadingText={isFree ? "Confirming…" : "Submitting…"}>
        {isFree ? "Confirm RSVP" : "I've paid — submit for verification"}
      </Button>
      <p className="text-center text-xs text-muted">
        {isFree ? (
          <>
            You&apos;ll get an <strong>instantly confirmed</strong> ticket with a QR code — no
            payment or verification needed.
          </>
        ) : (
          <>
            Your order stays in <strong>Pending verification</strong> until the organizer
            confirms the payment.
          </>
        )}
      </p>
    </form>
  );
}
