import { NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Debug endpoint — shows all events in the database regardless of RLS
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not in Supabase mode" });
  }

  const supabase = await createClient();

  // Query 1: All events with no filter
  const { data: allEvents, error: allError } = await supabase
    .from("events")
    .select("id, title, status, city, category, starts_at, is_featured, organizer_id")
    .order("created_at", { ascending: false });

  // Query 2: Just published events
  const { data: publishedEvents, error: pubError } = await supabase
    .from("events")
    .select("id, title, status, city, category, starts_at, is_featured")
    .eq("status", "PUBLISHED");

  // Query 3: Check hero boosts
  const { data: heroBoosts, error: heroError } = await supabase
    .from("hero_boosts")
    .select("*");

  type RawEvent = {
    id: string;
    title: string;
    status: string;
    city: string;
    category: string;
    starts_at: string;
    is_featured: boolean;
    organizer_id?: string;
  };

  return NextResponse.json({
    totalEvents: allEvents?.length ?? 0,
    allEvents: (allEvents as unknown as RawEvent[] | null)?.map(e => ({
      id: e.id,
      title: e.title,
      status: e.status,
      city: e.city,
      category: e.category,
      startsAt: e.starts_at,
      isFeatured: e.is_featured,
      organizerId: e.organizer_id,
    })) ?? [],
    allEventsError: allError ? JSON.stringify(allError) : null,
    publishedCount: publishedEvents?.length ?? 0,
    publishedEvents: (publishedEvents as unknown as RawEvent[] | null)?.map(e => ({
      id: e.id,
      title: e.title,
      city: e.city,
      startsAt: e.starts_at,
    })) ?? [],
    publishedError: pubError ? JSON.stringify(pubError) : null,
    heroBoosts: heroBoosts?.map(b => ({
      id: (b as { id: string }).id,
      eventId: (b as { event_id: string }).event_id,
      status: (b as { status: string }).status,
      expiresAt: (b as { expires_at: string | null }).expires_at,
    })) ?? [],
    heroBoostsError: heroError ? JSON.stringify(heroError) : null,
  });
}
