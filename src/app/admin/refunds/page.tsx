import { redirect } from "next/navigation";

export default async function AdminRefundsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  redirect(`/admin/money?tab=refunds${status ? `&status=${status}` : ""}`);
}
