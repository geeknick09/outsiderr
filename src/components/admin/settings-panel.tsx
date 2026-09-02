"use client";

import { useState } from "react";
import { Check, X, Settings as SettingsIcon } from "lucide-react";

import { updatePlatformSettingAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import type { PlatformSetting } from "@/lib/types";

function formatValue(value: string | number | boolean | Record<string, number>): string {
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function AdminSettingsPanel({ settings }: { settings: PlatformSetting[] }) {
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

      <div className="space-y-3">
        {settings.map((setting) => (
          <SettingRow key={setting.key} setting={setting} />
        ))}
      </div>
    </div>
  );
}

function SettingRow({ setting }: { setting: PlatformSetting }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(formatValue(setting.value));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updatePlatformSettingAction(setting.key, value);
    if (result.error) {
      setError(result.error);
    } else {
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-bold">{setting.key}</p>
          {setting.description ? (
            <p className="mt-0.5 text-xs text-muted">{setting.description}</p>
          ) : null}
        </div>
        {!editing ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setValue(formatValue(setting.value));
              setEditing(true);
            }}
          >
            Edit
          </Button>
        ) : null}
      </div>

      {!editing ? (
        <div className="mt-2 flex items-center gap-2">
          <p className="rounded-lg bg-zinc-100 px-3 py-2 font-mono text-sm dark:bg-white/5">
            {formatValue(setting.value)}
          </p>
          {saved ? (
            <span className="text-xs font-semibold text-emerald-500">✓ Saved</span>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
            disabled={saving}
          />
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
              <Check className="h-4 w-4" />
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={saving}
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
