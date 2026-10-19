import { redirect } from "next/navigation";

export default function AdminPayoutsRedirect() {
  redirect("/admin/money?tab=payouts");
}
