import { DEMO_EVENTS } from "@/lib/data/demo-data";
import type { EventDetail, Order, Ticket } from "@/lib/types";

/**
 * Process-local store backing demo mode (no Supabase credentials configured).
 * It is intentionally non-persistent: restarting the server resets it.
 */
interface DemoStore {
  events: EventDetail[];
  orders: Order[];
  tickets: Ticket[];
}

const globalStore = globalThis as typeof globalThis & {
  __outsiderrDemoStore?: DemoStore;
};

export function demoStore(): DemoStore {
  globalStore.__outsiderrDemoStore ??= {
    events: DEMO_EVENTS.map((event) => ({
      ...event,
      tiers: event.tiers.map((tier) => ({ ...tier })),
    })),
    orders: [],
    tickets: [],
  };
  return globalStore.__outsiderrDemoStore;
}
