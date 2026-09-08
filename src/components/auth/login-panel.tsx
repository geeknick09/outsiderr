"use client";

import { useState } from "react";
import { Mail, ArrowRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getAuthRedirectBase } from "@/lib/supabase/config";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

// Google "G" logo (official 4-color)
function GoogleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export function LoginPanel({ next, initialError }: { next: string; initialError?: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  async function sendMagicLink(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email.trim()) return;
    setPending(true);
    setError(null);
    const supabase = createClient();
    const base = getAuthRedirectBase();
    if (!base) {
      setError("Could not determine app URL. Set NEXT_PUBLIC_APP_URL in .env and restart.");
      setPending(false);
      return;
    }
    // Store the next path in a cookie so the callback route can read it.
    // The redirect URL sent to Supabase must NOT have query params — Supabase
    // PKCE flow requires an exact match against the allowed redirect URLs.
    document.cookie = `auth_next=${encodeURIComponent(next)}; path=/; max-age=600; SameSite=Lax`;
    const redirectTo = `${base}/auth/callback`;
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    setPending(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setMagicLinkSent(true);
  }

  async function signInWithGoogle() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const base = getAuthRedirectBase();
    if (!base) {
      setError("Could not determine app URL. Set NEXT_PUBLIC_APP_URL in .env and restart.");
      setPending(false);
      return;
    }
    document.cookie = `auth_next=${encodeURIComponent(next)}; path=/; max-age=600; SameSite=Lax`;
    const redirectTo = `${base}/auth/callback`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (oauthError) {
      setPending(false);
      setError(oauthError.message);
    }
    // If successful, the browser redirects to Google — no need to setPending(false)
  }

  // ── Success state: magic link sent ──────────────────────────────────
  if (magicLinkSent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="text-base font-bold">Check your email</p>
          <p className="mt-1 text-sm text-muted">
            We sent a sign-in link to <span className="font-semibold text-zinc-900 dark:text-white">{email}</span>.
            Click the link in the email to sign in to Outsiderr.
          </p>
        </div>
        <div className="rounded-xl bg-zinc-100 p-3 text-xs text-muted dark:bg-white/5">
          <p>The link expires in 1 hour. Check your spam folder if you don&apos;t see it.</p>
        </div>
        <button
          type="button"
          onClick={() => { setMagicLinkSent(false); setEmail(""); }}
          className="text-xs font-semibold text-violet-neon hover:underline"
        >
          Use a different email
        </button>
        <button
          type="button"
          onClick={() => sendMagicLink()}
          disabled={pending}
          className="block w-full text-xs font-semibold text-muted hover:text-violet-neon disabled:opacity-50"
        >
          {pending ? "Resending…" : "Resend magic link"}
        </button>
      </div>
    );
  }

  // ── Default state: email input + Google button ──────────────────────
  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500 dark:text-red-400">
          {error}
        </div>
      ) : null}

      {/* Google OAuth — primary CTA */}
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={pending}
        loading={pending}
        loadingText="Redirecting…"
        onClick={signInWithGoogle}
      >
        <GoogleIcon className="h-5 w-5" />
        Continue with Google
      </Button>

      {/* Divider */}
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
        or sign in with email
        <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
      </div>

      {/* Magic link form */}
      <form onSubmit={sendMagicLink} className="space-y-4">
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

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={pending || !email.trim()}
          loading={pending}
          loadingText="Sending link…"
        >
          <Mail className="h-4 w-4" />
          Send magic link
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p className="text-center text-xs text-muted">
        No password needed. We&apos;ll email you a secure link to sign in.
        New here? A magic link creates your account automatically.
      </p>
    </div>
  );
}
