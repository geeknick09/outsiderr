"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Lock, Users } from "lucide-react";

import { joinCommunityAction } from "@/modules/shared/actions/communities";
import { Button } from "@/modules/shared";
import type { Community, CommunityJoinQuestion } from "@/modules/shared";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function JoinCommunityForm({
  community,
  questions = [],
  inviteToken = null,
  refCode = null,
}: {
  community: Community;
  questions?: CommunityJoinQuestion[];
  inviteToken?: string | null;
  refCode?: string | null;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<"ACCEPTED" | "PENDING" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Invite-only community and no valid invite token -> no form at all.
  if (community.membershipType === "INVITE_ONLY" && !inviteToken) {
    return (
      <div className="glass flex flex-col items-center gap-3 rounded-3xl p-6 text-center">
        <Lock className="h-8 w-8 text-muted" />
        <p className="font-bold">Invite only</p>
        <p className="text-sm text-muted">This community only admits members through an invite link from the organizer.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="glass flex flex-col items-center gap-3 rounded-3xl p-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-lime-neon" />
        <div>
          <p className="font-bold">{done === "ACCEPTED" ? "You're in!" : "Request submitted!"}</p>
          <p className="mt-1 text-sm text-muted">
            {done === "ACCEPTED"
              ? `Welcome to ${community.name}. You'll get notified about their events.`
              : "The organizer will review your answers and approve your request."}
          </p>
        </div>
      </div>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await joinCommunityAction(community.id, {
        answers: questions.map((q) => ({ questionId: q.id, answer: answers[q.id]?.trim() ?? "" })),
        inviteToken,
        refCode,
      });
      if (res.error) setError(res.error);
      else setDone(res.status);
    });
  }

  return (
    <div className="glass space-y-4 rounded-3xl p-5">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-violet-neon" />
        <p className="font-bold">
          {community.membershipType === "PRIVATE" ? "Request to join" : "Join the community"}
        </p>
      </div>

      {questions.map((q) => (
        <div key={q.id}>
          <label className="mb-1 block text-xs font-semibold text-muted">
            {q.question}
            {q.isMandatory ? <span className="text-red-500"> *</span> : null}
          </label>
          <textarea
            value={answers[q.id] ?? ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
            rows={2}
            className={INPUT}
            placeholder="Your answer"
          />
        </div>
      ))}

      {error ? <p className="text-sm font-semibold text-red-500">{error}</p> : null}

      <Button onClick={submit} disabled={pending} className="w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {community.membershipType === "PRIVATE" ? "Request to join" : "Join"}
      </Button>
    </div>
  );
}
