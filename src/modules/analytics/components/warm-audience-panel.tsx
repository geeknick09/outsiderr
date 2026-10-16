import { Eye } from "lucide-react";
import { formatDateTime } from "@/modules/shared";
import type { WarmLead } from "../data/virality";

/** Organizer warm-audience list - people who viewed but didn't convert. */
export function WarmAudiencePanel({ leads }: { leads: WarmLead[] }) {
  if (!leads.length) return null;
  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-pink-neon" />
        <h3 className="text-sm font-bold">Interested, not converted yet</h3>
      </div>
      <p className="mt-1 text-xs text-muted">
        Signed-in users who viewed your event/community pages but haven&apos;t bought or joined.
        Share a campaign or drop a promo to bring them in.
      </p>
      <div className="mt-4 max-h-72 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-muted dark:border-white/10">
              <th className="px-2 py-2">User</th>
              <th className="hidden px-2 py-2 sm:table-cell">Contact</th>
              <th className="px-2 py-2">Viewed</th>
              <th className="hidden px-2 py-2 md:table-cell">Kind</th>
              <th className="px-2 py-2">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l, i) => (
              <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-white/5">
                <td className="px-2 py-2.5 font-medium">
                  {l.userName}
                  <span className="block text-[10px] font-normal text-muted sm:hidden">
                    {l.email ?? l.phone ?? ""}
                  </span>
                </td>
                <td className="hidden max-w-[180px] truncate px-2 py-2.5 text-xs text-muted sm:table-cell">
                  {l.email ?? ""}
                  {l.phone ? <span className="block">{l.phone}</span> : null}
                </td>
                <td className="max-w-[200px] truncate px-2 py-2.5">{l.entityName}</td>
                <td className="hidden px-2 py-2.5 md:table-cell">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    l.entityType === "EVENT"
                      ? "bg-violet-neon/15 text-violet-neon"
                      : "bg-pink-neon/15 text-pink-neon"
                  }`}>
                    {l.entityType === "EVENT" ? "Event" : "Community"}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-xs text-muted">{formatDateTime(l.lastViewedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
