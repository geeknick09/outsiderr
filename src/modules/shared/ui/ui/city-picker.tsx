"use client";

import { useMemo, useState } from "react";

import { INDIAN_STATES_CITIES, normalizeCityKey } from "../../lib/india-cities";

const OTHER = "__OTHER__";
const INPUT =
  "w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

/**
 * Cascading India State -> City picker posting a single `name` field
 * (canonical uppercase city key). Pick "Other city" to type a custom
 * Indian city name - stored as its normalized key.
 */
export function CityPicker({
  name = "city",
  stateName = "eventState",
  defaultValue,
  required = true,
}: {
  name?: string;
  stateName?: string;
  defaultValue?: string | null;
  required?: boolean;
}) {
  // Resolve the initial state from the stored city (or "Other" for customs).
  const initialState = useMemo(() => {
    if (!defaultValue) return "";
    const key = defaultValue.toUpperCase();
    const hit = INDIAN_STATES_CITIES.find((s) => s.cities.some((x) => x.value === key));
    return hit ? hit.state : OTHER;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, setState] = useState(initialState);
  const [city, setCity] = useState(defaultValue?.toUpperCase() ?? "");
  const [custom, setCustom] = useState(
    defaultValue && !INDIAN_STATES_CITIES.some((s) => s.cities.some((x) => x.value === defaultValue.toUpperCase()))
      ? defaultValue
      : "",
  );

  const stateDef = INDIAN_STATES_CITIES.find((s) => s.state === state);
  const cityKey = city === OTHER ? normalizeCityKey(custom) : city;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-muted">State</label>
        <select
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setCity(e.target.value === OTHER ? OTHER : "");
          }}
          className={INPUT}
          aria-label="State"
        >
          <option value="" className="bg-white dark:bg-zinc-900">Select state</option>
          {INDIAN_STATES_CITIES.map((s) => (
            <option key={s.state} value={s.state} className="bg-white dark:bg-zinc-900">
              {s.state}
            </option>
          ))}
          <option value={OTHER} className="bg-white dark:bg-zinc-900">Other / type city</option>
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-muted">City</label>
        {state === OTHER ? (
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Type city name"
            className={INPUT}
            required={required}
          />
        ) : (
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={INPUT}
            disabled={!stateDef}
            aria-label="City"
            required={required}
          >
            <option value="" className="bg-white dark:bg-zinc-900">
              {stateDef ? "Select city" : "Pick a state first"}
            </option>
            {stateDef?.cities.map((x) => (
              <option key={x.value} value={x.value} className="bg-white dark:bg-zinc-900">
                {x.label}
              </option>
            ))}
            {stateDef ? (
              <option value={OTHER} className="bg-white dark:bg-zinc-900">Other city in this state</option>
            ) : null}
          </select>
        )}
      </div>

      {city === OTHER && state !== OTHER ? (
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold text-muted">City name</label>
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Type city name"
            className={INPUT}
            required={required}
          />
        </div>
      ) : null}

      <input type="hidden" name={name} value={cityKey} readOnly />
      <input type="hidden" name={stateName} value={state === OTHER ? "" : state} readOnly />
    </div>
  );
}
