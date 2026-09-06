"use client";

import { useState } from "react";
import { Check, Settings as SettingsIcon, Loader2 } from "lucide-react";

import { updatePlatformSettingAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import type { PlatformSetting } from "@/lib/types";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

type SettingValue = string | number | boolean | Record<string, number>;

function formatValue(value: SettingValue): string {
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

interface FieldDef {
  key: string;
  label: string;
  type: "number" | "text" | "boolean" | "json";
  suffix?: string;
  help?: string;
}

interface SectionDef {
  title: string;
  icon: string;
  fields: FieldDef[];
}

const SECTIONS: SectionDef[] = [
  {
    title: "Commission",
    icon: "%",
    fields: [
      { key: "commission_tier1_max_paise", label: "Tier 1 threshold", type: "number", suffix: "₹", help: "Tickets below this price use tier 1 rate" },
      { key: "commission_tier2_max_paise", label: "Tier 2 threshold", type: "number", suffix: "₹", help: "Tickets up to this price use tier 2 rate" },
      { key: "commission_tier1_bps", label: "Tier 1 rate", type: "number", suffix: "bps (1000=10%)", help: "For tickets below tier 1 threshold" },
      { key: "commission_tier2_bps", label: "Tier 2 rate", type: "number", suffix: "bps (700=7%)", help: "For tickets between tier 1 and tier 2" },
      { key: "commission_tier3_bps", label: "Tier 3 rate", type: "number", suffix: "bps (500=5%)", help: "For tickets above tier 2 threshold" },
    ],
  },
  {
    title: "Boosts & Front Row",
    icon: "⚡",
    fields: [
      { key: "hero_boost_enabled", label: "Front Row enabled", type: "boolean" },
      { key: "hero_boost_price", label: "Front Row price", type: "number", suffix: "paise" },
      { key: "hero_boost_duration_days", label: "Front Row duration", type: "number", suffix: "days" },
      { key: "hero_rotation_interval_minutes", label: "Rotation interval", type: "number", suffix: "min" },
      { key: "hero_max_visible_events", label: "Max visible Front Row events", type: "number" },
      { key: "boost_slot_prices", label: "Slot prices (JSON)", type: "json", help: "Per-day slot pricing object" },
    ],
  },
  {
    title: "Door Staff",
    icon: "👥",
    fields: [
      { key: "door_staff_pricing", label: "Pricing tiers (JSON)", type: "json", help: "Staff count → price mapping" },
      { key: "door_staff_max", label: "Max staff per event", type: "number" },
      { key: "door_staff_available", label: "Available staff pool", type: "number" },
    ],
  },
  {
    title: "Charges",
    icon: "₹",
    fields: [
      { key: "cancellation_charge_percent", label: "Cancellation charge", type: "number", suffix: "%" },
      { key: "postponement_charge_percent", label: "Postponement charge", type: "number", suffix: "%" },
      { key: "max_tickets_per_order", label: "Max tickets per order", type: "number" },
    ],
  },
  {
    title: "Taglines",
    icon: "✏️",
    fields: [
      { key: "tagline_header", label: "Header tagline", type: "text" },
      { key: "tagline_subheader", label: "Subheader tagline", type: "text" },
      { key: "tagline_footer", label: "Footer tagline", type: "text" },
    ],
  },
  {
    title: "Other",
    icon: "⚙️",
    fields: [
      { key: "terms_version", label: "Terms version", type: "text" },
      { key: "organizer_whatsapp_number", label: "Support WhatsApp number", type: "text" },
      { key: "venue_announcement_deadline_hours", label: "Venue announcement deadline", type: "number", suffix: "hours" },
      { key: "max_popular_per_city", label: "Max popular events per city", type: "number" },
      { key: "max_sponsored_per_city", label: "Max sponsored events per city", type: "number" },
      { key: "default_commission_bps", label: "Default commission (bps)", type: "number", help: "1000 = 10%" },
      { key: "default_convenience_fee_bps", label: "Default convenience fee (bps)", type: "number", help: "200 = 2%" },
    ],
  },
];

export function AdminSettingsPanel({ settings }: { settings: PlatformSetting[] }) {
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s]));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-5 w-5 text-violet-neon" />
        <h1 className="text-2xl font-black tracking-tight">Platform Settings</h1>
      </div>
      <p className="text-sm text-muted">
        Configure commission, charges, pricing, and other business rules. Changes take effect
        immediately across the platform.
      </p>

      <div className="space-y-4">
        {SECTIONS.map((section) => (
          <SettingsSection key={section.title} section={section} settingsMap={settingsMap} />
        ))}
      </div>
    </div>
  );
}

function SettingsSection({
  section,
  settingsMap,
}: {
  section: SectionDef;
  settingsMap: Record<string, PlatformSetting>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  function getValue(key: string): string {
    if (key in values) return values[key];
    const setting = settingsMap[key];
    if (setting) return formatValue(setting.value);
    return "";
  }

  function setValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave(key: string) {
    setSaving((prev) => new Set([...prev, key]));
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
    const value = getValue(key);
    const result = await updatePlatformSettingAction(key, value);
    if (result.error) {
      setErrors((prev) => ({ ...prev, [key]: result.error! }));
    } else {
      setSaved((prev) => new Set([...prev, key]));
      setTimeout(() => {
        setSaved((prev) => { const n = new Set(prev); n.delete(key); return n; });
      }, 3000);
    }
    setSaving((prev) => { const n = new Set(prev); n.delete(key); return n; });
  }

  async function handleSaveAll() {
    const dirtyKeys = section.fields.filter((f) => f.key in values).map((f) => f.key);
    if (dirtyKeys.length === 0) return;
    for (const key of dirtyKeys) {
      await handleSave(key);
    }
  }

  const hasChanges = section.fields.some((f) => f.key in values);

  return (
    <div className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <span className="text-lg">{section.icon}</span>
          {section.title}
        </h2>
        {hasChanges ? (
          <Button type="button" size="sm" onClick={handleSaveAll} disabled={saving.size > 0}>
            {saving.size > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save All
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {section.fields.map((field) => {
          const setting = settingsMap[field.key];
          const value = getValue(field.key);
          const isSaving = saving.has(field.key);
          const isSaved = saved.has(field.key);
          const error = errors[field.key];

          return (
            <div key={field.key} className="space-y-1.5">
              <label className="block">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted">{field.label}</span>
                  {isSaved ? <span className="text-xs text-emerald-500">✓</span> : null}
                </div>
                {field.type === "boolean" ? (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setValue(field.key, value === "true" ? "false" : "true")}
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        value === "true" ? "bg-violet-neon" : "bg-zinc-300 dark:bg-white/20"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                          value === "true" ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <span className="text-sm text-muted">{value === "true" ? "Enabled" : "Disabled"}</span>
                  </div>
                ) : field.type === "json" ? (
                  <textarea
                    value={value}
                    onChange={(e) => setValue(field.key, e.target.value)}
                    rows={3}
                    className={`${INPUT} font-mono text-xs`}
                    disabled={isSaving}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type={field.type === "number" ? "number" : "text"}
                      value={value}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      className={INPUT}
                      disabled={isSaving}
                    />
                    {field.suffix ? (
                      <span className="shrink-0 text-xs text-muted">{field.suffix}</span>
                    ) : null}
                  </div>
                )}
              </label>
              {field.help ? <p className="text-xs text-muted">{field.help}</p> : null}
              {error ? <p className="text-xs text-red-500">{error}</p> : null}
              {field.key in values && !isSaved ? (
                <button
                  type="button"
                  onClick={() => handleSave(field.key)}
                  disabled={isSaving}
                  className="flex items-center gap-1 text-xs font-semibold text-violet-neon hover:underline disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save"
                  )}
                </button>
              ) : null}
              {setting?.description ? (
                <p className="text-xs text-zinc-400">{setting.description}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
