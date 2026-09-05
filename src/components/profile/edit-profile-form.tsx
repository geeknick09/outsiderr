"use client";

import { useActionState, useState } from "react";
import { Check, Upload } from "lucide-react";

import { updateProfileAction } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { ImageUploadWithCrop } from "@/components/ui/image-cropper";
import { PREDEFINED_EVENT_TAGS } from "@/lib/constants";
import { uploadPublicFile } from "@/lib/upload";
import { cn } from "@/lib/utils";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function EditProfileForm({
  initialName,
  initialPhone,
  initialEmail,
  initialBirthDate,
  initialAvatarUrl,
  initialInstagramUrl,
  initialYoutubeUrl,
  initialXUrl,
  initialFacebookUrl,
  initialLinkedinUrl,
  initialTags,
}: {
  initialName: string;
  initialPhone: string;
  initialEmail: string;
  initialBirthDate: string;
  initialAvatarUrl: string;
  initialInstagramUrl: string;
  initialYoutubeUrl: string;
  initialXUrl: string;
  initialFacebookUrl: string;
  initialLinkedinUrl: string;
  initialTags: string[];
}) {
  const [state, formAction, pending] = useActionState(updateProfileAction, {
    error: null,
    success: false,
  });
  const [instagramUrl, setInstagramUrl] = useState(initialInstagramUrl);
  const [youtubeUrl, setYoutubeUrl] = useState(initialYoutubeUrl);
  const [xUrl, setXUrl] = useState(initialXUrl);
  const [facebookUrl, setFacebookUrl] = useState(initialFacebookUrl);
  const [linkedinUrl, setLinkedinUrl] = useState(initialLinkedinUrl);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(
    new Set(initialTags),
  );

  async function handleAvatarUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadPublicFile(file, "avatars");
      if (url) setAvatarUrl(url);
      else setUploadError("Upload failed. Please try again.");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Personal details */}
      <section className="glass space-y-4 rounded-3xl p-5">
        <h2 className="text-base font-bold">Personal details</h2>

        {/* Profile photo */}
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-neon-gradient text-2xl font-black text-white">
                {initialName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <ImageUploadWithCrop
              onCropped={handleAvatarUpload}
              aspect={1}
              label={
                <span className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-4 py-2.5 text-sm text-muted hover:border-violet-neon dark:border-white/15">
                  <Upload className="h-4 w-4" />
                  {uploading ? "Uploading…" : "Upload photo"}
                </span>
              }
            />
            {uploadError ? <p className="text-xs text-red-500">{uploadError}</p> : null}
          </div>
        </div>
        <input type="hidden" name="avatarUrl" value={avatarUrl} />

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Full name
          </span>
          <input
            name="fullName"
            required
            defaultValue={initialName}
            className={INPUT}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Phone
            </span>
            <input
              name="phone"
              type="tel"
              defaultValue={initialPhone}
              placeholder="+91 98765 43210"
              className={INPUT}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Email <span className="normal-case text-zinc-400">(read-only)</span>
            </span>
            <input
              value={initialEmail}
              readOnly
              disabled
              className={`${INPUT} opacity-60`}
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Birthdate
          </span>
          <input
            name="birthDate"
            type="date"
            defaultValue={initialBirthDate}
            className={INPUT}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Instagram URL (optional)
          </span>
          <input
            type="url"
            value={instagramUrl}
            onChange={(e) => setInstagramUrl(e.target.value)}
            placeholder="https://instagram.com/yourhandle"
            className={INPUT}
          />
        </label>
        <input type="hidden" name="instagramUrl" value={instagramUrl} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              YouTube URL (optional)
            </span>
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://youtube.com/@yourchannel"
              className={INPUT}
            />
          </label>
          <input type="hidden" name="youtubeUrl" value={youtubeUrl} />

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              X URL (optional)
            </span>
            <input
              type="url"
              value={xUrl}
              onChange={(e) => setXUrl(e.target.value)}
              placeholder="https://x.com/yourhandle"
              className={INPUT}
            />
          </label>
          <input type="hidden" name="xUrl" value={xUrl} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Facebook URL (optional)
            </span>
            <input
              type="url"
              value={facebookUrl}
              onChange={(e) => setFacebookUrl(e.target.value)}
              placeholder="https://facebook.com/yourhandle"
              className={INPUT}
            />
          </label>
          <input type="hidden" name="facebookUrl" value={facebookUrl} />

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              LinkedIn URL (optional)
            </span>
            <input
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/yourhandle"
              className={INPUT}
            />
          </label>
          <input type="hidden" name="linkedinUrl" value={linkedinUrl} />
        </div>
      </section>

      {/* Interested-in tags */}
      <section className="glass space-y-4 rounded-3xl p-5">
        <div>
          <h2 className="text-base font-bold">Interested in</h2>
          <p className="mt-1 text-xs text-muted">
            Pick the tags you care about. We&apos;ll also auto-add tags from
            events you book.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {PREDEFINED_EVENT_TAGS.map((tag) => {
            const active = selectedTags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                  active
                    ? "border-violet-neon bg-violet-neon/15 text-violet-neon"
                    : "border-zinc-200 text-zinc-600 hover:border-violet-neon/50 dark:border-white/10 dark:text-zinc-300",
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {/* Hidden inputs for selected tags */}
        {[...selectedTags].map((tag) => (
          <input key={tag} type="hidden" name="interestedTags" value={tag} />
        ))}
      </section>

      {/* Feedback + submit */}
      {state.success ? (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/50 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-600 dark:text-emerald-300">
          <Check className="h-4 w-4" /> Profile saved.
        </div>
      ) : null}
      {state.error ? (
        <p className="text-sm text-red-500">{state.error}</p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="w-full" loading={pending} loadingText="Saving…">
        Save profile
      </Button>
    </form>
  );
}
