"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { updatePlatformSettingAction } from "@/actions/admin";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

interface BoostConfig {
  heroBoostEnabled: boolean;
  heroBoostPrice: number;
  heroBoostDurationDays: number;
  heroRotationIntervalMinutes: number;
  heroMaxVisibleEvents: number;
}

export function BoostSettingsEditor({ config }: { config: BoostConfig }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fields: { key: string; label: string; type: "number" | "boolean"; suffix?: string; help?: string }[] = [
    { key: "hero_boost_enabled", label: "Front Row enabled", type: "boolean" },
    { key: "hero_boost_price", label: "Front Row price", type: "number", suffix: "paise", help: "Price in paise (99900 = ₹999)" },
    { key: "hero_boost_duration_days", label: "Duration", type: "number", suffix: "days", help: "How long a Front Row boost lasts" },
    { key: "hero_rotation_interval_minutes", label: "Rotation interval", type: "number", suffix: "min", help: "How often Front Row events rotate on the homepage" },
    { key: "hero_max_visible_events", label: "Max visible Front Row events", type: "number", help: "Maximum number of Front Row events shown at once" },
  ];

  function getInitialValue(key: string): string {
    switch (key) {
      case "hero_boost_enabled": return String(config.heroBoostEnabled);
      case "hero_boost_price": return String(config.heroBoostPrice);
      case "hero_boost_duration_days": return String(config.heroBoostDurationDays);
      case "hero_rotation_interval_minutes": return String(config.heroRotationIntervalMinutes);
      case "hero_max_visible_events": return String(config.heroMaxVisibleEvents);
      default: return "";
    }
  }

  function getValue(key: string): string {
    return key in values ? values[key] : getInitialValue(key);
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
    const dirtyKeys = fields.filter((f) => f.key in values).map((f) => f.key);
    for (const key of dirtyKeys) {
      await handleSave(key);
    }
  }

  const hasChanges = fields.some((f) => f.key in values);

  return (
    <div className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold">Front Row Configuration</h2>
        {hasChanges ? (
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving.size > 0}
            className="flex items-center gap-1.5 rounded-xl bg-violet-neon px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
          >
            {saving.size > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save All
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
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
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      className={INPUT}
                      disabled={isSaving}
                    />
                    {field.suffix ? <span className="shrink-0 text-xs text-muted">{field.suffix}</span> : null}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
