import Link from "next/link";

import { ThemeLogo } from "@/components/layout/theme-logo";
import { WhatsAppIcon as WhatsappIcon } from "@/components/ui/whatsapp-icon";

export function Footer({ isOrganizer = false, tagline = "" }: { isOrganizer?: boolean; tagline?: string }) {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-ink">
      <div className="mx-auto max-w-6xl px-4 py-12">
        {/* Top: logo + columns */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand + social */}
          <div className="space-y-4">
            <Link href="/" className="inline-block">
              <ThemeLogo width={140} height={32} />
            </Link>
            <p className="text-sm text-muted">
              {tagline || "Cyphers, battles, stunts, skates, jams & real communities. Discover raw events happening today near you."}
            </p>
            <div className="flex gap-3">
              <SocialLink href="https://instagram.com/outsiderr" label="Instagram">
                <InstagramIcon />
              </SocialLink>
              <SocialLink href="https://facebook.com/outsiderr" label="Facebook">
                <FacebookIcon />
              </SocialLink>
              <SocialLink href="https://youtube.com/@outsiderr" label="YouTube">
                <YoutubeIcon />
              </SocialLink>
              <SocialLink href="https://whatsapp.com/channel/outsiderr" label="WhatsApp Channel">
                <WhatsappIcon />
              </SocialLink>
            </div>
          </div>

          {/* Help */}
          <FooterColumn title="Help">
            <FooterLink href="/contact">Contact Us</FooterLink>
          </FooterColumn>

          {/* Quick Links */}
          <FooterColumn title="Quick Links">
            <FooterLink href={isOrganizer ? "/organizer" : "/list-your-event"}>
              {isOrganizer ? "Manage Your Events" : "Become an Organizer"}
            </FooterLink>
            {/* Clubs & Crews disabled for this release */}
            {/* <FooterLink href="/clubs">Join a Club / Crew</FooterLink> */}
            <FooterLink href="/about">About Us</FooterLink>
          </FooterColumn>

          {/* Legal */}
          <FooterColumn title="Legal">
            <FooterLink href="/legal/terms">Terms &amp; Conditions</FooterLink>
            <FooterLink href="/legal/privacy">Privacy Policy</FooterLink>
            <FooterLink href="/legal/refund">Refund Policy</FooterLink>
            <FooterLink href="/legal/cancellation">Cancellation Policy</FooterLink>
          </FooterColumn>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 border-t border-zinc-200 pt-6 dark:border-white/10">
          <p className="text-center text-xs text-muted">
            &copy; 2026 Outsiderr. All rights reserved.
          </p>
          <div className="mt-3 flex justify-center gap-6 text-xs">
            <Link href="/legal/terms" className="text-muted hover:text-violet-neon">
              Terms &amp; Conditions
            </Link>
            <Link href="/legal/privacy" className="text-muted hover:text-violet-neon">
              Privacy Policy
            </Link>
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-center text-[11px] leading-relaxed text-muted">
            By accessing this page, you confirm that you have read, understood, and agreed
            to our Terms of Service, Cookie Policy, Privacy Policy, and Content Guidelines.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-sm text-muted transition-colors hover:text-violet-neon"
      >
        {children}
      </Link>
    </li>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-muted transition-all hover:border-violet-neon hover:text-violet-neon dark:border-white/10"
    >
      {children}
    </a>
  );
}

/* ── Inline brand SVGs (lucide-react doesn't ship brand icons) ── */

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function YoutubeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </svg>
  );
}

