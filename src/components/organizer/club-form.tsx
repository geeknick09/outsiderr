"use client";

import { useActionState, useState } from "react";
import { AtSign, Plus, Upload } from "lucide-react";

import { createClubAction, type CreateClubState } from "@/actions/clubs";
import { Button } from "@/components/ui/button";
import { CITIES } from "@/lib/constants";
import { uploadPublicFile } from "@/lib/upload";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

const OPTION = "bg-white text-zinc-900";

export function ClubForm() {
  const [state, formAction, pending] = useActionState<CreateClubState, FormData>(
    createClubAction,
    { error: null },
  );
  const [membershipType, setMembershipType] = useState("FREE");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleUpload(file: File | undefined, kind: "avatar" | "cover") {
    if (!file) return;
    if (kind === "avatar") setUploadingAvatar(true);
    else setUploadingCover(true);
    setUploadError(null);
    try {
      const url = await uploadPublicFile(file, "club-media");
      if (url) {
        if (kind === "avatar") setAvatarUrl(url);
        else setCoverUrl(url);
      } else {
        setUploadError("Upload failed. Paste an image URL instead.");
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingAvatar(false);
      setUploadingCover(false);
    }
  }

  return (
    <form action={formAction} className="glass space-y-4 rounded-3xl p-5">
      <h2 className="text-base font-bold">Create a Club or Crew</h2>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Name *</span>
        <input name="name" required placeholder="Kolkata Runners" className={INPUT} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Bio</span>
        <textarea name="bio" rows={3} placeholder="Weekly 5K runs across the city. All paces welcome." className={INPUT} />
      </label>

      {/* Cover photo — Facebook-style banner */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Cover photo</span>
        <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="Cover" className="h-32 w-full object-cover sm:h-40" />
          ) : (
            <div className="flex h-32 items-center justify-center bg-gradient-to-br from-violet-neon/20 to-fuchsia-500/20 sm:h-40">
              <p className="text-xs text-muted">No cover photo</p>
            </div>
          )}
          <label className="absolute bottom-2 right-2 flex cursor-pointer items-center gap-1.5 rounded-xl bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur hover:bg-black/80">
            <Upload className="h-3.5 w-3.5" />
            {uploadingCover ? "Uploading…" : coverUrl ? "Change" : "Upload"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleUpload(e.target.files?.[0], "cover")}
            />
          </label>
        </div>
        <input type="hidden" name="coverUrl" value={coverUrl} />
      </div>

      {/* Profile photo (avatar / DP) */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Profile photo (DP)</span>
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="DP" className="h-16 w-16 rounded-2xl border border-zinc-200 object-cover dark:border-white/10" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-xs text-muted dark:border-white/15">
              No photo
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-4 py-3 text-sm text-muted hover:border-violet-neon dark:border-white/15">
            <Upload className="h-4 w-4" />
            {uploadingAvatar ? "Uploading…" : avatarUrl ? "Change" : "Upload"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleUpload(e.target.files?.[0], "avatar")}
            />
          </label>
        </div>
        <input type="hidden" name="avatarUrl" value={avatarUrl} />
        {uploadError ? <p className="text-xs text-amber-500">{uploadError}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Type</span>
          <select name="type" className={INPUT} defaultValue="CLUB">
            <option value="CLUB" className={OPTION}>Club (open community)</option>
            <option value="CREW" className={OPTION}>Crew (audition / invite)</option>
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">City</span>
          <select name="city" className={INPUT} defaultValue="">
            <option value="" className={OPTION}>All cities</option>
            {CITIES.map((c) => (
              <option key={c.value} value={c.value} className={OPTION}>{c.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <AtSign className="h-3.5 w-3.5" />
          Instagram handle (optional)
        </span>
        <input name="instagramHandle" placeholder="@yourclub or https://instagram.com/yourclub" className={INPUT} />
        <span className="text-xs text-muted">So people can check out your crew before joining.</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Membership type</span>
          <select
            name="membershipType"
            className={INPUT}
            value={membershipType}
            onChange={(e) => setMembershipType(e.target.value)}
          >
            <option value="FREE" className={OPTION}>Free — anyone can join</option>
            <option value="PAID" className={OPTION}>Paid — monthly fee via UPI</option>
            <option value="AUDITION" className={OPTION}>Audition — review Instagram first</option>
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Monthly fee (₹)</span>
          <input name="membershipFee" type="number" inputMode="decimal" placeholder="0" min="0" className={INPUT} />
        </label>
      </div>

      {/* UPI ID field — only shown for paid membership */}
      {membershipType === "PAID" ? (
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">UPI ID *</span>
          <input
            name="upiId"
            required
            placeholder="yourclub@upi"
            className={INPUT}
          />
          <span className="text-xs text-muted">
            Members will see a QR code to pay the membership fee to this UPI ID.
          </span>
        </label>
      ) : null}

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Terms (one per line)</span>
        <textarea name="terms" rows={3} placeholder="Show up at 6 AM every Sunday&#10;Bring your own water" className={INPUT} />
      </label>

      {state.error ? <p className="text-sm text-red-500">{state.error}</p> : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending} loading={pending} loadingText="Creating…">
        <Plus className="h-4 w-4" />
        Create Club
      </Button>
    </form>
  );
}
