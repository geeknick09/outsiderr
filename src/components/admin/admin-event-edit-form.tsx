"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

import { adminUpdateEventAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS, CITY_LABELS } from "@/lib/constants";
import type { EventCategory, City } from "@/lib/types";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function AdminEventEditForm({
  eventId,
  title,
  description,
  category,
  city,
  venueName,
  venueAddress,
  startsAt,
  endsAt,
}: {
  eventId: string;
  title: string;
  description: string;
  category: EventCategory;
  city: City;
  venueName: string;
  venueAddress: string;
  startsAt: string;
  endsAt: string;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title,
    description,
    category,
    city,
    venueName,
    venueAddress,
    startsAt: startsAt.slice(0, 16),
    endsAt: endsAt.slice(0, 16),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function startEdit() {
    setForm({
      title, description, category, city, venueName, venueAddress,
      startsAt: startsAt.slice(0, 16),
      endsAt: endsAt.slice(0, 16),
    });
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await adminUpdateEventAction(eventId, {
      title: form.title,
      description: form.description,
      category: form.category,
      city: form.city,
      venueName: form.venueName,
      venueAddress: form.venueAddress,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
    });
    if (result.error) {
      setError(result.error);
    } else {
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={startEdit}>
          Edit Details
        </Button>
        {saved ? <span className="text-xs font-semibold text-emerald-500">✓ Saved</span> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-3xl border border-violet-neon/30 bg-violet-neon/5 p-5">
      <h3 className="text-sm font-bold">Edit Event Details</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted">Title</span>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted">Category</span>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as EventCategory })}
            className={INPUT}
          >
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted">City</span>
          <select
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value as City })}
            className={INPUT}
          >
            {Object.entries(CITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted">Venue Name</span>
          <input
            value={form.venueName}
            onChange={(e) => setForm({ ...form, venueName: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted">Venue Address</span>
          <input
            value={form.venueAddress}
            onChange={(e) => setForm({ ...form, venueAddress: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted">Starts At</span>
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted">Ends At</span>
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            className={INPUT}
          />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-muted">Description</span>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={4}
          className={INPUT}
        />
      </label>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={saving} loading={saving} loadingText="Saving…">
          <Check className="h-4 w-4" />
          Save
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={saving}>
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
