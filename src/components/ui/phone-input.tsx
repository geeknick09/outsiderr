"use client";

import { useState } from "react";

const INPUT_BASE =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

/**
 * Phone input with fixed +91 India prefix and 10-digit validation.
 * The +91 prefix is shown as a disabled addon and never sent to the server.
 * The hidden input stores the full value as +91XXXXXXXXXX.
 */
export function PhoneInput({
  name,
  defaultValue,
  className,
  required = false,
  onValueChange,
}: {
  name: string;
  defaultValue?: string;
  className?: string;
  required?: boolean;
  onValueChange?: (fullValue: string) => void;
}) {
  // Strip any existing +91 prefix from default value
  const stripped = (defaultValue ?? "").replace(/^\+91\s?/, "");
  const [digits, setDigits] = useState(stripped);
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Only allow digits, max 10
    const raw = e.target.value.replace(/\D/g, "").slice(0, 10);
    setDigits(raw);
    if (raw && raw.length !== 10) {
      setError("Enter a valid 10-digit Indian phone number.");
    } else {
      setError(null);
    }
    if (onValueChange) {
      onValueChange(raw ? `+91${raw}` : "");
    }
  }

  const fullValue = digits ? `+91${digits}` : "";

  return (
    <div>
      <div className={`flex items-stretch overflow-hidden ${className ?? ""}`}>
        <span className="inline-flex shrink-0 items-center rounded-l-2xl border border-r-0 border-zinc-200 bg-zinc-100 px-3 text-sm font-semibold text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
          +91
        </span>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={digits}
          onChange={handleChange}
          placeholder="98765 43210"
          required={required}
          pattern="[0-9]{10}"
          className={`${INPUT_BASE} min-w-0 flex-1 rounded-l-none ${error ? "border-red-500" : ""}`}
        />
      </div>
      {error ? (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      ) : null}
      {/* Hidden input with full +91 value for form submission */}
      <input type="hidden" name={name} value={fullValue} />
    </div>
  );
}
