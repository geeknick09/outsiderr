/**
 * Member badges - computed on read, no storage needed.
 * attended = tickets USED (scanned at the door), referrals = members who joined
 * via this member's invite code.
 */

export interface BadgeDef {
  key: string;
  label: string;
  hint: string;
}

export const BADGE_LEVELS: { key: string; label: string; hint: string }[] = [
  { key: "FIRST_EVENT", label: "First Event", hint: "Attended their first event" },
  { key: "REGULAR", label: "Regular", hint: "Attended 3 events" },
  { key: "FIVE_STRONG", label: "5 Events Strong", hint: "Attended 5 events" },
  { key: "TEN_STRONG", label: "10 Events Strong", hint: "Attended 10 events" },
  { key: "CHAMPION", label: "Community Champion", hint: "15 attended in one community" },
  { key: "FOUNDING", label: "Founding Member", hint: "Joined a community in its first 30 days" },
  { key: "CONNECTOR", label: "Connector", hint: "Brought 3+ members via their invite link" },
];

export function computeBadges(stats: {
  attendedTotal: number;
  attendedInCommunity?: number;
  referrals?: number;
  foundingMember?: boolean;
}): BadgeDef[] {
  const out: BadgeDef[] = [];
  if (stats.attendedTotal >= 1) out.push(BADGE_LEVELS[0]);
  if (stats.attendedTotal >= 3) out.push(BADGE_LEVELS[1]);
  if (stats.attendedTotal >= 5) out.push(BADGE_LEVELS[2]);
  if (stats.attendedTotal >= 10) out.push(BADGE_LEVELS[3]);
  if ((stats.attendedInCommunity ?? 0) >= 15) out.push(BADGE_LEVELS[4]);
  if (stats.foundingMember) out.push(BADGE_LEVELS[5]);
  if ((stats.referrals ?? 0) >= 3) out.push(BADGE_LEVELS[6]);
  return out;
}

export const BADGE_TONES: Record<string, string> = {
  FIRST_EVENT: "bg-zinc-500/15 text-zinc-500",
  REGULAR: "bg-blue-500/15 text-blue-500",
  FIVE_STRONG: "bg-violet-neon/15 text-violet-neon",
  TEN_STRONG: "bg-fuchsia-500/15 text-fuchsia-500",
  CHAMPION: "bg-amber-500/15 text-amber-500",
  FOUNDING: "bg-lime-500/15 text-lime-600 dark:text-lime-400",
  CONNECTOR: "bg-cyan-500/15 text-cyan-500",
};
