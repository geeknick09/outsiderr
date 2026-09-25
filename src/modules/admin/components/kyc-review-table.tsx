"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Loader2, MessageSquareWarning, Paperclip, X } from "lucide-react";

import { approveKycAction, rejectKycAction, requestClarificationAction } from "../actions/kyc";
import { Modal } from "@/modules/shared";
import { KycSubmission } from "../data/kyc";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  APPROVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  CLARIFICATION_NEEDED: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  NOT_SUBMITTED: "bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-muted",
};

type PendingAction = "approve" | "reject" | "clarify";

const ACTION_META: Record<PendingAction, { label: string; status: string; color: string; button: string }> = {
  approve: { label: "Approve application", status: "APPROVED", color: "text-emerald-500", button: "bg-emerald-500 hover:bg-emerald-600" },
  reject: { label: "Reject application", status: "REJECTED", color: "text-red-500", button: "bg-red-500 hover:bg-red-600" },
  clarify: { label: "Request clarification", status: "CLARIFICATION_NEEDED", color: "text-blue-500", button: "bg-blue-500 hover:bg-blue-600" },
};

function notificationPreview(action: PendingAction, note: string): string {
  switch (action) {
    case "approve":
      return "Congratulations! Your organizer profile has been approved. You can now publish events and manage your dashboard.";
    case "reject":
      return `Your organizer application was not approved. Reason: ${note.trim()}`;
    case "clarify":
      return `Your organizer application needs clarification. Please open your organizer dashboard and respond to the review note. Note: ${note.trim()}`;
  }
}

export function KycReviewTable({ submissions, adminEmail }: { submissions: KycSubmission[]; adminEmail: string | null }) {
  const router = useRouter();
  const [selected, setSelected] = useState<KycSubmission | null>(null);
  const [mode, setMode] = useState<"idle" | "compose" | "preview">("idle");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLabel = useMemo(() => {
    if (!selected) return "";
    return selected.kycStatus.replace("_", " ");
  }, [selected]);

  function resetAction() {
    setMode("idle");
    setPendingAction(null);
    setNote("");
    setError(null);
  }

  function requestAction(action: PendingAction) {
    setPendingAction(action);
    setError(null);
    if (action === "approve") {
      setNote("");
      setMode("preview");
    } else {
      setMode("compose");
    }
  }

  function goToPreview() {
    if (!pendingAction) return;
    if (!note.trim()) {
      setError(pendingAction === "reject" ? "Please provide a rejection reason." : "Please describe what clarification is needed.");
      return;
    }
    setError(null);
    setMode("preview");
  }

  async function confirmAction() {
    if (!selected || !pendingAction) return;
    setBusy(true);
    setError(null);
    const result =
      pendingAction === "approve"
        ? await approveKycAction(selected.id)
        : pendingAction === "reject"
          ? await rejectKycAction(selected.id, note)
          : await requestClarificationAction(selected.id, note);
    setBusy(false);

    if (result.error) {
      setError(result.error);
      // Go back so the admin can edit the note or cancel
      setMode(pendingAction === "approve" ? "idle" : "compose");
    } else {
      resetAction();
      setSelected(null);
      router.refresh();
    }
  }

  return (
    <>
      <div className="glass overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-zinc-200 bg-white/40 dark:border-white/10 dark:bg-white/5">
              <tr>
                <th className="px-4 py-3 font-semibold text-muted">Organizer</th>
                <th className="px-4 py-3 font-semibold text-muted">Owner</th>
                <th className="px-4 py-3 font-semibold text-muted">KYC status</th>
                <th className="px-4 py-3 font-semibold text-muted">Submitted</th>
                <th className="px-4 py-3 font-semibold text-muted">Action</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr key={submission.id} className="border-b border-zinc-100 dark:border-white/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {submission.avatarUrl ? (
                        <img src={submission.avatarUrl} alt={submission.organizerName} className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neon-gradient text-xs font-bold text-white">
                          {submission.organizerName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold">{submission.organizerName}</p>
                        <p className="text-[10px] text-muted">{submission.ownerEmail}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <p className="font-medium">{submission.ownerName ?? "Unknown"}</p>
                    <p className="text-[10px]">{submission.ownerPhone ?? "No phone"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_STYLES[submission.kycStatus] ?? STATUS_STYLES.NOT_SUBMITTED}`}>
                      {submission.kycStatus.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(submission.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelected(submission)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-[10px] font-bold text-muted hover:border-violet-neon dark:border-white/10"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected ? (
        <Modal open={true} onClose={() => { setSelected(null); resetAction(); }} title={`${selected.organizerName} review`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Current status</p>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_STYLES[selected.kycStatus] ?? STATUS_STYLES.NOT_SUBMITTED}`}>
                  {selectedLabel}
                </span>
              </div>
              {selected.kycReviewNote ? (
                <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  {selected.kycReviewNote}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <InfoCard
                label="PAN"
                value={selected.panNumber ?? "—"}
                detail={selected.panName ?? undefined}
                docUrl={selected.panDocumentUrl}
                docLabel="PAN document"
              />
              <InfoCard label="GST" value={selected.gstNumber ?? "—"} detail={selected.gstBusinessName ?? undefined} />
              <InfoCard
                label="Bank"
                value={selected.bankAccountNumber ?? "—"}
                detail={`${selected.bankAccountName ?? "—"} · ${selected.bankIfsc ?? "—"}`}
                docUrl={selected.bankDocumentUrl}
                docLabel="Bank proof"
              />
              <InfoCard label="UPI" value={selected.upiId ?? "—"} />
            </div>

            <div className="space-y-3 rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Bio</p>
                <p className="text-sm text-muted">{selected.bio || "No bio provided."}</p>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">About</p>
                <p className="text-sm text-muted">{selected.aboutText || "No about section provided."}</p>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Organizer intent</p>
                <p className="text-sm text-muted">{selected.organizerIntent || "No organizer intent provided."}</p>
              </div>
            </div>

            {selected.kycResponseNote ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-500/5 p-3 dark:border-emerald-500/30">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Organizer response</p>
                <p className="text-sm text-muted">{selected.kycResponseNote}</p>
              </div>
            ) : null}

            {selected.thread.length > 0 ? (
              <div className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">Communication history</p>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {selected.thread.map((m, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-bold">
                        {m.senderRole === "admin" ? `Admin${m.senderEmail ? ` (${m.senderEmail})` : ""}` : "Organizer"}
                      </span>
                      <span className="text-muted">
                        {" · "}
                        {new Date(m.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                      </span>
                      <p className="text-muted">{m.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {error ? <p className="text-sm text-red-500">{error}</p> : null}

            {(selected.kycStatus === "PENDING" || selected.kycStatus === "CLARIFICATION_NEEDED") ? (
              mode === "idle" ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => requestAction("approve")} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
                  <Check className="h-4 w-4" />
                  Approve
                </button>
                <button type="button" onClick={() => requestAction("reject")} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50">
                  <X className="h-4 w-4" />
                  Reject
                </button>
                <button type="button" onClick={() => requestAction("clarify")} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-blue-500 px-4 py-2 text-xs font-bold text-white hover:bg-blue-600 disabled:opacity-50">
                  <MessageSquareWarning className="h-4 w-4" />
                  Clarify
                </button>
              </div>
            ) : mode === "compose" ? (
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                  {pendingAction === "reject" ? "Reason for rejection" : "Clarification requested"}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
                  placeholder={pendingAction === "reject" ? "Mention the mismatch or issue to reject." : "Explain what supporting detail or correction is needed."}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={goToPreview} disabled={busy} className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white disabled:opacity-60 ${ACTION_META[pendingAction!].button}`}>
                    Preview action
                  </button>
                  <button type="button" onClick={resetAction} disabled={busy} className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-bold text-muted hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/5">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Confirm — preview of what happens</p>
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="text-muted">Action: </span>
                    <span className={`font-bold ${ACTION_META[pendingAction!].color}`}>{ACTION_META[pendingAction!].label}</span>
                    <span className="text-muted"> → status becomes {ACTION_META[pendingAction!].status}</span>
                  </p>
                  <p><span className="text-muted">Acting as: </span><span className="font-semibold">{adminEmail ?? "admin"}</span></p>
                  {note.trim() ? (
                    <p><span className="text-muted">Your note: </span>{note.trim()}</p>
                  ) : null}
                  <div className="rounded-xl bg-zinc-50 p-3 text-xs text-muted dark:bg-white/5">
                    <p className="mb-1 font-bold uppercase tracking-wide">Notification sent to organizer</p>
                    <p>{notificationPreview(pendingAction!, note)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={confirmAction}
                    disabled={busy}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white disabled:opacity-60 ${ACTION_META[pendingAction!].button}`}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Confirm & notify organizer
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode(pendingAction === "approve" ? "idle" : "compose")}
                    disabled={busy}
                    className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-bold text-muted hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/5"
                  >
                    Back
                  </button>
                </div>
              </div>
            )
          ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function InfoCard({ label, value, detail, docUrl, docLabel }: { label: string; value: string; detail?: string; docUrl?: string | null; docLabel?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className="font-mono text-sm">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
      {docUrl ? (
        <a href={docUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-violet-neon underline">
          <Paperclip className="h-3 w-3" /> {docLabel ?? "View document"}
        </a>
      ) : null}
    </div>
  );
}
