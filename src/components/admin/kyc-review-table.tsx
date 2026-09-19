"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Loader2, MessageSquareWarning, X } from "lucide-react";

import { approveKycAction, rejectKycAction, requestClarificationAction } from "@/actions/kyc";
import { Modal } from "@/components/ui/modal";
import type { KycSubmission } from "@/lib/data/kyc";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  APPROVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  CLARIFICATION_NEEDED: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  NOT_SUBMITTED: "bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-muted",
};

export function KycReviewTable({ submissions }: { submissions: KycSubmission[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<KycSubmission | null>(null);
  const [mode, setMode] = useState<"idle" | "reject" | "clarify">("idle");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLabel = useMemo(() => {
    if (!selected) return "";
    return selected.kycStatus.replace("_", " ");
  }, [selected]);

  async function handleAction(action: "approve" | "reject" | "clarify") {
    if (!selected) return;
    if (action === "approve") {
      if (!confirm(`Approve ${selected.organizerName}? They will be notified and gain organizer access.`)) return;
      setBusy(true);
      setError(null);
      const result = await approveKycAction(selected.id);
      setBusy(false);
      if (result.error) {
        setError(result.error);
      } else {
        setSelected(null);
        router.refresh();
      }
      return;
    }

    if (!note.trim()) {
      setError(action === "reject" ? "Please provide a rejection reason." : "Please describe what clarification is needed.");
      return;
    }

    setBusy(true);
    setError(null);
    const result = action === "reject"
      ? await rejectKycAction(selected.id, note)
      : await requestClarificationAction(selected.id, note);
    setBusy(false);

    if (result.error) {
      setError(result.error);
    } else {
      setMode("idle");
      setNote("");
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
        <Modal open={true} onClose={() => { setSelected(null); setMode("idle"); setNote(""); setError(null); }} title={`${selected.organizerName} review`}>
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
              <InfoCard label="PAN" value={selected.panNumber ?? "—"} detail={selected.panName ?? undefined} />
              <InfoCard label="GST" value={selected.gstNumber ?? "—"} detail={selected.gstBusinessName ?? undefined} />
              <InfoCard label="Bank" value={selected.bankAccountNumber ?? "—"} detail={`${selected.bankAccountName ?? "—"} · ${selected.bankIfsc ?? "—"}`} />
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

            {error ? <p className="text-sm text-red-500">{error}</p> : null}

            {mode === "idle" ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => handleAction("approve")} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Approve
                </button>
                <button type="button" onClick={() => { setMode("reject"); setError(null); }} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50">
                  <X className="h-4 w-4" />
                  Reject
                </button>
                <button type="button" onClick={() => { setMode("clarify"); setError(null); }} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-blue-500 px-4 py-2 text-xs font-bold text-white hover:bg-blue-600 disabled:opacity-50">
                  <MessageSquareWarning className="h-4 w-4" />
                  Clarify
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                  {mode === "reject" ? "Reason for rejection" : "Clarification requested"}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
                  placeholder={mode === "reject" ? "Mention the mismatch or issue to reject." : "Explain what supporting detail or correction is needed."}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleAction(mode)} disabled={busy} className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white disabled:opacity-60 ${mode === "reject" ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"}`}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {mode === "reject" ? "Confirm rejection" : "Send clarification"}
                  </button>
                  <button type="button" onClick={() => { setMode("idle"); setNote(""); setError(null); }} disabled={busy} className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-bold text-muted hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/5">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function InfoCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className="font-mono text-sm">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
    </div>
  );
}
