"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { adminApproveImportAction, adminRejectImportAction } from "@/modules/shared/actions/communities";
import { Button } from "@/modules/shared";

export function AdminCommunityImportActions({ importId }: { importId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => adminApproveImportAction(importId))}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Approve &amp; import
      </Button>
      <Button size="sm" variant="ghost" disabled={pending}
        onClick={() => run(() => adminRejectImportAction(importId, "Rejected by admin"))}>
        Reject
      </Button>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
