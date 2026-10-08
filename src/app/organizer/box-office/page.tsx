import { redirect } from "next/navigation";

export const metadata = { title: "Box Office - Outsiderr" };

/**
 * The counter lives at /box-office (staff phone + personal PIN).
 * The old per-event box_office_pins page is retired - organizers register
 * counter staff inside the event page's Box Office section.
 */
export default function BoxOfficePage() {
  redirect("/box-office");
}
