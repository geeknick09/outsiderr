"use client";

import { useState, useTransition } from "react";

import { Badge, Button } from "@/modules/shared";
import {
  togglePromoterBlockedAction,
  createPromoterPayoutAction,
  completePromoterPayoutAction,
} from "@/modules/admin/actions/promoters";

export function PromoterAdminActions({
  promoterId,
  isBlocked,
  canPayout,
}: {
  promoterId: string;
  isBlocked: boolean;
  canPayout: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        {canPayout ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await createPromoterPayoutAction(promoterId);
                if (res.error) setError(res.error);
              })
            }
          >
            Payout
          </Button>
        ) : null}
        <Button
          size="sm"
          variant={isBlocked ? "secondary" : "ghost"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await togglePromoterBlockedAction(promoterId, !isBlocked);
              if (res.error) setError(res.error);
            })
          }
        >
          {isBlocked ? "Unblock" : "Block"}
        </Button>
      </div>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}

export function PromoterPayoutActions({ payoutId, status }: { payoutId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status === "COMPLETED") return <Badge tone="success">Completed</Badge>;
  if (status === "FAILED") return <Badge tone="danger">Failed</Badge>;

  return (
    <span className="flex items-center gap-1.5">
      <Badge tone="warning">{status}</Badge>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          const ref = window.prompt("Bank reference / UTR:");
          if (ref === null) return;
          startTransition(async () => {
            const res = await completePromoterPayoutAction(payoutId, "COMPLETED", ref);
            if (res.error) setError(res.error);
          });
        }}
      >
        Complete
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await completePromoterPayoutAction(payoutId, "FAILED");
            if (res.error) setError(res.error);
          })
        }
      >
        Fail
      </Button>
      {error ? <span className="text-xs text-red-500">{error}</span> : null}
    </span>
  );
}
