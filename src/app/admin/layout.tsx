import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { getCurrentUser } from "@/modules/shared/server";
import { createClient } from "@/modules/shared/server";
import { ADMIN_NAV } from "@/modules/admin";

async function checkAdminAccess(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.is_admin === true;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAdmin = await checkAdminAccess();
  if (!isAdmin) redirect("/");

  return (
    <div className="flex min-h-[calc(100vh-4rem)] gap-0 lg:gap-6">
      {/* Sidebar (desktop) */}
      <nav className="hidden w-52 shrink-0 pt-6 lg:block">
        <div className="sticky top-24 space-y-1">
          <div className="mb-4 flex items-center gap-2 px-3 text-sm font-bold text-muted">
            <ShieldCheck className="h-4 w-4 text-violet-neon" />
            Admin
          </div>
          {ADMIN_NAV.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </div>
      </nav>

      <main className="flex-1 py-6">{children}</main>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
