import { DEMO_EVENTS } from "@/lib/data/demo-data";
import type { Boost, EventDetail, Order, Ticket, WaitlistEntry } from "@/lib/types";

/**
 * Process-local store backing demo mode (no Supabase credentials configured).
 * It is intentionally non-persistent: restarting the server resets it.
 */
interface DemoStore {
  events: EventDetail[];
  orders: Order[];
  tickets: Ticket[];
  waitlist: WaitlistEntry[];
  boosts: Boost[];
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
    waitlist: [],
    boosts: [],
  };
  return globalStore.__outsiderrDemoStore;
}
