import { redirect } from "next/navigation";

export default function AdminBoxOfficePinsRedirect() {
  redirect("/admin/box-office?tab=pins");
}
