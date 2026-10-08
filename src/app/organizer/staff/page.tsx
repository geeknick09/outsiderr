import { getOrganizerGateContext } from "@/modules/organizer/server";
import { StaffManager } from "@/modules/scanner";
import { listAssignableEvents, listCashOutstanding, listStaffRecords } from "@/modules/scanner/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Box Office Staff - Outsiderr" };

export default async function OrganizerStaffPage() {
  const ctx = await getOrganizerGateContext();
  if ("gate" in ctx) return ctx.gate;
  const organizerId = ctx.organizerProfile.id;
  const [staff, events] = await Promise.all([
    listStaffRecords("ORGANIZER", organizerId),
    listAssignableEvents(organizerId),
  ]);
  const outstanding = await listCashOutstanding(staff.map((s) => s.id), events.map((e) => e.id));
  const cash = outstanding.map((o) => ({
    staffId: o.staffId,
    staffName: staff.find((s) => s.id === o.staffId)?.name ?? "Staff",
    eventId: o.eventId,
    eventTitle: events.find((e) => e.id === o.eventId)?.title ?? "Event",
    orderCount: o.orderCount,
    amountPaise: o.amountPaise,
  }));
  return <StaffManager staff={staff} events={events} cash={cash} scopeLabel="Your box office staff - assigned to your events only" />;
}
