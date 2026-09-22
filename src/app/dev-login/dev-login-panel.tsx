"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/modules/shared";
import { devLoginAction } from "./actions";

const ROLES = [
  { key: "user", label: "Dev User", desc: "plain attendee — booking, tickets, reviews" },
  { key: "user2", label: "Dev User 2", desc: "second attendee — waitlist/collab tests" },
  { key: "organizer", label: "Dev Organizer", desc: "KYC-approved organizer — event CRUD, orders, pins" },
  { key: "admin", label: "Dev Admin", desc: "platform admin — /admin suite" },
] as const;

export function DevLoginPanel() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<string | null>(null);

  function login(role: (typeof ROLES)[number]["key"]) {
    setError(null);
    setActive(role);
    startTransition(async () => {
      const res = await devLoginAction(role);
      if (res.error || !res.email || !res.password) {
        setError(res.error ?? "Dev login failed.");
        setActive(null);
        return;
      }
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: res.email,
        password: res.password,
      });
      if (signInError) {
        setError(signInError.message);
        setActive(null);
        return;
      }
      router.push(role === "admin" ? "/admin" : role === "organizer" ? "/organizer" : "/");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {ROLES.map((r) => (
        <button
          key={r.key}
          onClick={() => login(r.key)}
          disabled={pending}
          className="glass w-full rounded-2xl p-4 text-left transition hover:border-violet-500/60 disabled:opacity-50"
        >
          <div className="font-bold">{pending && active === r.key ? "Signing in…" : r.label}</div>
          <div className="text-xs text-muted">{r.desc}</div>
        </button>
      ))}
      <p className="pt-2 text-xs text-muted">
        Test users: <code>dev.*@outsiderr.test</code> · password <code>DevTest#1234</code>.
        Re-seed fixtures: <code>node scripts/_seed_dev_test.mjs</code>
      </p>
    </div>
  );
}
