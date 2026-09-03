import type { Metadata, Viewport } from "next";

import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { ServiceWorkerRegister } from "@/components/pwa/register-sw";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { getCurrentUser } from "@/lib/auth";
import { getOrganizerProfile } from "@/lib/data/organizer";
import { getTaglineFooter } from "@/lib/data/platform-settings";

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
  let isOrganizer = false;
  if (user) {
    const org = await getOrganizerProfile(user);
    isOrganizer = !!org;
  }
  const footerTagline = await getTaglineFooter();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-zinc-50 font-sans text-zinc-900 antialiased dark:bg-ink dark:text-white">
        <ThemeProvider>
          <Navbar />
          <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6">{children}</main>
          <Footer isOrganizer={isOrganizer} tagline={footerTagline} />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
