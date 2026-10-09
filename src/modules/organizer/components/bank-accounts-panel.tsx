"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Landmark, Plus, Star, Trash2 } from "lucide-react";

import { Button } from "@/modules/shared";
import {
  addBankAccountAction,
  removeBankAccountAction,
  setDefaultBankAccountAction,
  type BankAccount,
} from "../actions/bank-accounts";

const INPUT =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";

function mask(acct: string) {
  return acct.length > 4 ? `••••${acct.slice(-4)}` : acct;
}

/** Manage payout bank accounts — add/remove/set-default. */
export function BankAccountsPanel({ accounts }: { accounts: BankAccount[] }) {
  const [state, formAction, pending] = useActionState(addBankAccountAction, { error: null });
  const [adding, setAdding] = useState(accounts.length === 0);
  const [pendingAction, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(accounts);
  const [actionError, setActionError] = useState<string | null>(null);

  function run(action: () => Promise<{ error: string | null }>, optimisticUpdate?: (list: BankAccount[]) => BankAccount[]) {
    setActionError(null);
    startTransition(async () => {
      if (optimisticUpdate) setOptimistic(optimisticUpdate);
      const res = await action();
      if (res?.error) setActionError(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Landmark className="h-4 w-4 text-violet-neon" />
          Payout bank accounts
        </h3>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs font-semibold text-violet-neon hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add account
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Pick which account receives each event&apos;s payout on the event form. The default is used unless changed.
      </p>

      <div className="space-y-2">
        {optimistic.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 px-4 py-3 dark:border-white/10"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {a.label ?? "Bank account"}
                {a.isDefault ? (
                  <span className="ml-2 rounded-full bg-violet-neon/15 px-2 py-0.5 text-[10px] font-bold text-violet-neon">
                    DEFAULT
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted">
                {a.accountName} · {mask(a.accountNumber)} · {a.ifsc}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!a.isDefault ? (
                <button
                  type="button"
                  title="Set as default"
                  aria-label="Set as default"
                  disabled={pendingAction}
                  onClick={() =>
                    run(() => setDefaultBankAccountAction(a.id), (list) =>
                      list.map((x) => ({ ...x, isDefault: x.id === a.id })))
                  }
                  className="rounded-full border border-zinc-200 p-2 text-muted hover:border-violet-neon hover:text-violet-neon disabled:opacity-40 dark:border-white/10"
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <button
                type="button"
                title="Remove"
                aria-label="Remove account"
                disabled={pendingAction}
                onClick={() =>
                  run(() => removeBankAccountAction(a.id), (list) => list.filter((x) => x.id !== a.id))
                }
                className="rounded-full border border-zinc-200 p-2 text-muted hover:border-red-400 hover:text-red-500 disabled:opacity-40 dark:border-white/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {optimistic.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 p-4 text-center text-xs text-muted dark:border-white/15">
            No bank accounts yet - add the account your payouts should land in.
          </p>
        ) : null}
      </div>

      {actionError ? <p className="text-xs text-red-500">{actionError}</p> : null}

      {adding ? (
        <form
          action={(fd) => {
            setAdding(false);
            formAction(fd);
          }}
          className="space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-white/10"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="label" placeholder="Label (e.g. HDFC current)" className={INPUT} />
            <input name="accountName" required placeholder="Account holder name" className={INPUT} />
            <input name="accountNumber" required placeholder="Account number" inputMode="numeric" className={INPUT} />
            <input name="ifsc" required placeholder="IFSC (e.g. HDFC0001234)" className={INPUT} />
            <select name="accountType" className={INPUT} defaultValue="SAVINGS">
              <option value="SAVINGS">Savings</option>
              <option value="CURRENT">Current</option>
            </select>
          </div>
          {state.error ? <p className="text-xs text-red-500">{state.error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending} loading={pending} loadingText="Saving…">
              Save account
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
