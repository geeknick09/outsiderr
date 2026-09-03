import Link from "next/link";

import { ThemeLogo } from "@/components/layout/theme-logo";

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
            <FooterLink href="/clubs">Join a Club / Crew</FooterLink>
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

function WhatsappIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}
