"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, MessageSquareWarning, Loader2 } from "lucide-react";
import {
  approveKycAction,
  rejectKycAction,
  requestClarificationAction,
} from "@/actions/kyc";
import type { KycSubmission } from "@/modules/admin/server";

export function KycReviewCard({ submission }: { submission: KycSubmission }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "reject" | "clarify">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleApprove() {
    if (!confirm(`Approve ${submission.organizerName}? They will be notified and can start publishing events.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await approveKycAction(submission.id);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleReject() {
    if (!note.trim()) {
      setError("Please provide a reason for rejection.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await rejectKycAction(submission.id, note);
      if (result.error) {
        setError(result.error);
      } else {
        setMode("idle");
        setNote("");
        router.refresh();
      }
    });
  }

  function handleClarify() {
    if (!note.trim()) {
      setError("Please describe what clarification is needed.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await requestClarificationAction(submission.id, note);
      if (result.error) {
        setError(result.error);
      } else {
        setMode("idle");
        setNote("");
        router.refresh();
      }
    });
  }

  const statusColors: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    APPROVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    REJECTED: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    CLARIFICATION_NEEDED: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
    NOT_SUBMITTED: "bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-muted",
  };

  return (
    <div className="glass rounded-3xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {submission.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={submission.avatarUrl}
              alt={submission.organizerName}
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neon-gradient text-lg font-bold text-white">
              {submission.organizerName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h3 className="text-base font-bold">{submission.organizerName}</h3>
            <p className="text-xs text-muted">
              {submission.ownerName ?? "Unknown"} · {submission.ownerEmail}
              {submission.ownerPhone ? ` · ${submission.ownerPhone}` : ""}
            </p>
            <p className="text-[10px] text-muted">
              Submitted: {new Date(submission.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
            </p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${statusColors[submission.kycStatus] ?? statusColors.NOT_SUBMITTED}`}>
          {submission.kycStatus.replace("_", " ")}
        </span>
      </div>

      <div className="space-y-3 rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Bio</p>
          <p className="text-sm text-muted">{submission.bio || "No bio provided."}</p>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">About</p>
          <p className="text-sm text-muted">{submission.aboutText || "No about section provided."}</p>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Organizer intent</p>
          <p className="text-sm text-muted">{submission.organizerIntent || "No organizer intent provided."}</p>
        </div>
      </div>

      {/* KYC Details */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">PAN</p>
          <p className="text-sm font-mono">{submission.panNumber ?? "—"}</p>
          {submission.panName ? <p className="text-xs text-muted">{submission.panName}</p> : null}
        </div>
        <div className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">GST (optional)</p>
          <p className="text-sm font-mono">{submission.gstNumber ?? "—"}</p>
          {submission.gstBusinessName ? <p className="text-xs text-muted">{submission.gstBusinessName}</p> : null}
        </div>
        <div className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">Bank Account</p>
          <p className="text-sm font-mono">{submission.bankAccountNumber ?? "—"}</p>
          <p className="text-xs text-muted">
            {submission.bankAccountName ?? "—"} · {submission.bankIfsc ?? "—"} · {submission.bankAccountType ?? "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">UPI ID</p>
          <p className="text-sm font-mono">{submission.upiId ?? "—"}</p>
        </div>
      </div>

      {/* Previous review note */}
      {submission.kycReviewNote ? (
        <div className="rounded-2xl bg-zinc-50 p-3 dark:bg-white/5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Previous review note</p>
          <p className="text-sm text-muted">{submission.kycReviewNote}</p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      {/* Action buttons */}
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Approve
          </button>
          <button
            type="button"
            onClick={() => { setMode("reject"); setError(null); }}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Reject
          </button>
          <button
            type="button"
            onClick={() => { setMode("clarify"); setError(null); }}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-full bg-blue-500 px-4 py-2 text-xs font-bold text-white hover:bg-blue-600 disabled:opacity-50"
          >
            <MessageSquareWarning className="h-4 w-4" />
            Request Clarification
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              {mode === "reject" ? "Reason for rejection" : "What clarification is needed?"}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={mode === "reject" ? "e.g. PAN number does not match the name provided." : "e.g. Please provide a clear scan of your PAN card."}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
              disabled={pending}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={mode === "reject" ? handleReject : handleClarify}
              disabled={pending}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${mode === "reject" ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"}`}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === "reject" ? "Confirm Rejection" : "Send Clarification Request"}
            </button>
            <button
              type="button"
              onClick={() => { setMode("idle"); setNote(""); setError(null); }}
              disabled={pending}
              className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-bold text-muted hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
