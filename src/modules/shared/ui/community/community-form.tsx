"use client";

import { useActionState, useState } from "react";
import { AtSign, Plus, Upload } from "lucide-react";

import { createCommunityAction, type CreateCommunityState } from "../../actions/communities";
import { Button } from "../ui/button";
import { CITIES, COMMUNITY_CATEGORIES } from "../../lib/constants";
import { uploadPublicFile } from "../../lib/upload";
import { ImageUploadWithCrop } from "../ui/image-cropper";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

const OPTION = "bg-white text-zinc-900";

export function CommunityForm() {
  const [state, formAction, pending] = useActionState<CreateCommunityState, FormData>(
    createCommunityAction,
    { error: null },
  );
  const [membershipType, setMembershipType] = useState("OPEN");
  const [questions, setQuestions] = useState<{ question: string; isMandatory: boolean }[]>([]);
  const [avatarUrl, setAvatarUrl] = useState("");
    const [coverUrl, setCoverUrl] = useState("");
  const [mobileCoverUrl, setMobileCoverUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingMobileCover, setUploadingMobileCover] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleUpload(file: File | undefined, kind: "avatar" | "cover" | "mobileCover") {
    if (!file) return;
    if (kind === "avatar") setUploadingAvatar(true);
    else if (kind === "cover") setUploadingCover(true);
    else setUploadingMobileCover(true);
    setUploadError(null);
    try {
      const url = await uploadPublicFile(file, "community-media");
      if (url) {
        if (kind === "avatar") setAvatarUrl(url);
        else if (kind === "cover") setCoverUrl(url);
        else setMobileCoverUrl(url);
      } else {
        setUploadError("Upload failed. Paste an image URL instead.");
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingAvatar(false);
      setUploadingCover(false);
      setUploadingMobileCover(false);
    }
  }

  return (
    <form action={formAction} className="glass space-y-4 rounded-3xl p-5">
      <h2 className="text-base font-bold">Create a Community or Crew</h2>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Name *</span>
        <input name="name" required placeholder="Kolkata Runners" className={INPUT} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Bio</span>
        <textarea name="bio" rows={3} placeholder="Weekly 5K runs across the city. All paces welcome." className={INPUT} />
      </label>

      {/* Cover photo - Facebook-style banner */}
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
          <ImageUploadWithCrop
            aspect={16 / 9}
            onCropped={(f) => void handleUpload(f, "cover")}
            className="absolute bottom-2 right-2 flex cursor-pointer items-center gap-1.5 rounded-xl bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur hover:bg-black/80"
            label={
              <>
                <Upload className="h-3.5 w-3.5" />
                {uploadingCover ? "Uploading…" : coverUrl ? "Change" : "Upload"}
              </>
            }
          />
        </div>
        <input type="hidden" name="coverUrl" value={coverUrl} />
      </div>

      {/* Mobile cover (3:4 - shown on phones like the event card poster) */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Mobile cover (3:4, shown on phones)</span>
        <div className="flex items-center gap-4">
          {mobileCoverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mobileCoverUrl} alt="Mobile cover" className="h-24 w-[4.5rem] rounded-2xl border border-zinc-200 object-cover dark:border-white/10" />
          ) : (
            <div className="flex h-24 w-[4.5rem] items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-center text-[10px] text-muted dark:border-white/15">
              Optional
            </div>
          )}
          <ImageUploadWithCrop
            aspect={3 / 4}
            onCropped={(f) => void handleUpload(f, "mobileCover")}
            className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-4 py-3 text-sm text-muted hover:border-violet-neon dark:border-white/15"
            label={
              <>
                <Upload className="h-4 w-4" />
                {uploadingMobileCover ? "Uploading…" : mobileCoverUrl ? "Change" : "Upload"}
              </>
            }
          />
        </div>
        <p className="text-xs text-muted">Same image, cropped tall for phones - falls back to the cover if blank.</p>
        <input type="hidden" name="mobileCoverUrl" value={mobileCoverUrl} />
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
          <ImageUploadWithCrop
            aspect={1}
            onCropped={(f) => void handleUpload(f, "avatar")}
            className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-4 py-3 text-sm text-muted hover:border-violet-neon dark:border-white/15"
            label={
              <>
                <Upload className="h-4 w-4" />
                {uploadingAvatar ? "Uploading…" : avatarUrl ? "Change" : "Upload"}
              </>
            }
          />
        </div>
        <input type="hidden" name="avatarUrl" value={avatarUrl} />
        {uploadError ? <p className="text-xs text-amber-500">{uploadError}</p> : null}
      </div>

      <input type="hidden" name="type" value="CLUB" />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Category *</span>
          <select name="category" required className={INPUT} defaultValue="">
            <option value="" disabled className={OPTION}>Pick what this community is about</option>
            {COMMUNITY_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value} className={OPTION}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">City</span>
          <input
            name="city"
            list="indian-cities"
            placeholder="Type city (leave blank for all India)"
            className={INPUT}
          />
        </label>
        <datalist id="indian-cities">
          {CITIES.map((c) => (
            <option key={c.value} value={c.label} />
          ))}
        </datalist>
      </div>

      <label className="block space-y-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <AtSign className="h-3.5 w-3.5" />
          Instagram handle (optional)
        </span>
        <input name="instagramHandle" placeholder="@yourclub or https://instagram.com/yourclub" className={INPUT} />
        <span className="text-xs text-muted">So people can check out your crew before joining.</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <input name="youtubeUrl" placeholder="YouTube URL" className={INPUT} />
        <input name="xUrl" placeholder="X (Twitter) URL" className={INPUT} />
        <input name="facebookUrl" placeholder="Facebook URL" className={INPUT} />
        <input name="linkedinUrl" placeholder="LinkedIn URL" className={INPUT} />
        <input name="websiteUrl" placeholder="Website URL" className={`${INPUT} sm:col-span-2`} />
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Who can join?</span>
        <select
          name="membershipType"
          className={INPUT}
          value={membershipType}
          onChange={(e) => setMembershipType(e.target.value)}
        >
          <option value="OPEN" className={OPTION}>Open - anyone can join</option>
          <option value="PRIVATE" className={OPTION}>Private - members request &amp; you approve</option>
          <option value="INVITE_ONLY" className={OPTION}>Invite only - only via your invite link</option>
        </select>
      </label>

      {/* Join questions - private communities only */}
      {membershipType === "PRIVATE" ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-zinc-300 p-4 dark:border-white/15">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Questions for new members (they answer before you approve)
          </p>
          {questions.map((q, i) => (
            <div key={i} className="flex items-start gap-2">
              <input
                value={q.question}
                onChange={(e) =>
                  setQuestions((prev) => prev.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))
                }
                placeholder="e.g. Why do you want to join?"
                className={INPUT}
              />
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={q.isMandatory}
                  onChange={(e) =>
                    setQuestions((prev) => prev.map((x, j) => (j === i ? { ...x, isMandatory: e.target.checked } : x)))
                  }
                />
                Required
              </label>
              <button
                type="button"
                onClick={() => setQuestions((prev) => prev.filter((_, j) => j !== i))}
                className="shrink-0 text-xs text-red-500 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
          {questions.length < 10 ? (
            <button
              type="button"
              onClick={() => setQuestions((prev) => [...prev, { question: "", isMandatory: true }])}
              className="text-xs font-semibold text-violet-neon hover:underline"
            >
              + Add a question
            </button>
          ) : null}
          <input type="hidden" name="questions" value={JSON.stringify(questions.filter((q) => q.question.trim()))} />
        </div>
      ) : (
        <input type="hidden" name="questions" value="[]" />
      )}

      {membershipType === "INVITE_ONLY" ? (
        <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
          After creation, you&apos;ll get a private invite link on the manage page - share it to let people in.
        </p>
      ) : null}

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Terms (one per line)</span>
        <textarea name="terms" rows={3} placeholder="Show up at 6 AM every Sunday&#10;Bring your own water" className={INPUT} />
      </label>

      {state.error ? <p className="text-sm text-red-500">{state.error}</p> : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending} loading={pending} loadingText="Creating…">
        <Plus className="h-4 w-4" />
        Create Community
      </Button>
    </form>
  );
}
