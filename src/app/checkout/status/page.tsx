import { redirect } from "next/navigation";

import { getCurrentUser } from "@/modules/shared/server";
import { PaymentStatusPoller } from "@/modules/web";

export const dynamic = "force-dynamic";

export const metadata = { title: "Payment status — Outsiderr" };

/**
 * Post-payment status page. The Razorpay client callback lands here after
 * verifyPayment succeeds (or the user returns from a closed/reopened tab).
 * The poller checks every 3s for up to 2 minutes, subscribes to Realtime on
 * the order, and only then shows a pending state — never a false failure.
 */
export default async function CheckoutStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; event?: string }>;
}) {
  const { order, event: eventId } = await searchParams;
  if (!order) redirect("/");

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/checkout/status?order=${order}`)}`);

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="text-center text-2xl font-black tracking-tight">Payment status</h1>
      <div className="mt-6">
        <PaymentStatusPoller orderId={order} eventId={eventId ?? null} />
      </div>
    </div>
  );
}