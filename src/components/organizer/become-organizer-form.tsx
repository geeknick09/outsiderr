"use client";

import { useActionState, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, Upload } from "lucide-react";

import { createOrganizerAction, type CreateOrganizerState } from "@/actions/organizer";
import { Button } from "@/components/ui/button";
import { QrCode } from "@/components/ui/qr-code";
import { uploadPublicFile } from "@/lib/upload";
import { upiIntent, validateUpiId } from "@/lib/upi";

// ─── Shared input style ───────────────────────────────────────────────────────
const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

const LABEL = "block space-y-1.5";
const LABEL_TEXT = "text-xs font-semibold uppercase tracking-wide text-muted";

// ─── Steps definition ─────────────────────────────────────────────────────────
const STEPS = [
  { num: "01", title: "Profile" },
  { num: "02", title: "PAN Details" },
  { num: "03", title: "GST Details" },
  { num: "04", title: "Bank & UPI" },
  { num: "05", title: "Agreement" },
] as const;

type StepIndex = 0 | 1 | 2 | 3 | 4;

export function BecomeOrganizerForm() {
  const [state, formAction, pending] = useActionState<CreateOrganizerState, FormData>(
    createOrganizerAction,
    { error: null },
  );

  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<StepIndex>(0);

  // Step 1 — Profile
  const [orgName, setOrgName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Step 2 — PAN
  const [panNumber, setPanNumber] = useState("");
  const [panName, setPanName] = useState("");

  // Step 3 — GST (optional)
  const [gstNumber, setGstNumber] = useState("");
  const [gstBusinessName, setGstBusinessName] = useState("");

  // Step 4 — Bank + UPI
  const [upiId, setUpiId] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountType, setBankAccountType] = useState<"SAVINGS" | "CURRENT">("SAVINGS");

  // Step 5 — Agreement
  const [agreed, setAgreed] = useState(false);

  // Derived
  const safeOrg = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "organizer";
  const upiValid = upiId ? validateUpiId(upiId) : true;
  const panValid = panNumber ? /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber.toUpperCase()) : true;
  const ifscValid = bankIfsc ? /^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc.toUpperCase()) : true;

  const qrValue =
    upiValid && upiId
      ? upiIntent({ upiId, payeeName: orgName || "Organizer", amountPaise: 100, note: "Test QR" })
      : "";

  async function handleAvatar(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadPublicFile(file, `${safeOrg}/profile`);
      if (url) setAvatarUrl(url);
      else setUploadError("Demo mode: uploads disabled. Paste an image URL instead.");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // Per-step "next" validation
  function canAdvance(): boolean {
    if (step === 0) return !!orgName.trim();
    if (step === 1) return !!panNumber && panValid && !!panName;
    if (step === 2) return true; // GST is optional
    if (step === 3) return !!upiId && upiValid && !!bankAccountNumber && !!bankIfsc && ifscValid && !!bankAccountName;
    return agreed;
  }

  function next() {
    if (step < 4) setStep((s) => (s + 1) as StepIndex);
  }

  function back() {
    if (step > 0) setStep((s) => (s - 1) as StepIndex);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-black tracking-tight">Become an Organizer</h1>
        <p className="mt-2 text-sm text-muted">
          Set up your profile to publish events, sell tickets, and grow your community.
        </p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Sidebar steps */}
        <aside className="shrink-0 md:w-48">
          <ol className="space-y-1">
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li
                  key={s.num}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors ${
                    active
                      ? "border-l-4 border-violet-neon bg-violet-neon/10"
                      : done
                      ? "text-zinc-400 dark:text-zinc-500"
                      : "text-zinc-400 dark:text-zinc-600"
                  }`}
                >
                  <span
                    className={`text-xs font-bold tabular-nums ${active ? "text-violet-neon" : ""}`}
                  >
                    {s.num}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      active
                        ? "text-zinc-900 dark:text-white"
                        : done
                        ? "text-zinc-400 dark:text-zinc-500"
                        : ""
                    }`}
                  >
                    {s.title}
                  </span>
                  {done ? (
                    <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-500" />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </aside>

        {/* Form panel */}
        <div className="flex-1">
          <form ref={formRef} action={formAction}>
            {/* Hidden fields so all data is submitted together on step 5 */}
            <input type="hidden" name="name" value={orgName} />
            <input type="hidden" name="bio" value={bio} />
            <input type="hidden" name="avatarUrl" value={avatarUrl} />
            <input type="hidden" name="panNumber" value={panNumber.toUpperCase()} />
            <input type="hidden" name="panName" value={panName} />
            <input type="hidden" name="gstNumber" value={gstNumber.toUpperCase()} />
            <input type="hidden" name="gstBusinessName" value={gstBusinessName} />
            <input type="hidden" name="upiId" value={upiId} />
            <input type="hidden" name="bankAccountNumber" value={bankAccountNumber} />
            <input type="hidden" name="bankIfsc" value={bankIfsc.toUpperCase()} />
            <input type="hidden" name="bankAccountName" value={bankAccountName} />
            <input type="hidden" name="bankAccountType" value={bankAccountType} />
            <input type="hidden" name="agreedToTerms" value={agreed ? "true" : "false"} />

            <div className="glass rounded-3xl p-6">
              {/* ── Step 0: Profile ────────────────────────────── */}
              {step === 0 && (
                <div className="space-y-4">
                  <StepHeader title="Create your organizer profile" subtitle="This is your public identity on Outsiderr." />

                  <label className={LABEL}>
                    <span className={LABEL_TEXT}>Organizer / Brand name *</span>
                    <input
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Basement Collective"
                      className={INPUT}
                      autoFocus
                    />
                  </label>

                  <label className={LABEL}>
                    <span className={LABEL_TEXT}>Bio</span>
                    <textarea
                      rows={3}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell attendees who you are and what kind of events you run."
                      className={INPUT}
                    />
                  </label>

                  <div className="space-y-1.5">
                    <span className={LABEL_TEXT}>Profile photo</span>
                    <div className="flex items-center gap-4">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="Profile" className="h-16 w-16 rounded-2xl object-cover border border-zinc-200 dark:border-white/10" />
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
                </div>
              )}

              {/* ── Step 1: PAN ────────────────────────────────── */}
              {step === 1 && (
                <div className="space-y-4">
                  <StepHeader title="PAN card details" subtitle="Required for payouts and compliance. Kept private." />

                  <label className={LABEL}>
                    <span className={LABEL_TEXT}>PAN Number *</span>
                    <input
                      value={panNumber}
                      onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                      placeholder="ABCDE1234F"
                      maxLength={10}
                      className={`${INPUT} font-mono tracking-widest uppercase ${panNumber && !panValid ? "border-red-500" : ""}`}
                      autoFocus
                    />
                    {panNumber && !panValid ? (
                      <span className="text-xs text-red-500">Format should be: ABCDE1234F</span>
                    ) : null}
                  </label>

                  <label className={LABEL}>
                    <span className={LABEL_TEXT}>Name as per PAN *</span>
                    <input
                      value={panName}
                      onChange={(e) => setPanName(e.target.value.toUpperCase())}
                      placeholder="FIRSTNAME LASTNAME"
                      className={`${INPUT} uppercase`}
                    />
                    <span className="text-xs text-muted">Enter exactly as printed on the PAN card.</span>
                  </label>

                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-600 dark:text-amber-400">
                    Your PAN details are encrypted and used only for tax compliance. They are never shared publicly.
                  </div>
                </div>
              )}

              {/* ── Step 2: GST ────────────────────────────────── */}
              {step === 2 && (
                <div className="space-y-4">
                  <StepHeader title="GST details" subtitle="Optional. Required only if you are GST-registered." />

                  <div className="rounded-2xl border border-zinc-200 p-4 text-sm text-muted dark:border-white/10">
                    Skip this step if you are not registered under GST. You can add it later from your organizer settings.
                  </div>

                  <label className={LABEL}>
                    <span className={LABEL_TEXT}>GST Number</span>
                    <input
                      value={gstNumber}
                      onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                      placeholder="22ABCDE1234F1Z5"
                      maxLength={15}
                      className={`${INPUT} font-mono tracking-widest uppercase`}
                    />
                  </label>

                  <label className={LABEL}>
                    <span className={LABEL_TEXT}>Business / Trade name</span>
                    <input
                      value={gstBusinessName}
                      onChange={(e) => setGstBusinessName(e.target.value)}
                      placeholder="Basement Events Pvt Ltd"
                      className={INPUT}
                    />
                  </label>
                </div>
              )}

              {/* ── Step 3: Bank + UPI ─────────────────────────── */}
              {step === 3 && (
                <div className="space-y-4">
                  <StepHeader title="Bank & UPI details" subtitle="Payouts will go to this account. Keep it accurate." />

                  <label className={LABEL}>
                    <span className={LABEL_TEXT}>UPI ID *</span>
                    <input
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="yourname@upi"
                      className={`${INPUT} ${upiId && !upiValid ? "border-red-500" : ""}`}
                    />
                    {upiId && !upiValid ? (
                      <span className="text-xs text-red-500">Invalid UPI ID. Expected: name@bank</span>
                    ) : (
                      <span className="text-xs text-muted">Attendees pay to this UPI ID directly.</span>
                    )}
                  </label>

                  {qrValue ? (
                    <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                      <QrCode value={qrValue} size={130} className="rounded-xl bg-white p-2" />
                      <p className="text-[10px] text-muted">Scan to verify your UPI ID is correct</p>
                    </div>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className={LABEL}>
                      <span className={LABEL_TEXT}>Account number *</span>
                      <input
                        type="password"
                        value={bankAccountNumber}
                        onChange={(e) => setBankAccountNumber(e.target.value)}
                        placeholder="Enter account number"
                        className={INPUT}
                        autoComplete="off"
                      />
                    </label>
                    <label className={LABEL}>
                      <span className={LABEL_TEXT}>IFSC Code *</span>
                      <input
                        value={bankIfsc}
                        onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                        placeholder="SBIN0001234"
                        maxLength={11}
                        className={`${INPUT} font-mono uppercase ${bankIfsc && !ifscValid ? "border-red-500" : ""}`}
                      />
                      {bankIfsc && !ifscValid ? (
                        <span className="text-xs text-red-500">Format: ABCD0123456</span>
                      ) : null}
                    </label>
                  </div>

                  <label className={LABEL}>
                    <span className={LABEL_TEXT}>Account holder name *</span>
                    <input
                      value={bankAccountName}
                      onChange={(e) => setBankAccountName(e.target.value)}
                      placeholder="As per bank records"
                      className={INPUT}
                    />
                  </label>

                  <div className={LABEL}>
                    <span className={LABEL_TEXT}>Account type *</span>
                    <div className="flex gap-3">
                      {(["SAVINGS", "CURRENT"] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setBankAccountType(type)}
                          className={`flex-1 rounded-2xl border py-3 text-sm font-semibold transition-colors ${
                            bankAccountType === type
                              ? "border-violet-neon bg-violet-neon/10 text-violet-neon"
                              : "border-zinc-200 text-muted hover:border-violet-neon/50 dark:border-white/10"
                          }`}
                        >
                          {type === "SAVINGS" ? "Savings" : "Current"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step 4: Agreement ──────────────────────────── */}
              {step === 4 && (
                <div className="space-y-4">
                  <StepHeader title="Organizer agreement" subtitle="Please read and accept the terms before proceeding." />

                  <div className="h-52 overflow-y-auto rounded-2xl border border-zinc-200 p-4 text-xs text-muted leading-relaxed dark:border-white/10">
                    <p className="font-bold text-zinc-900 dark:text-white mb-2">Organizer Terms & Conditions</p>
                    <p>By becoming an organizer on Outsiderr, you agree to the following:</p>
                    <ul className="mt-2 list-disc pl-5 space-y-2">
                      <li>You are responsible for all aspects of your event, including safety, logistics, and compliance with local laws.</li>
                      <li>Ticket payments are collected directly to your UPI ID. Outsiderr charges a 5% platform fee on paid tickets.</li>
                      <li>You must honour confirmed tickets. Cancellations require 48 hours notice and may incur a cancellation charge.</li>
                      <li>You may not list fraudulent, misleading, or illegal events. Outsiderr reserves the right to remove any event without notice.</li>
                      <li>Your PAN and bank details are collected for tax compliance and payout processing. They are encrypted and kept confidential.</li>
                      <li>You agree to provide a valid ID at any payout verification request.</li>
                      <li>Outsiderr is a platform provider and not co-organizer. All liability for the event rests with you.</li>
                      <li>Any disputes arising from ticket sales shall be settled in courts in Kolkata.</li>
                    </ul>
                  </div>

                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200 p-4 transition-colors hover:border-violet-neon dark:border-white/10">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-violet-neon"
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">
                      I have read and agree to the Organizer Terms & Conditions. I confirm that the information provided is accurate.
                    </span>
                  </label>

                  {state.error ? (
                    <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                      {state.error}
                    </p>
                  ) : null}
                </div>
              )}

              {/* ── Navigation ─────────────────────────────────── */}
              <div className={`mt-6 flex ${step > 0 ? "justify-between" : "justify-end"}`}>
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={back}
                    className="text-sm text-muted hover:text-violet-neon"
                  >
                    ← Back
                  </button>
                ) : null}

                {step < 4 ? (
                  <button
                    type="button"
                    onClick={next}
                    disabled={!canAdvance()}
                    className="flex items-center gap-2 rounded-2xl bg-neon-gradient px-6 py-3 text-sm font-bold text-white shadow-glow-violet transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Continue
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <Button
                    type="submit"
                    size="lg"
                    disabled={pending || !agreed}
                    className="px-8"
                  >
                    {pending ? "Creating profile…" : "Submit & Become an Organizer"}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-xl font-black tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>
    </div>
  );
}
