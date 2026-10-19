import { redirect } from "next/navigation";

export default function AdminBoxOfficeStaffRedirect() {
  redirect("/admin/box-office?tab=staff");
}
