import type { Metadata } from "next";

export const metadata: Metadata = { title: "Contact Us — Outsiderr" };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <h1 className="text-3xl font-black tracking-tight">Contact Us</h1>
      <div className="glass space-y-4 rounded-3xl p-6 text-sm leading-relaxed">
        <div>
          <p className="font-bold">WhatsApp</p>
          <p className="text-muted">+91 79800 85212</p>
          <p className="mt-1 text-xs text-muted">
            Send payment screenshots here after booking a paid event.
          </p>
        </div>
        <div>
          <p className="font-bold">Email</p>
          <p className="text-muted">hello@outsiderr.in</p>
        </div>
        <div>
          <p className="font-bold">Instagram</p>
          <p className="text-muted">@outsiderr.in</p>
        </div>
        <div className="pt-4 border-t border-zinc-200 dark:border-white/10">
          <p className="text-xs text-muted">
            For organizers: need help with event setup, door staff, or payouts? Reach out
            on WhatsApp and we&apos;ll get back to you within 24 hours.
          </p>
        </div>
      </div>
    </div>
  );
}
