import { redirect } from "next/navigation";

export default function AdminRevenueRedirect() {
  redirect("/admin/money?tab=revenue");
}
