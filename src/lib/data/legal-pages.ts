import "server-only";

import { demoStore } from "@/lib/data/demo-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface LegalPage {
  slug: string;
  title: string;
  content: string;
  version: number;
  isPublished: boolean;
  updatedAt: string;
}

const DEMO_PAGES: LegalPage[] = [
  {
    slug: "terms",
    title: "Terms & Conditions",
    content:
      "# Terms & Conditions\n\nBy using Outsiderr, you agree to these terms.\n\n- Event organizers are responsible for their events.\n- Tickets are non-refundable unless the event is cancelled.\n- Outsiderr is a platform and does not guarantee event quality.",
    version: 1,
    isPublished: true,
    updatedAt: new Date().toISOString(),
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    content:
      "# Privacy Policy\n\nWe respect your privacy.\n\n- We collect only the information needed to process bookings.\n- We do not sell your data to third parties.\n- You can request data deletion at any time.",
    version: 1,
    isPublished: true,
    updatedAt: new Date().toISOString(),
  },
  {
    slug: "refund",
    title: "Refund Policy",
    content:
      "# Refund Policy\n\n- Full refund if the organizer cancels the event.\n- No refund for no-shows.\n- Postponed events: tickets remain valid for the new date.",
    version: 1,
    isPublished: true,
    updatedAt: new Date().toISOString(),
  },
  {
    slug: "cancellation",
    title: "Cancellation Policy",
    content:
      "# Cancellation Policy\n\n- Organizers may cancel events with full refund to attendees.\n- Cancellation charges apply to organizers as per platform settings.\n- Door staff charges are non-refundable once paid.",
    version: 1,
    isPublished: true,
    updatedAt: new Date().toISOString(),
  },
];

function demoLegalPages(): LegalPage[] {
  const store = demoStore();
  if (!store.legalPages) {
    store.legalPages = DEMO_PAGES.map((p) => ({ ...p }));
  }
  return store.legalPages;
}

export async function listLegalPages(): Promise<LegalPage[]> {
  if (!isSupabaseConfigured()) {
    return demoLegalPages();
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("legal_pages")
    .select("*")
    .order("slug", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    slug: row.slug,
    title: row.title,
    content: row.content,
    version: row.version,
    isPublished: row.is_published,
    updatedAt: row.updated_at,
  }));
}

export async function getLegalPage(slug: string): Promise<LegalPage | null> {
  if (!isSupabaseConfigured()) {
    return demoLegalPages().find((p) => p.slug === slug) ?? null;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("legal_pages")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  return {
    slug: data.slug,
    title: data.title,
    content: data.content,
    version: data.version,
    isPublished: data.is_published,
    updatedAt: data.updated_at,
  };
}

export async function upsertLegalPage(
  userId: string,
  slug: string,
  title: string,
  content: string,
  isPublished: boolean,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    const pages = demoLegalPages();
    const existing = pages.find((p) => p.slug === slug);
    if (existing) {
      existing.title = title;
      existing.content = content;
      existing.isPublished = isPublished;
      existing.version += 1;
      existing.updatedAt = new Date().toISOString();
    } else {
      pages.push({
        slug,
        title,
        content,
        version: 1,
        isPublished,
        updatedAt: new Date().toISOString(),
      });
    }
    return;
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("legal_pages")
    .upsert({
      slug,
      title,
      content,
      is_published: isPublished,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    });
  if (error) throw error;
}
