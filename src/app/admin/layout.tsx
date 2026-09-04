import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart2, BellRing, CalendarDays, ShieldCheck, UserSquare2, Users, Zap, Settings, UsersRound, FileText, TrendingUp } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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

const NAV = [
  { href: "/admin", label: "Overview", icon: BarChart2, exact: true },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
  { href: "/admin/orders", label: "Orders", icon: Zap },
  { href: "/admin/revenue", label: "Revenue", icon: TrendingUp },
  { href: "/admin/boosts", label: "Boosts", icon: BellRing },
  { href: "/admin/clubs", label: "Clubs", icon: UserSquare2 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/door-staff", label: "Door Staff", icon: UsersRound },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/legal", label: "Legal Pages", icon: FileText },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAdmin = await checkAdminAccess();
  if (!isAdmin) redirect("/");

  return (
    <div className="flex min-h-[calc(100vh-4rem)] gap-0 lg:gap-6">
      {/* Sidebar */}
      <nav className="hidden w-52 shrink-0 pt-6 lg:block">
        <div className="sticky top-24 space-y-1">
          <div className="mb-4 flex items-center gap-2 px-3 text-sm font-bold text-muted">
            <ShieldCheck className="h-4 w-4 text-violet-neon" />
            Admin
          </div>
          {NAV.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </div>
      </nav>

      {/* Mobile tab bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-zinc-200 bg-zinc-50/90 backdrop-blur-xl dark:border-white/10 dark:bg-ink/90 lg:hidden">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted hover:text-violet-neon"
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </div>

      <main className="flex-1 py-6 pb-24 lg:pb-6">{children}</main>
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
