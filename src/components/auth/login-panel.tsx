"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";

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
        using real authentication.
      </p>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Email
        </span>
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className={INPUT}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Password
        </span>
        <input
          name="password"
          type="password"
          required
          placeholder="••••••••"
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const supabase = createClient();

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      setPending(false);
      if (signInError) {
        setError(signInError.message);
        return;
      }
      router.replace(next);
      router.refresh();
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      setPending(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (data.user && !data.session) {
        setError("Check your email for a confirmation link, then sign in.");
        setMode("signin");
        return;
      }
      router.replace(next);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex rounded-2xl border border-zinc-200 p-1 dark:border-white/10">
        <button
          type="button"
          onClick={() => { setMode("signin"); setError(null); }}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
            mode === "signin"
              ? "bg-neon-gradient text-white"
              : "text-muted hover:text-zinc-900 dark:hover:text-white"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => { setMode("signup"); setError(null); }}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
            mode === "signup"
              ? "bg-neon-gradient text-white"
              : "text-muted hover:text-zinc-900 dark:hover:text-white"
          }`}
        >
          Sign up
        </button>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Email
        </span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          placeholder="you@example.com"
          className={INPUT}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Password
        </span>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          placeholder="••••••••"
          className={INPUT}
        />
      </label>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button
        size="lg"
        className="w-full"
        disabled={pending || !email || !password}
        onClick={handleSubmit}
      >
        <Mail className="h-4 w-4" />
        {pending
          ? "Please wait…"
          : mode === "signin"
          ? "Sign in"
          : "Create account"}
      </Button>

      <p className="text-center text-xs text-muted">
        {mode === "signin"
          ? "Don't have an account? Click Sign up above."
          : "Already have an account? Click Sign in above."}
      </p>

      {/* ── Phone OTP login (disabled for now) ──────────────────────────
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
        or
        <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
      </div>

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

      <Button
        size="lg"
        className="w-full"
        disabled={pending || phone.length < 8}
        onClick={otpSent ? verifyOtp : sendOtp}
      >
        <Smartphone className="h-4 w-4" />
        {otpSent ? "Verify & continue" : "Send OTP"}
      </Button>
      ─────────────────────────────────────────────────────────────────── */}

      {/* ── Google OAuth login (disabled for now) ────────────────────────
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
        or
        <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
      </div>

      <Button variant="secondary" size="lg" className="w-full" onClick={signInWithGoogle}>
        <KeyRound className="h-4 w-4" />
        Continue with Google
      </Button>
      ─────────────────────────────────────────────────────────────────── */}
    </div>
  );
}
