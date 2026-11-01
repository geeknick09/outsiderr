"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CollapsibleSection, utcToISTInput, cn } from "@/modules/shared";
import { Plus, Ban } from "lucide-react";
import { updateEventSectionAction, type UpdateEventSectionState } from "../../actions/events";
import type { EventDetail } from "@/modules/shared";

const INPUT =
  "w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white disabled:opacity-50";

const SMALL_INPUT =
  "w-full min-w-0 box-border rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white";

/** Block negative signs, e, E on numeric inputs; sanitize pasted text. */
function numericProps(allowDecimal = false) {
  return {
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (["-", "+", "e", "E"].includes(e.key)) e.preventDefault();
      if (!allowDecimal && e.key === ".") e.preventDefault();
    },
    onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData("text");
      const cleaned = allowDecimal ? text.replace(/[^0-9.]/g, "") : text.replace(/[^0-9]/g, "");
      if (cleaned !== text) {
        e.preventDefault();
        const input = e.currentTarget;
        input.value = cleaned;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
  };
}

interface EditableTier {
  id: string;
  name: string;
  price: string;
  quantity: string;
  quantitySold: number;
  isNew?: boolean;
  isExpired?: boolean;
  tierType?: string;
  phaseOpensAt?: string;
  phaseClosesAt?: string;
}

const MODE_LABELS: Record<string, string> = {
  FREE: "Free",
  FLAT: "Flat",
  PAID: "Tier",
  PHASED: "Phased",
};

function toLocal(iso: string | null | undefined): string {
  return iso ? utcToISTInput(iso) : "";
}

export function EditTicketsSection({ event, lockLogistics = false }: { event: EventDetail; lockLogistics?: boolean }) {
  const [state, formAction, pending] = useActionState<UpdateEventSectionState, FormData>(
    updateEventSectionAction,
    { error: null },
  );
  const [isEditing, setIsEditing] = useState(false);
  const mode = event.pricingMode ?? "PAID";

  const seedTiers = () =>
    event.tiers.map((t) => ({
      id: t.id,
      name: t.name,
      price: (t.pricePaise / 100).toFixed(0),
      quantity: String(t.quantity),
      quantitySold: t.quantitySold,
      // expired_at is the real flag — a naturally sold-out tier (qty=sold)
      // is NOT expired; it just needs a quantity bump to sell again.
      isExpired: Boolean(t.expiredAt),
      tierType: t.tierType,
      phaseOpensAt: toLocal(t.phaseOpensAt),
      phaseClosesAt: toLocal(t.phaseClosesAt),
    }));

  const [tiers, setTiers] = useState<EditableTier[]>(seedTiers);
  const [expiredIds, setExpiredIds] = useState<Set<string>>(
    () => new Set(event.tiers.filter((t) => t.expiredAt).map((t) => t.id)),
  );
  const [maxTicketsPerUser, setMaxTicketsPerUser] = useState(String(event.maxTicketsPerUser ?? 5));
  const [phaseError, setPhaseError] = useState<string | null>(null);
  // Snapshot of the last server-confirmed state — `event` props go stale after
  // a save (no revalidation), so Cancel restores from this instead of seedTiers.
  const lastSynced = useRef<{ tiers: EditableTier[]; expiredIds: Set<string>; maxPerUser: string } | null>(null);

  useEffect(() => {
    // Depend on `state` (new object per submission), not `state.saved` —
    // a second save returns saved:"tickets" again, and an unchanged
    // primitive dep would skip this effect and trap the section in edit mode.
    if (state.saved === "tickets") {
      // The action returns fresh tier rows with real DB IDs — swap out the
      // `new-*` placeholders so a follow-up save updates instead of
      // re-inserting (which would also trigger auto-deletion of the first
      // insert's rows).
      if (state.tiers) {
        const fresh = state.tiers.map((t) => ({
          id: t.id,
          name: t.name,
          price: (t.pricePaise / 100).toFixed(0),
          quantity: String(t.quantity),
          quantitySold: t.quantitySold,
          isExpired: Boolean(t.expiredAt),
          tierType: t.tierType,
          phaseOpensAt: toLocal(t.phaseOpensAt),
          phaseClosesAt: toLocal(t.phaseClosesAt),
        }));
        const freshExpired = new Set(fresh.filter((t) => t.isExpired).map((t) => t.id));
        setTiers(fresh);
        setExpiredIds(freshExpired);
        lastSynced.current = { tiers: fresh, expiredIds: freshExpired, maxPerUser: maxTicketsPerUser };
      }
      setIsEditing(false);
    }
  }, [state]);

  const isTierExpired = (tier: EditableTier) => expiredIds.has(tier.id);

  // Validate only active (non-expired) tiers
  const tierError = (() => {
    const activeTiers = tiers.filter((t) => !isTierExpired(t));
    if (activeTiers.length === 0) return "At least one active tier is required.";
    for (const t of activeTiers) {
      const price = Number(t.price);
      const qty = Number(t.quantity);
      if (t.name.trim().length === 0) return "All tiers must have a name.";
      if (mode !== "FREE" && (isNaN(price) || price < 0)) return `Tier "${t.name || "unnamed"}" has an invalid price.`;
      if (isNaN(qty) || qty <= 0) return `Tier "${t.name || "unnamed"}" needs a quantity of at least 1.`;
      if (qty < t.quantitySold) return `Tier "${t.name}" quantity (${qty}) cannot be less than already sold (${t.quantitySold}).`;
    }
    return null;
  })();

  function validatePhases(rows: EditableTier[]) {
    const phases = rows.filter((t) => t.tierType === "FLAT_PHASE" && t.phaseOpensAt && !expiredIds.has(t.id));
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

  function expireTier(id: string) {
    setExpiredIds((prev) => new Set([...prev, id]));
  }

  function unexpireTier(id: string) {
    setExpiredIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function addTier() {
    const tierType = mode === "PHASED" ? "FLAT_PHASE" : "NAMED";
    setTiers([
      ...tiers,
      {
        id: `new-${crypto.randomUUID()}`,
        name: "",
        price: mode === "FREE" ? "0" : "",
        quantity: "",
        quantitySold: 0,
        isNew: true,
        tierType,
      },
    ]);
  }

  function removeNewTier(id: string) {
    // Only brand-new unsaved tiers can be removed
    const tier = tiers.find((t) => t.id === id);
    if (!tier?.isNew) return;
    const updated = tiers.filter((t) => t.id !== id);
    setTiers(updated);
    validatePhases(updated);
  }

  function handleCancel() {
    if (lastSynced.current) {
      // Restore last server-confirmed state - event props are stale post-save.
      setTiers(lastSynced.current.tiers);
      setExpiredIds(new Set(lastSynced.current.expiredIds));
      setMaxTicketsPerUser(lastSynced.current.maxPerUser);
    } else {
      setTiers(seedTiers());
      setExpiredIds(new Set(event.tiers.filter((t) => t.expiredAt).map((t) => t.id)));
      setMaxTicketsPerUser(String(event.maxTicketsPerUser ?? 5));
    }
    setPhaseError(null);
    setIsEditing(false);
  }

  const hasPhases = mode === "PHASED" || tiers.some((t) => t.tierType === "FLAT_PHASE");
  const showPrice = mode !== "FREE";
  const canAddTiers = mode !== "FREE";

  // Expired tiers keep their original quantity — expiry is recorded via the
  // tierExpired[] flag → expired_at column, not by zeroing quantity (which
  // would violate the CHECK constraint for unsold tiers anyway).
  const effectiveTiers = tiers;

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

        {/* Pricing mode label */}
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-violet-neon/40 bg-violet-neon/10 px-3 py-1 text-xs font-semibold text-violet-neon">
            {MODE_LABELS[mode] ?? mode}
          </span>
          {!isEditing ? null : (
            <span className="text-[10px] text-muted">Pricing type cannot be changed after publishing.</span>
          )}
        </div>

        {!isEditing ? (
          <div className="space-y-2 text-sm text-muted">
            <p><strong>Max tickets per user:</strong> {maxTicketsPerUser}</p>
            <ul className="space-y-1">
              {tiers.map((t) => {
                const expired = isTierExpired(t);
                const soldOut = !expired && t.quantitySold > 0 && Number(t.quantity) <= t.quantitySold;
                return (
                  <li key={t.id} className={expired ? "opacity-50" : ""}>
                    <strong>{t.name || "Unnamed"}</strong>
                    {showPrice ? ` - ₹${t.price || "0"}` : " - Free"}
                    {" · "}{t.quantity} qty · {t.quantitySold} sold
                    {expired ? <span className="ml-1 text-[10px] font-semibold text-amber-500">Expired</span> : null}
                    {soldOut ? <span className="ml-1 text-[10px] font-semibold text-zinc-400">Sold out</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Max tickets per user (1-10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxTicketsPerUser}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setMaxTicketsPerUser(v);
                }}
                className={INPUT}
                {...numericProps(false)}
              />
            </div>

            <div className="space-y-2">
              {tiers.map((tier) => {
                const expired = isTierExpired(tier);
                return (
                  <div
                    key={tier.id}
                    className={cn(
                      "rounded-xl border p-3 transition-opacity",
                      expired
                        ? "border-amber-500/30 bg-amber-500/5 opacity-60"
                        : "border-zinc-200 dark:border-white/10",
                    )}
                  >
                    {expired ? (
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-500">
                          {tier.quantitySold > 0
                            ? `Expired — no more sales · ${tier.quantitySold} tickets preserved`
                            : "Expired — hidden from buyers · restore to reopen"}
                        </span>
                        <button
                          type="button"
                          onClick={() => unexpireTier(tier.id)}
                          className="text-[10px] font-semibold text-violet-neon hover:underline"
                        >
                          Restore
                        </button>
                      </div>
                    ) : null}

                    <div className={cn(
                      "grid gap-2",
                      showPrice ? "sm:grid-cols-[1fr_100px_100px_auto]" : "sm:grid-cols-[1fr_100px_auto]",
                    )}>
                      <input
                        type="text"
                        placeholder="Name"
                        value={tier.name}
                        onChange={(e) => updateTier(tier.id, { name: e.target.value })}
                        disabled={expired}
                        className={SMALL_INPUT}
                      />
                      {showPrice ? (
                        <input
                          type="number"
                          placeholder="Price (₹)"
                          min={0}
                          value={tier.price}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9.]/g, "");
                            updateTier(tier.id, { price: v });
                          }}
                          disabled={expired}
                          className={SMALL_INPUT}
                          {...numericProps(true)}
                        />
                      ) : null}
                      <input
                        type="number"
                        placeholder="Qty"
                        min={tier.quantitySold || 1}
                        value={expired ? tier.quantitySold : tier.quantity}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, "");
                          updateTier(tier.id, { quantity: v });
                        }}
                        disabled={expired}
                        className={SMALL_INPUT}
                        {...numericProps(false)}
                      />
                      {/* Expire / Remove button */}
                      {!expired && !tier.isNew ? (
                        <button
                          type="button"
                          onClick={() => expireTier(tier.id)}
                          title="Expire tier — stops sales but preserves ticket data"
                          className="self-center rounded-lg p-1 text-muted hover:text-amber-500"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      ) : tier.isNew ? (
                        <button
                          type="button"
                          onClick={() => removeNewTier(tier.id)}
                          title="Remove unsaved tier"
                          className="self-center rounded-lg p-1 text-muted hover:text-red-500"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>

                    {/* Phase dates for PHASED mode */}
                    {(tier.tierType === "FLAT_PHASE" || mode === "PHASED") && !expired ? (
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

                    {!expired && tier.quantitySold > 0 ? (
                      <p className="mt-1 text-[10px] text-muted">
                        {tier.quantitySold} sold — qty can&apos;t go below that.
                      </p>
                    ) : null}
                  </div>
                );
              })}

              {canAddTiers ? (
                <button
                  type="button"
                  onClick={addTier}
                  className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-zinc-300 py-2.5 text-xs font-semibold text-muted transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/15"
                >
                  <Plus className="h-3.5 w-3.5" /> Add tier
                </button>
              ) : null}
            </div>
          </>
        )}

        {/* Hidden posts — use effectiveTiers so expired tiers have qty=sold */}
        <input type="hidden" name="maxTicketsPerUser" value={maxTicketsPerUser} />
        {effectiveTiers.map((tier) => (
          <input key={`id-${tier.id}`} type="hidden" name="tierId[]" value={tier.id} />
        ))}
        {effectiveTiers.map((tier) => (
          <input key={`n-${tier.id}`} type="hidden" name="tierName[]" value={tier.name} />
        ))}
        {effectiveTiers.map((tier) => (
          <input key={`p-${tier.id}`} type="hidden" name="tierPrice[]" value={mode === "FREE" ? "0" : tier.price} />
        ))}
        {effectiveTiers.map((tier) => (
          <input key={`q-${tier.id}`} type="hidden" name="tierQty[]" value={tier.quantity} />
        ))}
        {effectiveTiers.map((tier) => (
          <input key={`e-${tier.id}`} type="hidden" name="tierExpired[]" value={isTierExpired(tier) ? "1" : ""} />
        ))}
        {hasPhases && effectiveTiers.map((tier) => (
          <input key={`po-${tier.id}`} type="hidden" name="tierPhaseOpensAt[]" value={tier.phaseOpensAt ?? ""} />
        ))}
        {hasPhases && effectiveTiers.map((tier) => (
          <input key={`pc-${tier.id}`} type="hidden" name="tierPhaseClosesAt[]" value={tier.phaseClosesAt ?? ""} />
        ))}
      </form>
    </CollapsibleSection>
  );
}
