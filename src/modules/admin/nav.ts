// modules/admin — admin nav items shared by the desktop sidebar (server layout)
// and the mobile drawer (client component). Plain module — no "use client" —
// so both server and client consumers can import it. Icons are lucide components.
import {
  BarChart2, BellRing, CalendarDays, Users, Zap, Settings, FileText,
  TrendingUp, CreditCard, Wallet, LineChart, KeyRound, Store, BadgeCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview", icon: BarChart2, exact: true },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
  { href: "/admin/orders", label: "Transactions", icon: Zap },
  { href: "/admin/revenue", label: "Revenue", icon: TrendingUp },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/payouts", label: "Payouts", icon: Wallet },
  { href: "/admin/boosts", label: "Boosts", icon: BellRing },
  { href: "/admin/analytics", label: "Analytics", icon: LineChart },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/kyc", label: "KYC Review", icon: BadgeCheck },
  { href: "/admin/scanner-pins", label: "Scanner PINs", icon: KeyRound },
  { href: "/admin/box-office", label: "Box Office", icon: Store },
  { href: "/admin/box-office-pins", label: "Box Office PINs", icon: Store },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/legal", label: "Legal Pages", icon: FileText },
];
