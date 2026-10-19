// modules/admin - admin nav items shared by the desktop sidebar (server layout)
// and the mobile drawer (client component). Plain module - no "use client" -
// so both server and client consumers can import it. Icons are lucide components.
import {
  BarChart2, BellRing, CalendarDays, Users, Zap, Settings, FileText,
  TrendingUp, CreditCard, Wallet, LineChart, KeyRound, Store, BadgeCheck,
  RotateCcw, Crown, Megaphone, ClipboardCheck } from "lucide-react";
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
  { href: "/admin/money", label: "Money", icon: Wallet },
  { href: "/admin/promoters", label: "Promoters", icon: Megaphone },
  { href: "/admin/boosts", label: "Boosts", icon: BellRing },
  { href: "/admin/analytics", label: "Analytics", icon: LineChart },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/organizers", label: "Organizers", icon: Crown },
  { href: "/admin/kyc", label: "KYC Review", icon: BadgeCheck },
  { href: "/admin/scanner-pins", label: "Scanner PINs", icon: KeyRound },
  { href: "/admin/box-office", label: "Box Office", icon: Store },
  { href: "/admin/compliance", label: "Compliance & Legal", icon: ClipboardCheck },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];
