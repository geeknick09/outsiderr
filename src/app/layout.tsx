import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";

import { Footer } from "@/modules/shared";
import { Navbar } from "@/modules/shared/server";
import { AdminMobileNav } from "@/modules/admin";
import { NavigationProgress } from "@/modules/shared";
import { ServiceWorkerRegister } from "@/modules/shared";
import { ThemeProvider } from "@/modules/shared";
import { getCurrentUser } from "@/modules/shared/server";
import { getOrganizerProfile } from "@/modules/shared/server";
import { getSettingInt, getTaglineFooter } from "@/modules/shared/server";
import { getOrganizerAccessState } from "@/modules/shared";

import "./globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0E" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  userScalable: true,
};

export const metadata: Metadata = {
  title: "Outsiderr - Underground events, discovered",
  description:
    "Cyphers, block parties, battles, stunts, skates, meetups, jams & real communities. Discover raw underground events happening today near you.",
  applicationName: "Outsiderr",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Outsiderr",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/lightmode.png", type: "image/png" },
      { url: "/darkmode.png", type: "image/png" },
    ],
    apple: [{ url: "/lightmode.png" }],
  },
  appLinks: {
    web: { url: "https://outsiderr.app", should_fallback: true },
  },
};

/** Swallow non-critical fetch failures so router.refresh() never crashes layouts. */
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await safe(getCurrentUser(), null);
  // Parallelize: fetch footer tagline and organizer profile at the same time
  const [footerTagline, org, rejectionLimit] = await Promise.all([
    safe(getTaglineFooter(), null),
    user ? safe(getOrganizerProfile(user), null) : Promise.resolve(null),
    safe(getSettingInt("organizer_rejection_limit"), 3),
  ]);
  const isOrganizer = org ? getOrganizerAccessState({
    kycStatus: org.kycStatus,
    rejectionCount: org.rejectionCount,
    rejectionLimit,
  }).eligible : false;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-zinc-50 font-sans text-zinc-900 antialiased dark:bg-ink dark:text-white">
        {/* Disable browser scroll restoration BEFORE hydration - doing it in a
            useEffect is too late (browser restores mid-page scroll first). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if ("scrollRestoration" in history) history.scrollRestoration = "manual";
if ("serviceWorker" in navigator && location.hostname !== "localhost") navigator.serviceWorker.register("/sw.js").catch(() => {});`,
          }}
        />
        <ThemeProvider>
          <NavigationProgress />
          <Navbar mobileNav={<AdminMobileNav />} />
          <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6">{children}</main>
          <Footer isOrganizer={isOrganizer} tagline={footerTagline ?? undefined} />
          <ServiceWorkerRegister />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
