"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, MessageSquareText, Paperclip, Upload } from "lucide-react";

import { updateOrganizerAction } from "@/actions/organizer";
import { ImageUploadWithCrop } from "@/modules/shared";
import { uploadPublicFile } from "@/modules/shared";
import type { Organizer } from "@/modules/shared";

const INPUT = "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function OrganizerKycReviewPanel({ organizer }: { organizer: Organizer }) {
  const [note, setNote] = useState(organizer.kycResponseNote ?? "");
  const [panDocumentUrl, setPanDocumentUrl] = useState(organizer.panDocumentUrl ?? "");
  const [bankDocumentUrl, setBankDocumentUrl] = useState(organizer.bankDocumentUrl ?? "");
  const [uploadingPan, setUploadingPan] = useState(false);
  const [uploadingBank, setUploadingBank] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isClarification = organizer.kycStatus === "CLARIFICATION_NEEDED";
  const statusLabel = useMemo(() => {
    if (organizer.kycStatus === "CLARIFICATION_NEEDED") return "Clarification requested";
    if (organizer.kycStatus === "PENDING") return "Application under review";
    return "Verification in progress";
  }, [organizer.kycStatus]);

  async function handleUpload(file: File | undefined, kind: "pan" | "bank") {
    if (!file) return;
    const setter = kind === "pan" ? setUploadingPan : setUploadingBank;
    setter(true);
    try {
      const url = await uploadPublicFile(file, `organizer-kyc/${kind}`);
      if (kind === "pan") setPanDocumentUrl(url ?? "");
      else setBankDocumentUrl(url ?? "");
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setter(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set("name", organizer.name || "");
      formData.set("bio", organizer.bio ?? "");
      formData.set("description", organizer.description ?? "");
      formData.set("organizerIntent", "");
      formData.set("upiId", organizer.upiId ?? "");
      formData.set("avatarUrl", organizer.avatarUrl ?? "");
      formData.set("panNumber", organizer.panNumber ?? "");
      formData.set("panName", organizer.panName ?? "");
      formData.set("panDocumentUrl", panDocumentUrl);
      formData.set("gstNumber", organizer.gstNumber ?? "");
      formData.set("gstBusinessName", organizer.gstBusinessName ?? "");
      formData.set("bankAccountNumber", organizer.bankAccountNumber ?? "");
      formData.set("bankIfsc", organizer.bankIfsc ?? "");
      formData.set("bankAccountName", organizer.bankAccountName ?? "");
      formData.set("bankAccountType", organizer.bankAccountType ?? "SAVINGS");
      formData.set("bankDocumentUrl", bankDocumentUrl);
      formData.set("agreedToTerms", "true");
      formData.set("kycResponseNote", note);
      formData.set("kycResponseDocumentUrl", panDocumentUrl || bankDocumentUrl || "");

      const result = await updateOrganizerAction({ error: null }, formData);
      if (result.error) {
        setMessage(result.error);
      } else {
        setMessage("Your response has been saved. Our team will review it again shortly.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong while saving your response.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="glass rounded-3xl border border-amber-300 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <Clock3 className="mt-0.5 h-6 w-6 text-amber-500" />
          <div>
            <h1 className="text-2xl font-black tracking-tight">Organizer verification in progress</h1>
            <p className="mt-1 text-sm text-muted">
              {statusLabel}. Our team reviews each organizer application manually. You’ll receive a notification when it is approved or when more details are needed.
            </p>
          </div>
        </div>
      </div>

      <div className="glass rounded-3xl p-6 space-y-5">
        <div className="flex items-center gap-2 text-sm font-bold text-violet-neon">
          <AlertCircle className="h-4 w-4" />
          {isClarification ? "Clarification requested" : "Review checklist"}
        </div>

        <div className="rounded-2xl border border-zinc-200 p-4 text-sm text-muted dark:border-white/10">
          Please ensure your PAN name, PAN document, bank account holder name, and bank proof match accurately. Mismatched details can lead to rejection.
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">PAN card upload</span>
              <span className="text-[10px] text-muted">Optional</span>
            </div>
            <div className="space-y-3">
              {panDocumentUrl ? (
                <a href={panDocumentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-violet-neon underline">
                  <Paperclip className="h-4 w-4" /> View uploaded PAN document
                </a>
              ) : (
                <p className="text-sm text-muted">No PAN document uploaded yet.</p>
              )}
              <ImageUploadWithCrop
                onCropped={(file) => handleUpload(file, "pan")}
                aspect={1.4}
                label={
                  <span className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-3 py-2 text-sm text-muted hover:border-violet-neon dark:border-white/15">
                    <Upload className="h-4 w-4" /> {uploadingPan ? "Uploading…" : "Upload PAN card"}
                  </span>
                }
              />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">Bank proof upload</span>
              <span className="text-[10px] text-muted">Optional</span>
            </div>
            <div className="space-y-3">
              {bankDocumentUrl ? (
                <a href={bankDocumentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-violet-neon underline">
                  <Paperclip className="h-4 w-4" /> View uploaded bank proof
                </a>
              ) : (
                <p className="text-sm text-muted">No bank proof uploaded yet.</p>
              )}
              <ImageUploadWithCrop
                onCropped={(file) => handleUpload(file, "bank")}
                aspect={1.4}
                label={
                  <span className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-3 py-2 text-sm text-muted hover:border-violet-neon dark:border-white/15">
                    <Upload className="h-4 w-4" /> {uploadingBank ? "Uploading…" : "Upload cancelled cheque / passbook"}
                  </span>
                }
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Reply to the verification team</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              placeholder={isClarification ? "Please respond to the query and add any supporting details here." : "Add any clarifying note or supporting details for your application."}
              className={INPUT}
            />
          </label>
          <p className="text-xs text-muted">You can reply here and attach documents above if the team asked for more information.</p>
        </div>

        {organizer.kycReviewNote ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-500/5 p-4 text-sm text-blue-700 dark:border-blue-500/30 dark:text-blue-300">
            <div className="mb-1 flex items-center gap-2 font-bold">
              <MessageSquareText className="h-4 w-4" /> Team note
            </div>
            <p>{organizer.kycReviewNote}</p>
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300">
            {message}
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-2xl bg-neon-gradient px-5 py-3 text-sm font-bold text-white shadow-glow-violet disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Submit response"}
          </button>
        </div>
      </div>
    </div>
  );
}
