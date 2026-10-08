import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";

import { createServiceClient } from "@/modules/shared/server";
import { formatPaise } from "@/modules/shared";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Counter Payment - Outsiderr" };
}

/** Landing page after a counter Razorpay payment - shows the minted ticket. */
export default async function CounterOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const supabase = createServiceClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, total_paise, event_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <XCircle className="mx-auto mb-3 h-10 w-10 text-red-500" />
        <h1 className="text-lg font-black">Order not found</h1>
        <Link href="/box-office" className="mt-4 inline-block text-sm font-semibold text-violet-neon hover:underline">
          Back to box office
        </Link>
      </div>
    );
  }

  if (order.status !== "CONFIRMED") {
    // Client-side verify raced the webhook - the payment may still be landing.
    const label =
      order.status === "RESERVED" ? "Payment received - confirming. Refresh in a moment." : `This order is ${order.status.toLowerCase()}.`;
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <Clock3 className="mx-auto mb-3 h-10 w-10 text-amber-500" />
        <h1 className="text-lg font-black">{label}</h1>
        <p className="mt-2 text-sm text-muted">
          Amount: {formatPaise(order.total_paise)}
        </p>
        <Link href={`/box-office/order/${order.id}`} className="mt-4 inline-block rounded-full bg-neon-gradient px-5 py-2 text-sm font-bold text-white">
          Refresh
        </Link>
        <div className="mt-3">
          <Link href="/box-office" className="text-sm font-semibold text-violet-neon hover:underline">
            Back to box office
          </Link>
        </div>
      </div>
    );
  }

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id")
    .eq("order_id", order.id)
    .limit(1)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
      <h1 className="text-lg font-black">Payment received - ticket issued</h1>
      <p className="mt-2 text-sm text-muted">{formatPaise(order.total_paise)} paid by Razorpay</p>
      {ticket ? (
        <Link
          href={`/box-office/ticket/${ticket.id}/print`}
          target="_blank"
          className="mt-5 inline-block rounded-full bg-neon-gradient px-5 py-2.5 text-sm font-bold text-white"
        >
          Open ticket for the buyer
        </Link>
      ) : (
        <p className="mt-5 text-sm text-muted">The ticket is being generated - refresh in a moment.</p>
      )}
      <div className="mt-4">
        <Link href="/box-office" className="text-sm font-semibold text-violet-neon hover:underline">
          Sell another ticket
        </Link>
      </div>
    </div>
  );
}
