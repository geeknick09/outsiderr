import type { Metadata } from "next";

import { Navbar } from "@/components/layout/navbar";
import { ThemeProvider } from "@/components/theme/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Outsiderr — Underground events, discovered",
  description:
    "Discover jams, battles, gigs, workshops, standup and sports happening around you. Book tickets in a tap.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-zinc-50 font-sans text-zinc-900 antialiased dark:bg-ink dark:text-white">
        <ThemeProvider>
          <Navbar />
          <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
