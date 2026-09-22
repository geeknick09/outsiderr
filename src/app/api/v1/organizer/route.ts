import { z } from "zod";
import { revalidatePath } from "next/cache";

import { apiError, apiOk, createOrganizerProfile, readJson, updateOrganizerProfile, withApiUser } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2, "Organizer name is required.").max(100),
  bio: z.string().max(2000).default(""),
  description: z.string().max(5000).optional(),
  organizerIntent: z.string().max(1000).optional(),
  upiId: z.string().min(3, "UPI ID is required.").max(100),
  avatarUrl: z.string().url().optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
  instagramUrl: z.string().optional().nullable(),
  youtubeUrl: z.string().optional().nullable(),
  xUrl: z.string().optional().nullable(),
  facebookUrl: z.string().optional().nullable(),
  linkedinUrl: z.string().optional().nullable(),
  panNumber: z.string().max(20).default(""),
  panName: z.string().max(200).default(""),
  panDocumentUrl: z.string().url().optional().nullable(),
  gstNumber: z.string().max(20).default(""),
  gstBusinessName: z.string().max(200).default(""),
  bankAccountNumber: z.string().max(30).default(""),
  bankIfsc: z.string().max(15).default(""),
  bankAccountName: z.string().max(200).default(""),
  bankAccountType: z.string().max(20).default("SAVINGS"),
  bankDocumentUrl: z.string().url().optional().nullable(),
  agreedToTerms: z.boolean().refine((v) => v === true, "You must accept the organizer terms."),
});

const updateSchema = createSchema.partial().omit({ agreedToTerms: true });

/**
 * POST /api/v1/organizer — create an organizer profile (KYC submission).
 * Documents (panDocumentUrl, bankDocumentUrl) are uploaded to storage first;
 * this route accepts their public URLs.
 * Auth: Bearer <supabase-access-token>
 */
export async function POST(request: Request) {
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, createSchema);
    if ("response" in parsed) return parsed.response;

    try {
      const organizerId = await createOrganizerProfile(user, {
        ...parsed.data,
        avatarUrl: parsed.data.avatarUrl ?? null,
        coverUrl: parsed.data.coverUrl ?? null,
        instagramUrl: parsed.data.instagramUrl ?? null,
        youtubeUrl: parsed.data.youtubeUrl ?? null,
        xUrl: parsed.data.xUrl ?? null,
        facebookUrl: parsed.data.facebookUrl ?? null,
        linkedinUrl: parsed.data.linkedinUrl ?? null,
        panDocumentUrl: parsed.data.panDocumentUrl ?? null,
        bankDocumentUrl: parsed.data.bankDocumentUrl ?? null,
      });
      revalidatePath("/organizer");
      return apiOk({ organizerId });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not create organizer profile.", 400);
    }
  });
}

/**
 * PATCH /api/v1/organizer — update organizer profile/KYC details.
 * Auth: Bearer <supabase-access-token>
 */
export async function PATCH(request: Request) {
  return withApiUser(request, async (user) => {
    const parsed = await readJson(request, updateSchema);
    if ("response" in parsed) return parsed.response;

    try {
      await updateOrganizerProfile(user, {
        name: parsed.data.name ?? "",
        bio: parsed.data.bio ?? "",
        description: parsed.data.description,
        organizerIntent: parsed.data.organizerIntent,
        upiId: parsed.data.upiId ?? "",
        avatarUrl: parsed.data.avatarUrl ?? null,
        coverUrl: parsed.data.coverUrl ?? null,
        instagramUrl: parsed.data.instagramUrl ?? null,
        youtubeUrl: parsed.data.youtubeUrl ?? null,
        xUrl: parsed.data.xUrl ?? null,
        facebookUrl: parsed.data.facebookUrl ?? null,
        linkedinUrl: parsed.data.linkedinUrl ?? null,
        panNumber: parsed.data.panNumber,
        panName: parsed.data.panName,
        panDocumentUrl: parsed.data.panDocumentUrl ?? null,
        gstNumber: parsed.data.gstNumber,
        gstBusinessName: parsed.data.gstBusinessName,
        bankAccountNumber: parsed.data.bankAccountNumber,
        bankIfsc: parsed.data.bankIfsc,
        bankAccountName: parsed.data.bankAccountName,
        bankAccountType: parsed.data.bankAccountType,
        bankDocumentUrl: parsed.data.bankDocumentUrl ?? null,
      });
      revalidatePath("/organizer");
      return apiOk({ updated: true });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not update organizer profile.", 400);
    }
  });
}
