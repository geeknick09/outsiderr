import { redirect } from "next/navigation";

export default function AdminPaymentsRedirect() {
  redirect("/admin/money?tab=payments");
}
