"use client";

import { useActionState, useState } from "react";
import { Rocket, Upload } from "lucide-react";

import { createOrganizerAction, type CreateOrganizerState } from "@/actions/organizer";
import { Button } from "@/components/ui/button";
import { QrCode } from "@/components/ui/qr-code";
import { uploadPublicFile } from "@/lib/upload";
import { upiIntent, validateUpiId } from "@/lib/upi";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function BecomeOrganizerForm() {
  const [state, formAction, pending] = useActionState<CreateOrganizerState, FormData>(
    createOrganizerAction,
    { error: null },
  );
  const [orgName, setOrgName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [upiId, setUpiId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upiValid = upiId ? validateUpiId(upiId) : true;
  const qrValue = upiValid && upiId
    ? upiIntent({ upiId, payeeName: orgName || "Organizer", amountPaise: 100, note: "Test QR" })
    : "";

  // Build path: organizer-name/profile/filename
  const safeOrg =
    orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "organizer";
  const folder = `${safeOrg}/profile`;

  async function handleAvatar(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadPublicFile(file, folder);
      if (url) setAvatarUrl(url);
      else setUploadError("Demo mode: uploads disabled. Paste an image URL instead.");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neon-gradient text-white shadow-glow-violet">
          <Rocket className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-black tracking-tight">Become an Organizer</h2>
        <p className="text-sm text-muted">
          Create your organizer profile to publish events, sell tickets, and manage
          your community.
        </p>
      </div>

      <form action={formAction} className="glass space-y-4 rounded-3xl p-6">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Organizer name *
          </span>
          <input
            name="name"
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Basement Collective"
            className={INPUT}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Bio
          </span>
          <textarea
            name="bio"
            rows={3}
            placeholder="Kolkata's oldest underground music collective — running warehouse gigs since 2016."
            className={INPUT}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            UPI ID *
          </span>
          <input
            name="upiId"
            required
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            placeholder="basement@upi"
            className={`${INPUT} ${upiId && !upiValid ? "border-red-500" : ""}`}
          />
          {upiId && !upiValid ? (
            <span className="block text-xs text-red-500">
              Invalid UPI ID format. Expected: name@bank (e.g. basement@upi)
            </span>
          ) : (
            <span className="block text-xs text-muted">
              Attendees will pay to this UPI ID. You can change it later.
            </span>
          )}
        </label>

        {/* UPI QR preview */}
        {qrValue ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              UPI QR preview
            </span>
            <QrCode value={qrValue} size={140} className="rounded-xl bg-white p-2" />
            <p className="text-[10px] text-muted">Scan to verify your UPI ID is correct</p>
          </div>
        ) : null}

        {/* Avatar upload */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Profile photo
          </span>
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Profile preview"
                className="h-16 w-16 rounded-2xl border border-zinc-200 object-cover dark:border-white/10"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-xs text-muted dark:border-white/15">
                No photo
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-4 py-3 text-sm text-muted hover:border-violet-neon dark:border-white/15">
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleAvatar(e.target.files?.[0])}
              />
            </label>
          </div>
          <input type="hidden" name="avatarUrl" value={avatarUrl} />
          {uploadError ? (
            <>
              <p className="text-xs text-amber-500">{uploadError}</p>
              <input
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="Paste image URL"
                className={INPUT}
              />
            </>
          ) : null}
        </div>

        {state.error ? (
          <p className="text-sm text-red-500">{state.error}</p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending || uploading || (!!upiId && !upiValid)}>
          {pending ? "Creating profile…" : "Yes, I'm an Organizer"}
        </Button>
      </form>
    </div>
  );
}
