import { StaffManager } from "@/modules/scanner";
import { listAssignableEvents, listCashOutstanding, listStaffRecords } from "@/modules/scanner/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Box Office Staff - Outsiderr" };

export default async function AdminBoxOfficeStaffPage() {
  const [staff, events] = await Promise.all([listStaffRecords("ADMIN", null), listAssignableEvents(null)]);
  const outstanding = await listCashOutstanding(staff.map((s) => s.id), events.map((e) => e.id));
  const cash = outstanding.map((o) => ({
    staffId: o.staffId,
    staffName: staff.find((s) => s.id === o.staffId)?.name ?? "Staff",
    eventId: o.eventId,
    eventTitle: events.find((e) => e.id === o.eventId)?.title ?? "Event",
    orderCount: o.orderCount,
    amountPaise: o.amountPaise,
  }));
  return <StaffManager staff={staff} events={events} cash={cash} scopeLabel="Team Outsiderr staff - door and box office, any event" />;
}
