"use client";

import Link from "next/link";
import { useState } from "react";
import { LayoutDashboard, LogOut, Info, Mail, Megaphone, ShieldCheck, Ticket, User } from "lucide-react";

import { signOutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";

export function UserMenu({
  name,
  isAdmin,
  isOrganizer,
}: {
  name: string | null;
  isAdmin: boolean;
  isOrganizer: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!name) {
    return (
      <Link href="/login">
        <Button size="sm">Log in</Button>
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="glass flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.35)]"
      >
        <User className="h-4 w-4 text-pink-neon" />
        <span className="hidden max-w-24 truncate sm:inline">{name}</span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="glass absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 dark:border-white/10 dark:bg-zinc-900"
          >
            <MenuLink href="/profile" onSelect={() => setOpen(false)}>
              <User className="h-4 w-4" /> My Profile
            </MenuLink>
            <MenuLink href="/tickets" onSelect={() => setOpen(false)}>
              <Ticket className="h-4 w-4" /> My Tickets
            </MenuLink>
            <MenuLink
              href={isOrganizer ? "/organizer" : "/list-your-event"}
              onSelect={() => setOpen(false)}
            >
              <Megaphone className="h-4 w-4" /> {isOrganizer ? "Manage Your Events" : "List Your Event"}
            </MenuLink>
            <MenuLink href="/about" onSelect={() => setOpen(false)}>
              <Info className="h-4 w-4" /> About Us
            </MenuLink>
            <MenuLink href="/contact" onSelect={() => setOpen(false)}>
              <Mail className="h-4 w-4" /> Contact Us
            </MenuLink>
            {isAdmin ? (
              <MenuLink href="/admin" onSelect={() => setOpen(false)}>
                <ShieldCheck className="h-4 w-4 text-violet-neon" /> Admin
              </MenuLink>
            ) : null}
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  children,
  onSelect,
}: {
  href: string;
  children: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onSelect}
      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 dark:hover:bg-white/10"
    >
      {children}
    </Link>
  );
}
