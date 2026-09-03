"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";

import { adminUpdateSlotPriceAction } from "@/actions/admin";
import { formatPaise } from "@/lib/format";
import type { BoostSlotPrice } from "@/lib/types";

export function SlotPriceEditor({
  slotPrices,
}: {
  slotPrices: BoostSlotPrice[];
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(slot: number, currentPaise: number) {
    setEditing(slot);
    setValue(String(Math.round(currentPaise / 100))); // show in rupees
  }

  async function save(slot: number) {
    const rupees = Number(value);
    if (!rupees || rupees < 1) return;
    setSaving(true);
    try {
      await adminUpdateSlotPriceAction(slot, Math.round(rupees * 100));
      setEditing(null);
    } catch {
      // ignore — stays in edit mode
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass rounded-3xl p-5">
      <h3 className="mb-4 text-sm font-bold">Slot pricing (per day)</h3>
      <div className="space-y-2">
        {slotPrices.map((sp) => (
          <div
            key={sp.slot}
            className="flex items-center justify-between rounded-2xl border border-zinc-200 px-4 py-2.5 dark:border-white/10"
          >
            <span className="text-sm font-bold">Slot {sp.slot}</span>
            {editing === sp.slot ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted">₹</span>
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-sm dark:border-white/10 dark:bg-white/5"
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save(sp.slot)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-lime-500/20 text-lime-600 hover:bg-lime-500/30"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{formatPaise(sp.pricePaise)}/day</span>
                <button
                  type="button"
                  onClick={() => startEdit(sp.slot, sp.pricePaise)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:text-violet-neon"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
