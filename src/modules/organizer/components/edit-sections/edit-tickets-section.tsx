"use client";

import { useState } from "react";
import { CollapsibleSection, utcToISTInput } from "@/modules/shared";
import { Plus, Trash2 } from "lucide-react";
import type { EventDetail } from "@/modules/shared";

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

interface EditTicketsSectionProps {
  event: EventDetail;
  lockLogistics?: boolean;
  onSave: () => void;
}

export function EditTicketsSection({ event, lockLogistics, onSave }: EditTicketsSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tiers, setTiers] = useState<EditableTier[]>(
    event.tiers.map((t) => ({
      id: t.id,
      name: t.name,
      price: (t.pricePaise / 100).toFixed(0),
      quantity: String(t.quantity),
      quantitySold: t.quantitySold,
      tierType: t.tierType,
      phaseOpensAt: t.phaseOpensAt ?? "",
      phaseClosesAt: t.phaseClosesAt ?? "",
    })),
  );
  const [maxTicketsPerUser, setMaxTicketsPerUser] = useState(String(event.maxTicketsPerUser ?? 5));

  const tierError = (() => {
    for (const t of tiers) {
      const price = Number(t.price);
      const qty = Number(t.quantity);
      if (t.name.trim().length === 0) return "All tiers must have a name.";
      if (isNaN(price) || price < 0) return `Tier "${t.name || "unnamed"}" has an invalid price.`;
      if (isNaN(qty) || qty < 0) return `Tier "${t.name || "unnamed"}" has an invalid quantity.`;
      if (qty < t.quantitySold) return `Tier "${t.name}" quantity (${qty}) cannot be less than already sold (${t.quantitySold}).`;
    }
    return null;
  })();

  function handleSave() {
    if (tierError) return;
    setIsEditing(false);
    onSave();
  }

  function handleCancel() {
    setTiers(
      event.tiers.map((t) => ({
        id: t.id,
        name: t.name,
        price: (t.pricePaise / 100).toFixed(0),
        quantity: String(t.quantity),
        quantitySold: t.quantitySold,
        tierType: t.tierType,
        phaseOpensAt: t.phaseOpensAt ?? "",
        phaseClosesAt: t.phaseClosesAt ?? "",
      })),
    );
    setMaxTicketsPerUser(String(event.maxTicketsPerUser ?? 5));
    setIsEditing(false);
  }

  function addTier() {
    const newTier: EditableTier = {
      id: `new-${crypto.randomUUID()}`,
      name: "",
      price: "",
      quantity: "",
      quantitySold: 0,
      isNew: true,
    };
    setTiers([...tiers, newTier]);
  }

  function removeTier(id: string) {
    const tier = tiers.find((t) => t.id === id);
    if (tier && tier.quantitySold > 0) return;
    setTiers(tiers.filter((t) => t.id !== id));
  }

  function updateTier(id: string, patch: Partial<EditableTier>) {
    setTiers(tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  return (
    <CollapsibleSection
      id="event-tickets"
      title="Ticket Details"
      defaultOpen={false}
      onEdit={() => setIsEditing(true)}
      isEditing={isEditing}
      onCancel={handleCancel}
      onSave={handleSave}
      disabled={lockLogistics}
    >
      <div className="space-y-4">
        {!isEditing ? (
          <div className="space-y-2 text-sm text-muted">
            <p><strong>Max tickets per user:</strong> {maxTicketsPerUser}</p>
            <p><strong>Tiers:</strong> {tiers.length}</p>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">Max tickets per user (1-10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxTicketsPerUser}
                onChange={(e) => setMaxTicketsPerUser(e.target.value)}
                className="w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">Ticket tiers</span>
                <button
                  type="button"
                  onClick={addTier}
                  className="flex items-center gap-1 text-xs font-semibold text-violet-neon hover:underline"
                >
                  <Plus className="h-3 w-3" /> Add tier
                </button>
              </div>
              {tiers.map((tier) => (
                <div key={tier.id} className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
                  <div className="grid gap-2 sm:grid-cols-4">
                    <input
                      type="text"
                      placeholder="Name"
                      value={tier.name}
                      onChange={(e) => updateTier(tier.id, { name: e.target.value })}
                      className="w-full min-w-0 box-border rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                    <input
                      type="number"
                      placeholder="Price (₹)"
                      value={tier.price}
                      onChange={(e) => updateTier(tier.id, { price: e.target.value })}
                      className="w-full min-w-0 box-border rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                    <input
                      type="number"
                      placeholder="Quantity"
                      value={tier.quantity}
                      onChange={(e) => updateTier(tier.id, { quantity: e.target.value })}
                      className="w-full min-w-0 box-border rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeTier(tier.id)}
                      disabled={lockLogistics || tier.quantitySold > 0}
                      className="self-center rounded-lg p-1 text-muted hover:text-red-500 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {tier.tierType === "FLAT_PHASE" ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input
                        type="datetime-local"
                        value={tier.phaseOpensAt ? utcToISTInput(tier.phaseOpensAt) : ""}
                        onChange={(e) => updateTier(tier.id, { phaseOpensAt: e.target.value })}
                        placeholder="Phase opens"
                        className="w-full min-w-0 box-border rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white"
                      />
                      <input
                        type="datetime-local"
                        value={tier.phaseClosesAt ? utcToISTInput(tier.phaseClosesAt) : ""}
                        onChange={(e) => updateTier(tier.id, { phaseClosesAt: e.target.value })}
                        placeholder="Phase closes"
                        className="w-full min-w-0 box-border rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white"
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {tierError ? <p className="text-sm text-red-500">{tierError}</p> : null}
          </>
        )}

        {/* Hidden form fields */}
        <input type="hidden" name="maxTicketsPerUser" value={maxTicketsPerUser} />
        {tiers.map((tier, i) => (
          <input key={tier.id} type="hidden" name={`tierId[]`} value={tier.id} />
        ))}
        {tiers.map((tier) => (
          <input key={`name-${tier.id}`} type="hidden" name={`tierName[]`} value={tier.name} />
        ))}
        {tiers.map((tier) => (
          <input key={`price-${tier.id}`} type="hidden" name={`tierPrice[]`} value={tier.price} />
        ))}
        {tiers.map((tier) => (
          <input key={`qty-${tier.id}`} type="hidden" name={`tierQty[]`} value={tier.quantity} />
        ))}
        {tiers.map((tier) => (
          <input key={`phase-open-${tier.id}`} type="hidden" name="tierPhaseOpensAt[]" value={tier.phaseOpensAt ?? ""} />
        ))}
        {tiers.map((tier) => (
          <input key={`phase-close-${tier.id}`} type="hidden" name="tierPhaseClosesAt[]" value={tier.phaseClosesAt ?? ""} />
        ))}
      </div>
    </CollapsibleSection>
  );
}
