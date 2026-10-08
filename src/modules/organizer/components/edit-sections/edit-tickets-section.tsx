"use client";

import { useActionState, useEffect, useState } from "react";
import { CollapsibleSection, utcToISTInput } from "@/modules/shared";
import { Plus, Trash2 } from "lucide-react";
import { updateEventSectionAction, type UpdateEventSectionState } from "../../actions/events";
import type { EventDetail } from "@/modules/shared";

const INPUT =
  "w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white disabled:opacity-50";

const SMALL_INPUT =
  "w-full min-w-0 box-border rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white";

interface EditableTier {
  id: string;
  name: string;
  price: string;
  quantity: string;
  quantitySold: number;
  isNew?: boolean;
  tierType?: string;
  phaseOpensAt?: string;
  phaseClosesAt?: string;
}

function toLocal(iso: string | null | undefined): string {
  return iso ? utcToISTInput(iso) : "";
}

export function EditTicketsSection({ event, lockLogistics = false }: { event: EventDetail; lockLogistics?: boolean }) {
  const [state, formAction, pending] = useActionState<UpdateEventSectionState, FormData>(
    updateEventSectionAction,
    { error: null },
  );
  const [isEditing, setIsEditing] = useState(false);
  const seedTiers = () =>
    event.tiers.map((t) => ({
      id: t.id,
      name: t.name,
      price: (t.pricePaise / 100).toFixed(0),
      quantity: String(t.quantity),
      quantitySold: t.quantitySold,
      tierType: t.tierType,
      phaseOpensAt: toLocal(t.phaseOpensAt),
      phaseClosesAt: toLocal(t.phaseClosesAt),
    }));

  const [tiers, setTiers] = useState<EditableTier[]>(seedTiers);
  const [maxTicketsPerUser, setMaxTicketsPerUser] = useState(String(event.maxTicketsPerUser ?? 5));
  const [phaseError, setPhaseError] = useState<string | null>(null);

  useEffect(() => {
    if (state.saved === "tickets") setIsEditing(false);
  }, [state.saved]);

  const tierError = (() => {
    for (const t of tiers) {
      const price = Number(t.price);
      const qty = Number(t.quantity);
      if (t.name.trim().length === 0) return "All tiers must have a name.";
      if (isNaN(price) || price < 0) return `Tier "${t.name || "unnamed"}" has an invalid price.`;
      if (isNaN(qty) || qty <= 0) return `Tier "${t.name || "unnamed"}" needs a quantity of at least 1.`;
      if (qty < t.quantitySold) return `Tier "${t.name}" quantity (${qty}) cannot be less than already sold (${t.quantitySold}).`;
    }
    return null;
  })();

  function validatePhases(rows: EditableTier[]) {
    const phases = rows.filter((t) => t.tierType === "FLAT_PHASE" && t.phaseOpensAt);
    for (let i = 0; i < phases.length; i++) {
      const p = phases[i];
      if (p.phaseClosesAt && new Date(p.phaseClosesAt) <= new Date(p.phaseOpensAt!)) {
        setPhaseError(`Phase ${i + 1} close must be after its open.`);
        return;
      }
      if (i > 0) {
        const prev = phases[i - 1];
        const prevBoundary = prev.phaseClosesAt || prev.phaseOpensAt;
        if (prevBoundary && new Date(p.phaseOpensAt!) <= new Date(prevBoundary)) {
          setPhaseError(`Phase ${i + 1} must open after the previous phase ends.`);
          return;
        }
      }
    }
    setPhaseError(null);
  }

  function updateTier(id: string, patch: Partial<EditableTier>) {
    const updated = tiers.map((t) => (t.id === id ? { ...t, ...patch } : t));
    setTiers(updated);
    validatePhases(updated);
  }

  function addTier() {
    setTiers([
      ...tiers,
      { id: `new-${crypto.randomUUID()}`, name: "", price: "", quantity: "", quantitySold: 0, isNew: true },
    ]);
  }

  function removeTier(id: string) {
    const tier = tiers.find((t) => t.id === id);
    if (tier && tier.quantitySold > 0) return; // Can't remove tiers with sales
    const updated = tiers.filter((t) => t.id !== id);
    setTiers(updated);
    validatePhases(updated);
  }

  function handleCancel() {
    setTiers(seedTiers());
    setMaxTicketsPerUser(String(event.maxTicketsPerUser ?? 5));
    setPhaseError(null);
    setIsEditing(false);
  }

  const hasPhases = tiers.some((t) => t.tierType === "FLAT_PHASE");

  return (
    <CollapsibleSection
      title="Ticket Details"
      description="Tiers, pricing, quantities and per-user cap."
      onEdit={() => setIsEditing(true)}
      isEditing={isEditing}
      onCancel={handleCancel}
      formId="sec-tickets"
      pending={pending}
      disabled={lockLogistics}
      error={state.error ?? tierError ?? phaseError}
      saved={state.saved === "tickets"}
    >
      <form id="sec-tickets" action={formAction} className="space-y-4">
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="section" value="tickets" />

        {!isEditing ? (
          <div className="space-y-2 text-sm text-muted">
            <p><strong>Max tickets per user:</strong> {maxTicketsPerUser}</p>
            <ul className="space-y-1">
              {tiers.map((t) => (
                <li key={t.id}>
                  <strong>{t.name || "Unnamed"}</strong> — ₹{t.price || "0"} · {t.quantity} qty · {t.quantitySold} sold
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Max tickets per user (1–10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxTicketsPerUser}
                onChange={(e) => setMaxTicketsPerUser(e.target.value)}
                className={INPUT}
              />
            </div>

            <div className="space-y-2">
              {tiers.map((tier) => (
                <div key={tier.id} className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
                  <div className="grid gap-2 sm:grid-cols-[1fr_100px_100px_32px]">
                    <input
                      type="text"
                      placeholder="Name"
                      value={tier.name}
                      onChange={(e) => updateTier(tier.id, { name: e.target.value })}
                      className={SMALL_INPUT}
                    />
                    <input
                      type="number"
                      placeholder="Price (₹)"
                      value={tier.price}
                      onChange={(e) => updateTier(tier.id, { price: e.target.value })}
                      className={SMALL_INPUT}
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      value={tier.quantity}
                      onChange={(e) => updateTier(tier.id, { quantity: e.target.value })}
                      className={SMALL_INPUT}
                    />
                    <button
                      type="button"
                      onClick={() => removeTier(tier.id)}
                      disabled={tier.quantitySold > 0}
                      title={tier.quantitySold > 0 ? "Cannot delete — has sales" : "Remove tier"}
                      className="self-center rounded-lg p-1 text-muted hover:text-red-500 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {tier.tierType === "FLAT_PHASE" ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-0.5 block text-[10px] font-semibold uppercase text-muted">Opens</label>
                        <input
                          type="datetime-local"
                          value={tier.phaseOpensAt}
                          onChange={(e) => updateTier(tier.id, { phaseOpensAt: e.target.value })}
                          className={SMALL_INPUT}
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[10px] font-semibold uppercase text-muted">Closes</label>
                        <input
                          type="datetime-local"
                          value={tier.phaseClosesAt}
                          onChange={(e) => updateTier(tier.id, { phaseClosesAt: e.target.value })}
                          className={SMALL_INPUT}
                        />
                      </div>
                    </div>
                  ) : null}
                  {tier.quantitySold > 0 ? (
                    <p className="mt-1 text-[10px] text-muted">{tier.quantitySold} sold — qty can&apos;t go below that.</p>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                onClick={addTier}
                className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-zinc-300 py-2.5 text-xs font-semibold text-muted transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/15"
              >
                <Plus className="h-3.5 w-3.5" /> Add tier
              </button>
            </div>
          </>
        )}

        {/* Hidden posts */}
        <input type="hidden" name="maxTicketsPerUser" value={maxTicketsPerUser} />
        {tiers.map((tier) => (
          <input key={`id-${tier.id}`} type="hidden" name="tierId[]" value={tier.id} />
        ))}
        {tiers.map((tier) => (
          <input key={`n-${tier.id}`} type="hidden" name="tierName[]" value={tier.name} />
        ))}
        {tiers.map((tier) => (
          <input key={`p-${tier.id}`} type="hidden" name="tierPrice[]" value={tier.price} />
        ))}
        {tiers.map((tier) => (
          <input key={`q-${tier.id}`} type="hidden" name="tierQty[]" value={tier.quantity} />
        ))}
        {hasPhases && tiers.map((tier) => (
          <input key={`po-${tier.id}`} type="hidden" name="tierPhaseOpensAt[]" value={tier.phaseOpensAt ?? ""} />
        ))}
        {hasPhases && tiers.map((tier) => (
          <input key={`pc-${tier.id}`} type="hidden" name="tierPhaseClosesAt[]" value={tier.phaseClosesAt ?? ""} />
        ))}
      </form>
    </CollapsibleSection>
  );
}
