"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { createEvent, type TicketTierInput } from "@/lib/data/organizer";
import type { City, EventCategory, FeePayer } from "@/lib/types";

export interface CreateEventState {
  error: string | null;
}

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseTiers(formData: FormData): TicketTierInput[] {
  const names = formData.getAll("tierName").map(String);
  const prices = formData.getAll("tierPrice").map(String);
  const quantities = formData.getAll("tierQuantity").map(String);
  const perks = formData.getAll("tierPerks").map(String);

  return names
    .map((name, index) => ({
      name: name.trim(),
      pricePaise: Math.round(Number(prices[index] ?? 0) * 100),
      quantity: Number(quantities[index] ?? 0),
      perks: (perks[index] ?? "")
        .split(",")
        .map((perk) => perk.trim())
        .filter(Boolean),
    }))
    .filter((tier) => tier.name.length > 0);
}

export async function createEventAction(
  _prev: CreateEventState,
  formData: FormData,
): Promise<CreateEventState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  const title = String(formData.get("title") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "");
  const tiers = parseTiers(formData);

  if (!title) return { error: "Give the event a title." };
  if (!startsAt) return { error: "Pick a start date and time." };
  if (tiers.length === 0) return { error: "Add at least one ticket tier." };
  if (tiers.some((tier) => tier.quantity <= 0)) {
    return { error: "Every tier needs a quantity of at least 1." };
  }

  const endsAt = String(formData.get("endsAt") ?? "");
  const latitude = String(formData.get("latitude") ?? "").trim();
  const longitude = String(formData.get("longitude") ?? "").trim();

  let eventId: string;
  try {
    eventId = await createEvent(user, {
      title,
      description: String(formData.get("description") ?? "").trim(),
      thingsToKnow: lines(formData.get("thingsToKnow")),
      category: String(formData.get("category") ?? "GIG") as EventCategory,
      city: String(formData.get("city") ?? "KOLKATA") as City,
      venueName: String(formData.get("venueName") ?? "").trim(),
      venueAddress: String(formData.get("venueAddress") ?? "").trim(),
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      cardPosterUrl: String(formData.get("cardPosterUrl") ?? "") || null,
      bannerPosterUrl: String(formData.get("bannerPosterUrl") ?? "") || null,
      feePayer: String(formData.get("feePayer") ?? "BUYER") as FeePayer,
      needsDoorStaff: formData.get("needsDoorStaff") === "on",
      terms: lines(formData.get("terms")),
      tiers,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not publish the event.",
    };
  }

  revalidatePath("/");
  revalidatePath("/organizer");
  redirect(`/events/${eventId}`);
}
