import type { Metadata } from "next";

export const metadata: Metadata = { title: "About Us — Outsiderr" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <h1 className="text-3xl font-black tracking-tight">About Outsiderr</h1>
      <div className="glass space-y-4 rounded-3xl p-6 text-sm leading-relaxed text-muted">
        <p>
          Outsiderr is a platform for discovering and booking tickets to underground and
          extreme sport events — dance battles, cyphers, rap events, skateboard events,
          MTB stunt events, run club marathons, walkathons, and more.
        </p>
        <p>
          A lot of these events have limited promotion — Instagram reels, word of mouth,
          or community group chats. Outsiderr brings them all into one place where people
          can find what&apos;s happening this week, today, or coming up soon — and book
          their tickets instantly.
        </p>
        <p>
          For organizers, Outsiderr provides tools to publish events, sell tickets, manage
          door staff, scan QR tickets at the entrance, boost event visibility, and build
          a community through clubs and crews.
        </p>
        <p>
          For attendees, Outsiderr offers a clean, mobile-first experience to discover
          events by category, city, and date — with free RSVP and paid ticket options,
          a ticket wallet with downloadable QR passes, and waitlists for sold-out events.
        </p>
      </div>
    </div>
  );
}
