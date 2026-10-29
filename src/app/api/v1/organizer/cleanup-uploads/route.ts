import { NextResponse } from "next/server";

import { createClient, createServiceClient } from "@/modules/shared/server";
import { STORAGE_BUCKET } from "@/modules/shared/auth/config";

const MARKER = `/object/public/${STORAGE_BUCKET}/`;
// Subtrees under a user's own folder that abandoned-upload cleanup may touch.
const ALLOWED_SUBTREES = ["/profile/", "/organizer/kyc/", "/organizer/avatar/", "/organizer/events/", "/communities/"];

function pathFromUrl(url: string): string | null {
  const i = url.indexOf(MARKER);
  if (i < 0) return null;
  const path = url.slice(i + MARKER.length);
  return path.length ? decodeURIComponent(path) : null;
}

/**
 * POST { urls: string[] } - deletes session-uploaded media the user abandoned
 * mid-wizard. Auth required; only organizer-KYC folders and avatar/profile
 * uploads are eligible - arbitrary bucket objects can't be deleted through
 * this endpoint.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let urls: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.urls)) urls = body.urls.slice(0, 30);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const paths = urls
    .map(pathFromUrl)
    .filter((p): p is string => !!p)
    .filter(
      (p) =>
        p.startsWith(`users/${user.id}/`) &&
        ALLOWED_SUBTREES.some((sub) => p.includes(sub)),
    );

  if (paths.length) {
    const service = createServiceClient();
    await service.storage.from(STORAGE_BUCKET).remove(paths);
  }
  return NextResponse.json({ ok: true, removed: paths.length });
}
