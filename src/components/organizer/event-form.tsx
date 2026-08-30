"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";

import { createEventAction, type CreateEventState } from "@/actions/events";
import { Button } from "@/components/ui/button";
import { CATEGORIES, CITIES } from "@/lib/constants";
import { uploadPublicFile } from "@/lib/upload";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

interface TierRow {
  key: string;
  name: string;
  price: string;
  quantity: string;
  perks: string;
}

function emptyTier(): TierRow {
  return {
    key: crypto.randomUUID(),
    name: "",
    price: "",
    quantity: "",
    perks: "",
  };
}

export function EventForm() {
  const [state, formAction, pending] = useActionState<CreateEventState, FormData>(
    createEventAction,
    { error: null },
  );
  const [tiers, setTiers] = useState<TierRow[]>([emptyTier()]);

  function updateTier(key: string, patch: Partial<TierRow>) {
    setTiers((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <section className="glass space-y-4 rounded-3xl p-5">
        <h2 className="text-base font-bold">Event details</h2>

        <Field label="Title">
          <input name="title" required placeholder="Basement Cypher Vol. 4" className={INPUT} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select name="category" className={INPUT} defaultValue="JAM_GIG">
              {CATEGORIES.filter((category) => category.value !== "ALL").map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="City">
            <select name="city" className={INPUT} defaultValue="KOLKATA">
              {CITIES.map((city) => (
                <option key={city.value} value={city.value}>
                  {city.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts at">
            <input type="datetime-local" name="startsAt" required className={INPUT} />
          </Field>
          <Field label="Ends at (optional)">
            <input type="datetime-local" name="endsAt" className={INPUT} />
          </Field>
        </div>

        <Field label="Venue name">
          <input name="venueName" required placeholder="The Basement, Park Street" className={INPUT} />
        </Field>
        <Field label="Venue address">
          <textarea name="venueAddress" rows={2} className={INPUT} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Latitude">
            <input name="latitude" inputMode="decimal" placeholder="22.5726" className={INPUT} />
          </Field>
          <Field label="Longitude">
            <input name="longitude" inputMode="decimal" placeholder="88.3639" className={INPUT} />
          </Field>
        </div>

        <Field label="About the event">
          <textarea name="description" rows={4} className={INPUT} />
        </Field>
        <Field label="Things to know (one per line)">
          <textarea name="thingsToKnow" rows={3} className={INPUT} />
        </Field>
        <Field label="Tags (comma-separated, e.g. Cypher, Battle, Free)">
          <input name="tags" placeholder="Cypher, Battle, Hip-hop" className={INPUT} />
        </Field>
        <Field label="Terms & conditions (one per line, defaults applied when empty)">
          <textarea name="terms" rows={3} className={INPUT} />
        </Field>
      </section>

      <section className="glass grid gap-4 rounded-3xl p-5 sm:grid-cols-2">
        <PosterField
          name="cardPosterUrl"
          label="Card poster (4:5)"
          folder="card-posters"
        />
        <PosterField
          name="bannerPosterUrl"
          label="Banner poster (16:9)"
          folder="banner-posters"
        />
      </section>

      <section className="glass space-y-4 rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Ticket tiers</h2>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setTiers((rows) => [...rows, emptyTier()])}
          >
            <Plus className="h-4 w-4" />
            Add tier
          </Button>
        </div>

        {tiers.map((tier, index) => (
          <div
            key={tier.key}
            className="space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-white/10"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Tier {index + 1}
              </p>
              {tiers.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remove tier ${index + 1}`}
                  onClick={() =>
                    setTiers((rows) => rows.filter((row) => row.key !== tier.key))
                  }
                  className="text-muted hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name">
                <input
                  name="tierName"
                  required
                  value={tier.name}
                  onChange={(event) => updateTier(tier.key, { name: event.target.value })}
                  placeholder="Early Bird"
                  className={INPUT}
                />
              </Field>
              <Field label="Price (₹)">
                <input
                  name="tierPrice"
                  required
                  inputMode="decimal"
                  value={tier.price}
                  onChange={(event) => updateTier(tier.key, { price: event.target.value })}
                  placeholder="399"
                  className={INPUT}
                />
              </Field>
              <Field label="Quantity">
                <input
                  name="tierQuantity"
                  required
                  inputMode="numeric"
                  value={tier.quantity}
                  onChange={(event) =>
                    updateTier(tier.key, { quantity: event.target.value })
                  }
                  placeholder="100"
                  className={INPUT}
                />
              </Field>
            </div>

            <Field label="Perks (comma separated)">
              <input
                name="tierPerks"
                value={tier.perks}
                onChange={(event) => updateTier(tier.key, { perks: event.target.value })}
                placeholder="Priority entry, Free drink"
                className={INPUT}
              />
            </Field>
          </div>
        ))}
      </section>

      <section className="glass space-y-4 rounded-3xl p-5">
        <h2 className="text-base font-bold">Platform fee &amp; staffing</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <FeeOption
            value="BUYER"
            title="Pass 5% fee to buyer"
            description="Buyer pays ticket price + 5%."
            defaultChecked
          />
          <FeeOption
            value="ORGANIZER"
            title="Absorb 5% fee"
            description="Buyer pays the listed price; 5% is deducted from your payout."
          />
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="needsDoorStaff" className="h-4 w-4 accent-violet-neon" />
          Request Outsiderr door staff for on-site check-ins
        </label>
      </section>

      {state.error ? <p className="text-sm text-red-500">{state.error}</p> : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Publishing…" : "Publish event"}
      </Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function FeeOption({
  value,
  title,
  description,
  defaultChecked,
}: {
  value: string;
  title: string;
  description: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-2xl border border-zinc-200 p-4 text-sm transition-colors hover:border-violet-neon dark:border-white/10">
      <input
        type="radio"
        name="feePayer"
        value={value}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 accent-violet-neon"
      />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
    </label>
  );
}

function PosterField({
  name,
  label,
  folder,
}: {
  name: string;
  label: string;
  folder: string;
}) {
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadPublicFile(file, folder);
      if (uploaded) setUrl(uploaded);
      else setDemoMode(true);
    } catch {
      setDemoMode(true);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-zinc-300 px-4 py-4 text-sm text-muted hover:border-violet-neon dark:border-white/15">
        <Upload className="h-4 w-4" />
        {uploading ? "Uploading…" : url ? "Uploaded" : "Choose image"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </label>
      <input
        name={name}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder={demoMode ? "Paste an image URL (demo mode)" : "or paste an image URL"}
        className={INPUT}
      />
    </div>
  );
}
