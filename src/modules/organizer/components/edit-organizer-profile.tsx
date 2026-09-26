"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Loader2, Paperclip, Upload, X } from "lucide-react";

import { updateOrganizerAction, type UpdateOrganizerState } from "../actions/organizer";
import { Button } from "@/modules/shared";
import { ImageUploadWithCrop } from "@/modules/shared";
import { QrCode } from "@/modules/shared";
import { uploadPublicFile } from "@/modules/shared";
import { upiIntent, validateUpiId } from "@/modules/shared";
import type { Organizer } from "@/modules/shared";

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

  // KYC fields — live format checks (server validates again before staging)
  const [panNumber, setPanNumber] = useState(organizer.panNumber ?? "");
  const [gstNumber, setGstNumber] = useState(organizer.gstNumber ?? "");
  const [bankIfsc, setBankIfsc] = useState(organizer.bankIfsc ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(organizer.bankAccountNumber ?? "");
  const [panDocumentUrl, setPanDocumentUrl] = useState(organizer.panDocumentUrl ?? "");
  const [bankDocumentUrl, setBankDocumentUrl] = useState(organizer.bankDocumentUrl ?? "");
  const [uploadingPan, setUploadingPan] = useState(false);
  const [uploadingBank, setUploadingBank] = useState(false);
  const [panDocError, setPanDocError] = useState<string | null>(null);
  const [bankDocError, setBankDocError] = useState<string | null>(null);

  const MAX_DOC_MB = 1;

  async function handleDocUpload(file: File | undefined, kind: "pan" | "bank") {
    if (!file) return;
    const setErr = kind === "pan" ? setPanDocError : setBankDocError;
    if (file.size > MAX_DOC_MB * 1024 * 1024) {
      setErr(`File too large — keep it under ${MAX_DOC_MB} MB (${(file.size / 1024 / 1024).toFixed(1)} MB selected).`);
      return;
    }
    setErr(null);
    const setter = kind === "pan" ? setUploadingPan : setUploadingBank;
    setter(true);
    try {
      const url = await uploadPublicFile(file, `organizer-kyc/${kind}`);
      if (kind === "pan") setPanDocumentUrl(url ?? "");
      else setBankDocumentUrl(url ?? "");
    } catch (err) {
      setErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setter(false);
    }
  }

  const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  const GST_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  const ACCT_RE = /^[0-9]{9,18}$/;

  const panValid = !panNumber || PAN_RE.test(panNumber);
  const gstValid = !gstNumber || GST_RE.test(gstNumber);
  const ifscValid = !bankIfsc || IFSC_RE.test(bankIfsc);
  const acctValid = !bankAccountNumber || ACCT_RE.test(bankAccountNumber);
  const kycValid = panValid && gstValid && ifscValid && acctValid;

  const upiValid = upiId ? validateUpiId(upiId) : true;
  const qrValue = upiValid && upiId
    ? upiIntent({ upiId, payeeName: name, amountPaise: 100, note: "Test QR" })
    : "";

  // Auto-close on successful save — linger when a KYC-review notice exists so
  // the organizer can read it; Escape also closes.
  useEffect(() => {
    if (!state.saved) return;
    const t = setTimeout(onClose, state.notice ? 2000 : 500);
    return () => clearTimeout(t);
  }, [state, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div
        className="glass w-full max-w-md max-h-[92dvh] space-y-4 overflow-y-auto rounded-3xl p-6"
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
            <p className="text-[11px] text-muted">
              Changes to these fields are re-verified by our team before they take
              effect — your verified details stay active meanwhile.
            </p>
            <label className="block space-y-1">
              <span className="text-xs text-muted">Organizer intent <span className="normal-case">(what kind of events you&apos;ll host)</span></span>
              <textarea
                name="organizerIntent"
                rows={2}
                maxLength={300}
                defaultValue={organizer.organizerIntent ?? ""}
                placeholder="e.g. Underground cyphers, skate jams, intimate gigs"
                className={INPUT}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs text-muted">PAN number</span>
                <input
                  name="panNumber"
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  className={`${INPUT} ${panNumber && !panValid ? "border-red-500" : ""}`}
                />
                {panNumber && !panValid ? (
                  <p className="text-xs text-red-500">Expected format: ABCDE1234F</p>
                ) : null}
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
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                  placeholder="27ABCDE1234F1Z5"
                  className={`${INPUT} ${gstNumber && !gstValid ? "border-red-500" : ""}`}
                />
                {gstNumber && !gstValid ? (
                  <p className="text-xs text-red-500">Expected a 15-character GSTIN</p>
                ) : null}
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
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  className={`${INPUT} ${bankAccountNumber && !acctValid ? "border-red-500" : ""}`}
                />
                {bankAccountNumber && !acctValid ? (
                  <p className="text-xs text-red-500">9-18 digits</p>
                ) : null}
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted">IFSC</span>
                <input
                  name="bankIfsc"
                  value={bankIfsc}
                  onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                  placeholder="ABCD0123456"
                  className={`${INPUT} ${bankIfsc && !ifscValid ? "border-red-500" : ""}`}
                />
                {bankIfsc && !ifscValid ? (
                  <p className="text-xs text-red-500">Expected format: ABCD0123456</p>
                ) : null}
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

            {/* PAN + bank proof documents — view current, upload to replace */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">PAN card document</span>
                <div className="mt-2 space-y-2">
                  {panDocumentUrl ? (
                    <a href={panDocumentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-violet-neon underline">
                      <Paperclip className="h-3.5 w-3.5" /> View current document
                    </a>
                  ) : (
                    <p className="text-xs text-muted">No document uploaded.</p>
                  )}
                  <DocUpload
                    uploading={uploadingPan}
                    hasFile={!!panDocumentUrl}
                    label="Upload PAN card"
                    error={panDocError}
                    onFile={(f) => handleDocUpload(f, "pan")}
                  />
                </div>
                <input type="hidden" name="panDocumentUrl" value={panDocumentUrl} />
              </div>
              <div className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Bank proof document</span>
                <div className="mt-2 space-y-2">
                  {bankDocumentUrl ? (
                    <a href={bankDocumentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-violet-neon underline">
                      <Paperclip className="h-3.5 w-3.5" /> View current document
                    </a>
                  ) : (
                    <p className="text-xs text-muted">No document uploaded.</p>
                  )}
                  <DocUpload
                    uploading={uploadingBank}
                    hasFile={!!bankDocumentUrl}
                    label="Upload cancelled cheque / passbook"
                    error={bankDocError}
                    onFile={(f) => handleDocUpload(f, "bank")}
                  />
                </div>
                <input type="hidden" name="bankDocumentUrl" value={bankDocumentUrl} />
              </div>
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
          {state.notice ? (
            <p className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
              {state.notice}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={pending || uploading || uploadingPan || uploadingBank || (!!upiId && !upiValid) || !kycValid}
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

function DocUpload({
  uploading,
  hasFile,
  label,
  error,
  onFile,
}: {
  uploading: boolean;
  hasFile: boolean;
  label: string;
  error: string | null;
  onFile: (file: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-xs text-muted hover:border-violet-neon disabled:opacity-50 dark:border-white/15"
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {uploading ? "Uploading…" : hasFile ? "Replace document" : label}
      </button>
      <p className="text-[10px] text-muted">Image or PDF, under 1 MB — re-verified by admin.</p>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
