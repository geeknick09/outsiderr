import { redirect } from "next/navigation";
export default async function ClubRedirect({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/communities/${(await params).id}`);
}
