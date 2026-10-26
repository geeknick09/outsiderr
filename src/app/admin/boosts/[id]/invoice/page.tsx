import { notFound } from "next/navigation";
import Link from "next/link";

import { getBoostInvoice } from "@/modules/admin/server";
import { formatPaise, formatDateTime } from "@/modules/shared";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Boost Invoice - Outsiderr" };

const PLACEMENT_LABEL: Record<string, string> = {
  HOME: "Homepage",
  COMMUNITIES: "Communities",
  BOTH: "Homepage + Communities",
};

export default async function BoostInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const { type } = await searchParams;
  const kind = type === "hero" ? "FEATURE" : "SLOT";
  const inv = await getBoostInvoice(kind, id);
  if (!inv) notFound();

  const days =
    inv.windowStart && inv.windowEnd
      ? Math.max(1, Math.ceil((new Date(inv.windowEnd).getTime() - new Date(inv.windowStart).getTime()) / 864e5))
      : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/admin/boosts" className="text-xs text-violet-neon hover:underline">
        ← Back to campaigns
      </Link>

      <div className="glass space-y-6 rounded-3xl p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-violet-neon">Invoice</p>
            <h1 className="mt-1 text-2xl font-black">{inv.invoiceNo}</h1>
          </div>
          <div className="text-right">
            <p className="text-lg font-black">Outsiderr</p>
            <p className="text-xs text-muted">{inv.paidAt ? formatDateTime(inv.paidAt) : ""}</p>
          </div>
        </div>

        <div className="grid gap-4 rounded-2xl bg-white/5 p-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Billed to</p>
            <p className="mt-1 text-sm font-bold">{inv.organizerName}</p>
            <p className="text-xs text-muted">{inv.organizerEmail ?? "-"}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Status</p>
            <p className="mt-1 text-sm font-bold">{inv.status}</p>
            {inv.paymentRef ? (
              <p className="font-mono text-[11px] text-muted">{inv.paymentRef.slice(0, 28)}</p>
            ) : null}
          </div>
        </div>

        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-muted dark:border-white/10">
              <th className="pb-2">Item</th>
              <th className="pb-2 text-right">Window</th>
              <th className="pb-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-zinc-100 dark:border-white/5">
              <td className="py-3">
                <p className="font-semibold">
                  {inv.kind === "SLOT" ? `Sponsored slot #${inv.slot}` : "Feature placement"} - {inv.eventTitle}
                </p>
                <p className="text-xs text-muted">
                  {PLACEMENT_LABEL[inv.placement] ?? inv.placement}
                  {days ? ` · ${days} day${days === 1 ? "" : "s"}` : ""}
                </p>
              </td>
              <td className="py-3 text-right text-xs text-muted">
                {inv.windowStart ? formatDateTime(inv.windowStart) : "-"}
                <br />to {inv.windowEnd ? formatDateTime(inv.windowEnd) : "-"}
              </td>
              <td className="py-3 text-right font-black">{formatPaise(inv.amountPaise)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="pt-3 text-right text-sm font-bold">Total paid</td>
              <td className="pt-3 text-right text-lg font-black text-violet-neon">
                {formatPaise(inv.amountPaise)}
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="text-[11px] text-muted">
          Payment processed via Razorpay. Payment gateway fees are borne by the platform; the amount
          above is what the organizer was charged for the promotion.
        </p>
      </div>
    </div>
  );
}
