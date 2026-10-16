"use client";

import { useState } from "react";
import {
  Award,
  CalendarDays,
  Globe,
  Megaphone,
  Ticket,
  TrendingUp,
  Users,
} from "lucide-react";

const NODES = [
  {
    icon: Globe,
    title: "Branded covers",
    description: "16:9 desktop cover + a separate 3:4 mobile cover so your page looks sharp on every device - with a proper cropper built in.",
  },
  {
    icon: Users,
    title: "Join modes your way",
    description: "Open to everyone, request-to-join with custom questions, or invite-only links. Approve members, set subcategories, follow your niche.",
  },
  {
    icon: CalendarDays,
    title: "A living timeline",
    description: "Your community page shows a scrollable event timeline - past editions grayed out, upcoming events below a glowing 'Now' marker.",
  },
  {
    icon: Ticket,
    title: "Events wired in",
    description: "Every event you attach feeds the community timeline and page. Members discover your drops without leaving your space.",
  },
  {
    icon: Megaphone,
    title: "All your socials, one page",
    description: "Instagram, YouTube, X, Facebook, LinkedIn, website - linked right from your page header so followers find you everywhere.",
  },
  {
    icon: TrendingUp,
    title: "Member growth & virality",
    description: "Member counts, referred vs direct joins, virality coefficient - plus your warm audience: signed-in users who viewed your page but haven't joined or bought yet. And more lands every release.",
  },
  {
    icon: Award,
    title: "Members earn badges",
    description: "Consistency pays - Outsiderr rewards your regulars automatically: attendance badges from First Event to Community Champion, plus Founding Member and Connector badges for early joins and referrals.",
  },
];

/** Radial hub: feature nodes orbit a center that shows the selected detail.
 *  Mobile falls back to an accordion list. */
export function FeatureOrbit() {
  const [active, setActive] = useState(0);
  const [openMobile, setOpenMobile] = useState<number | null>(null);
  const Node = NODES[active];

  return (
    <div>
      {/* Orbit - md and up */}
      <div className="relative mx-auto hidden aspect-square max-w-[640px] select-none md:block">
        {/* orbit ring */}
        <div className="absolute inset-[13%] rounded-full border border-white/10" />
        <div className="absolute inset-[21%] rounded-full border border-white/5" />

        {/* center hub - shows the selected node's detail */}
        <div className="glass absolute left-1/2 top-1/2 flex h-52 w-52 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-violet-neon/30 p-6 text-center">
          <Node.icon className="h-7 w-7 text-violet-neon" />
          <p className="mt-2 text-sm font-bold leading-tight">{Node.title}</p>
          <p className="mt-1.5 text-[11px] leading-snug text-muted">{Node.description}</p>
        </div>

        {/* orbiting nodes */}
        {NODES.map((n, i) => {
          const angle = (-90 + i * (360 / NODES.length)) * (Math.PI / 180);
          const x = 50 + 45 * Math.cos(angle);
          const y = 50 + 45 * Math.sin(angle);
          const isActive = i === active;
          return (
            <button
              key={n.title}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i)}
              style={{ left: `${x}%`, top: `${y}%` }}
              className={`absolute flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1.5 rounded-full border p-3 text-center transition-all duration-300 lg:h-32 lg:w-32 ${
                isActive
                  ? "scale-110 border-violet-neon bg-violet-neon/15 shadow-glow-violet"
                  : "glass hover:border-violet-neon/50"
              }`}
              aria-label={n.title}
            >
              <n.icon className={`h-6 w-6 shrink-0 lg:h-7 lg:w-7 ${isActive ? "text-violet-neon" : "text-muted"}`} />
              <span className={`text-[11px] font-semibold leading-tight lg:text-xs ${isActive ? "text-foreground" : "text-muted"}`}>
                {n.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* Accordion - mobile */}
      <div className="space-y-2 md:hidden">
        {NODES.map((n, i) => (
          <div key={n.title} className="glass rounded-2xl">
            <button
              type="button"
              onClick={() => setOpenMobile(openMobile === i ? null : i)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <n.icon className="h-5 w-5 shrink-0 text-violet-neon" />
              <span className="text-sm font-bold">{n.title}</span>
              <span className="ml-auto text-muted">{openMobile === i ? "-" : "+"}</span>
            </button>
            {openMobile === i ? (
              <p className="px-4 pb-4 text-sm leading-relaxed text-muted">{n.description}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
