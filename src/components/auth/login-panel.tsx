"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Smartphone } from "lucide-react";

import { demoSignInAction, type ActionState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function LoginPanel({
  supabaseEnabled,
  next,
}: {
  supabaseEnabled: boolean;
  next: string;
}) {
  if (!supabaseEnabled) return <DemoLogin next={next} />;
  return <SupabaseLogin next={next} />;
}

function DemoLogin({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    demoSignInAction,
    { error: null },
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        Demo mode: Supabase is not configured, so we sign you in locally instead of
        sending an SMS OTP.
      </p>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Name
        </span>
        <input name="name" required placeholder="Riya Sen" className={INPUT} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Phone
        </span>
        <input
          name="phone"
          required
          inputMode="tel"
          placeholder="+91 98300 00000"
          className={INPUT}
        />
      </label>
      {state.error ? <p className="text-sm text-red-500">{state.error}</p> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Continue"}
      </Button>
    </form>
  );
}

function SupabaseLogin({ next }: { next: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function sendOtp() {
    setPending(true);
    setError(null);
    const { error: otpError } = await createClient().auth.signInWithOtp({ phone });
    setPending(false);
    if (otpError) setError(otpError.message);
    else setOtpSent(true);
  }

  async function verifyOtp() {
    setPending(true);
    setError(null);
    const { error: verifyError } = await createClient().auth.verifyOtp({
      phone,
      token: otp,
      type: "sms",
    });
    setPending(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function signInWithGoogle() {
    setError(null);
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthError) setError(oauthError.message);
  }

  return (
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Phone number
        </span>
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          inputMode="tel"
          placeholder="+919830000000"
          className={INPUT}
          disabled={otpSent}
        />
      </label>

      {otpSent ? (
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            6-digit code
          </span>
          <input
            value={otp}
            onChange={(event) => setOtp(event.target.value)}
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            className={INPUT}
          />
        </label>
      ) : null}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button
        size="lg"
        className="w-full"
        disabled={pending || phone.length < 8}
        onClick={otpSent ? verifyOtp : sendOtp}
      >
        <Smartphone className="h-4 w-4" />
        {otpSent ? "Verify & continue" : "Send OTP"}
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
        or
        <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
      </div>

      <Button variant="secondary" size="lg" className="w-full" onClick={signInWithGoogle}>
        <KeyRound className="h-4 w-4" />
        Continue with Google
      </Button>
    </div>
  );
}
