"use client";

import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";

import { updateOrganizerAction, type UpdateOrganizerState } from "@/actions/organizer";
import { Button } from "@/components/ui/button";
import { ImageUploadWithCrop } from "@/components/ui/image-cropper";
import { QrCode } from "@/components/ui/qr-code";
import { uploadPublicFile } from "@/lib/upload";
import { upiIntent, validateUpiId } from "@/lib/upi";
import type { Organizer } from "@/lib/types";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function EditOrganizerProfile({
  organizer,
  onClose,
}: {
  organizer: Organizer;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<UpdateOrganizerState, FormData>(
    updateOrganizerAction,
    { error: null },
  );
  const [name, setName] = useState(organizer.name);
  const [bio, setBio] = useState(organizer.bio ?? "");
  const [description, setDescription] = useState(organizer.description ?? "");
  const [upiId, setUpiId] = useState(organizer.upiId ?? "");
  const [avatarUrl, setAvatarUrl] = useState(organizer.avatarUrl ?? "");
  const [instagramUrl, setInstagramUrl] = useState(organizer.instagramUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upiValid = upiId ? validateUpiId(upiId) : true;
  const qrValue = upiValid && upiId
    ? upiIntent({ upiId, payeeName: name, amountPaise: 100, note: "Test QR" })
    : "";

  async function handleAvatar(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadPublicFile(file, "organizer-profiles");
      if (url) setAvatarUrl(url);
      else setUploadError("Upload failed. Paste an image URL instead.");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="glass w-full max-w-md space-y-4 rounded-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Edit profile</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-red-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={formAction} className="space-y-4">
          {/* Avatar */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Profile photo
            </span>
            <div className="flex items-center gap-4">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="h-16 w-16 rounded-2xl border border-zinc-200 object-cover dark:border-white/10"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-xs text-muted dark:border-white/15">
                  No photo
                </div>
              )}
              <ImageUploadWithCrop
                onCropped={handleAvatar}
                aspect={1}
                label={uploading ? "Uploading…" : avatarUrl ? "Change" : "Upload"}
              />
            </div>
            <input type="hidden" name="avatarUrl" value={avatarUrl} />
            {uploadError ? <p className="text-xs text-amber-500">{uploadError}</p> : null}
          </div>

          {/* Cover photo removed — organizer only has optional profile pic */}
          <input type="hidden" name="coverUrl" value="" />
          <input type="hidden" name="instagramUrl" value={instagramUrl} />

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Organizer name *
            </span>
            <input
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Bio <span className="normal-case text-zinc-400">(short intro, max 200 chars)</span></span>
            <textarea
              name="bio"
              rows={2}
              maxLength={200}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className={INPUT}
            />
            <span className="text-right text-[10px] text-muted">{bio.length}/200</span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">About <span className="normal-case text-zinc-400">(detailed, max 400 chars)</span></span>
            <textarea
              name="description"
              rows={4}
              maxLength={400}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell attendees who you are, what kind of events you run, your history in the scene."
              className={INPUT}
            />
            <span className="text-right text-[10px] text-muted">{description.length}/400</span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Instagram URL (optional)
            </span>
            <input
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
              placeholder="https://instagram.com/yourhandle"
              className={INPUT}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                YouTube URL (optional)
              </span>
              <input
                name="youtubeUrl"
                defaultValue={organizer.youtubeUrl ?? ""}
                placeholder="https://youtube.com/@yourhandle"
                className={INPUT}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                X URL (optional)
              </span>
              <input
                name="xUrl"
                defaultValue={organizer.xUrl ?? ""}
                placeholder="https://x.com/yourhandle"
                className={INPUT}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Facebook URL (optional)
              </span>
              <input
                name="facebookUrl"
                defaultValue={organizer.facebookUrl ?? ""}
                placeholder="https://facebook.com/yourhandle"
                className={INPUT}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                LinkedIn URL (optional)
              </span>
              <input
                name="linkedinUrl"
                defaultValue={organizer.linkedinUrl ?? ""}
                placeholder="https://linkedin.com/in/yourhandle"
                className={INPUT}
              />
            </label>
          </div>

          {/* KYC / Bank details */}
          <div className="space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              KYC &amp; Bank details
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs text-muted">PAN number</span>
                <input
                  name="panNumber"
                  defaultValue={organizer.panNumber ?? ""}
                  placeholder="ABCDE1234F"
                  className={INPUT}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted">Name on PAN</span>
                <input
                  name="panName"
                  defaultValue={organizer.panName ?? ""}
                  className={INPUT}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted">GST number (optional)</span>
                <input
                  name="gstNumber"
                  defaultValue={organizer.gstNumber ?? ""}
                  className={INPUT}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted">GST business name (optional)</span>
                <input
                  name="gstBusinessName"
                  defaultValue={organizer.gstBusinessName ?? ""}
                  className={INPUT}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted">Bank account number</span>
                <input
                  name="bankAccountNumber"
                  defaultValue={organizer.bankAccountNumber ?? ""}
                  className={INPUT}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted">IFSC</span>
                <input
                  name="bankIfsc"
                  defaultValue={organizer.bankIfsc ?? ""}
                  placeholder="ABCD0123456"
                  className={INPUT}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted">Account holder name</span>
                <input
                  name="bankAccountName"
                  defaultValue={organizer.bankAccountName ?? ""}
                  className={INPUT}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted">Account type</span>
                <select
                  name="bankAccountType"
                  defaultValue={organizer.bankAccountType ?? "SAVINGS"}
                  className={INPUT}
                >
                  <option value="SAVINGS">Savings</option>
                  <option value="CURRENT">Current</option>
                </select>
              </label>
            </div>
          </div>

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
              <p className="text-xs text-red-500">
                Invalid UPI ID format. Expected format: name@bank (e.g. basement@upi)
              </p>
            ) : null}
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

          {state.error ? <p className="text-sm text-red-500">{state.error}</p> : null}

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={pending || uploading || (!!upiId && !upiValid)}
              loading={pending}
              loadingText="Saving…"
              className="flex-1"
            >
              <Check className="h-4 w-4" />
              Save profile
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
