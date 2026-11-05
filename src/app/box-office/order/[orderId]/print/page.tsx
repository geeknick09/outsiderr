import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { PrintButton } from "@/modules/organizer";
import { QrCode, formatDateTime } from "@/modules/shared";
import { createServiceClient, getEvent } from "@/modules/shared/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Box Office Tickets - Outsiderr" };
}

/** Prints every ticket of one counter order on consecutive pages. */
export default async function BoxOfficeOrderPrintPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const supabase = createServiceClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, event_id, buyer_name, buyer_phone, buyer_email, confirmed_at, quantity")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) notFound();

  const [event, ticketsRes] = await Promise.all([
    getEvent(order.event_id),
    supabase
      .from("tickets")
      .select("id, qr_hash, status, tier_id")
      .eq("order_id", orderId)
      .order("id"),
  ]);
  if (!event) notFound();
  const tickets = ticketsRes.data ?? [];
  if (tickets.length === 0) notFound();

  const tierIds = [...new Set(tickets.map((t) => t.tier_id))];
  const { data: tiers } = await supabase.from("ticket_tiers").select("id, name").in("id", tierIds);
  const tierMap = Object.fromEntries((tiers ?? []).map((t) => [t.id, t.name]));
  const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  return (
    <div className="min-h-screen bg-white px-8 py-10 text-zinc-900 dark:bg-white dark:text-zinc-900">
      <div className="mb-8 flex items-center justify-between print:hidden">
        <Link href="/box-office" className="flex items-center gap-1 text-sm font-semibold text-violet-neon hover:underline">
          <ChevronLeft className="h-4 w-4" />
          Back to box office
        </Link>
        <PrintButton />
      </div>

      {tickets.map((t, i) => (
        <div key={t.id} className={`mx-auto max-w-md ${i < tickets.length - 1 ? "mb-10 pb-6 print:break-after-page" : ""}`}>
          <div className="mb-6 border-b border-zinc-200 pb-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Outsiderr · Box Office Ticket</p>
            <h1 className="mt-1 text-2xl font-black">{event.title}</h1>
            <p className="mt-1 text-xs text-zinc-500">{formatDateTime(event.startsAt)} · Ticket {i + 1} of {tickets.length}</p>
          </div>
          <div className="flex flex-col items-center">
            <QrCode value={t.qr_hash} size={200} className="rounded-lg" />
            <p className="mt-2 font-mono text-[10px] text-zinc-400">{t.qr_hash.slice(0, 32)}…</p>
          </div>
          <div className="mt-6 space-y-1 text-sm">
            <p><span className="text-zinc-500">Name:</span> {order.buyer_name ?? "-"}</p>
            {order.buyer_phone ? <p><span className="text-zinc-500">Phone:</span> {order.buyer_phone}</p> : null}
            <p><span className="text-zinc-500">Tier:</span> {tierMap[t.tier_id] ?? "Ticket"}</p>
          </div>
          <p className="mt-6 border-t border-zinc-200 pt-3 text-center text-[10px] text-zinc-400">
            Present the QR code above at the venue for entry. Generated {generatedAt}
          </p>
        </div>
      ))}
    </div>
  );
}
