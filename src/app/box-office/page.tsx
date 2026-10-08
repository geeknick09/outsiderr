import { CounterClient } from "@/modules/scanner";

export const dynamic = "force-dynamic";

export const metadata = { title: "Box Office - Outsiderr" };

export default function CounterPage() {
  return (
    <div className="py-6">
      <CounterClient />
    </div>
  );
}
