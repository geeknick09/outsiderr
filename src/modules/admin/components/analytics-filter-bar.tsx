import Link from "next/link";

import { CITIES, cityLabel } from "@/modules/shared";

/** GET-form city + date-range filter shared by /admin and /admin/analytics. */
export function AnalyticsFilterBar({
  basePath,
  filter,
}: {
  basePath: string;
  filter: { city?: string; from?: string; to?: string };
}) {
  return (
    <form method="get" action={basePath} className="glass flex flex-wrap items-end gap-3 rounded-3xl p-4">
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">City</label>
        <select
          name="city"
          defaultValue={filter.city ?? ""}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
        >
          <option value="">All cities</option>
          {CITIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">From</label>
        <input
          type="date"
          name="from"
          defaultValue={filter.from ?? ""}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">To</label>
        <input
          type="date"
          name="to"
          defaultValue={filter.to ?? ""}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
        />
      </div>
      <button type="submit" className="rounded-full bg-neon-gradient px-5 py-2 text-sm font-bold text-white shadow-glow-violet">
        Apply
      </button>
      {(filter.city || filter.from || filter.to) ? (
        <Link href={basePath} className="px-2 py-2 text-xs text-muted underline">
          Clear
        </Link>
      ) : null}
      {(filter.city || filter.from || filter.to) ? (
        <p className="py-2 text-xs text-muted">
          {[
            filter.city ? `city: ${cityLabel(filter.city as never)} (event-scoped stats)` : null,
            filter.from || filter.to ? `range: ${filter.from ?? "…"} → ${filter.to ?? "…"}` : null,
          ].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </form>
  );
}
