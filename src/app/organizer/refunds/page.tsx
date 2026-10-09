import { redirect } from "next/navigation";

/** Unified transaction ledger merged payments + refunds. */
export default function Page() {
  redirect("/organizer/ledger");
}
