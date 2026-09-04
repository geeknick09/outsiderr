import { redirect } from "next/navigation";

import { LoginPanel } from "@/components/auth/login-panel";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Prevent open redirect: only allow paths starting with "/" but not "//" (protocol-relative)
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (await getCurrentUser()) redirect(target);

  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="text-3xl font-black tracking-tight">Log in to Outsiderr</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Book tickets, manage events and check people in at the door.
      </p>
      <div className="glass rounded-3xl p-6">
        <LoginPanel next={target} />
      </div>
    </div>
  );
}
