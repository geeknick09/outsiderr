import { redirect } from "next/navigation";

export default function AdminLegalRedirect() {
  redirect("/admin/compliance?tab=legal");
}
