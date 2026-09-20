import type { Metadata, Viewport } from "next";

import { Footer } from "@/modules/shared";
import { Navbar } from "@/modules/shared/server";
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
  title: "Outsiderr — Underground events, discovered",
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  // Parallelize: fetch footer tagline and organizer profile at the same time
  const [footerTagline, org, rejectionLimit] = await Promise.all([
    getTaglineFooter(),
    user ? getOrganizerProfile(user) : Promise.resolve(null),
    getSettingInt("organizer_rejection_limit"),
  ]);
  const isOrganizer = org ? getOrganizerAccessState({
    kycStatus: org.kycStatus,
    rejectionCount: org.rejectionCount,
    rejectionLimit,
  }).eligible : false;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-zinc-50 font-sans text-zinc-900 antialiased dark:bg-ink dark:text-white">
        <ThemeProvider>
          <NavigationProgress />
          <Navbar />
          <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6">{children}</main>
          <Footer isOrganizer={isOrganizer} tagline={footerTagline} />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
