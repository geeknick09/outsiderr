"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ShieldCheck } from "lucide-react";

import { ADMIN_NAV } from "../nav";

export function AdminMobileNav() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  // Only render inside the admin section; the admin layout itself guards access.
  const inAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape key closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Only show on admin routes. Renders nothing elsewhere.
  if (!inAdmin) return null;

  return (
    <>
      {/* Hamburger — sits in the header (top-left), mobile only */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open admin menu"
        aria-expanded={open}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white/70 text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Portal to body — escapes the header's backdrop-filter containing block
          so the drawer is truly fixed to the viewport and above all chrome. */}
      {mounted && open
        ? createPortal(
            <>
              {/* Backdrop — click outside to close */}
              <div
                className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm lg:hidden"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />

              {/* Slide-in drawer */}
              <aside className="fixed inset-y-0 left-0 z-[70] w-64 overflow-y-auto border-r border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-ink lg:hidden">
                <div className="sticky top-0 flex items-center justify-between border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-ink/95">
                  <div className="flex items-center gap-2 text-sm font-bold text-muted">
                    <ShieldCheck className="h-4 w-4 text-violet-neon" />
                    Admin
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close admin menu"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <nav className="space-y-1 p-3">
                  {ADMIN_NAV.map((item) => {
                    const active = item.exact
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                          active
                            ? "bg-violet-neon/10 text-violet-neon"
                            : "text-muted hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white"
                        }`}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </aside>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
