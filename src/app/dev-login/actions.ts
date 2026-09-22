"use server";

import { createServiceClient } from "@/modules/shared/server";

const DEV_PASSWORD = "DevTest#1234";

const DEV_USERS: Record<string, { email: string; name: string; admin: boolean; organizer: boolean }> = {
  user: { email: "dev.user@outsiderr.test", name: "Dev User", admin: false, organizer: false },
  user2: { email: "dev.user2@outsiderr.test", name: "Dev User Two", admin: false, organizer: false },
  organizer: { email: "dev.organizer@outsiderr.test", name: "Dev Organizer", admin: false, organizer: true },
  admin: { email: "dev.admin@outsiderr.test", name: "Dev Admin", admin: true, organizer: false },
};

/**
 * DEV-ONLY: ensure a seeded test user exists and return credentials the
 * client uses for a real `signInWithPassword` session. Hard-disabled in
 * production builds.
 */
export async function devLoginAction(
  role: keyof typeof DEV_USERS,
): Promise<{ email?: string; password?: string; error?: string }> {
  if (process.env.NODE_ENV === "production") {
    return { error: "Not available in production." };
  }
  const spec = DEV_USERS[role];
  if (!spec) return { error: "Unknown role." };

  try {
    const admin = createServiceClient();
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = list?.users?.find((u) => u.email === spec.email);
    if (existing) {
      await admin.auth.admin.updateUserById(existing.id, { password: DEV_PASSWORD, email_confirm: true });
    } else {
      const { error } = await admin.auth.admin.createUser({
        email: spec.email,
        password: DEV_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: spec.name },
      });
      if (error) return { error: error.message };
    }
    return { email: spec.email, password: DEV_PASSWORD };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Dev login failed." };
  }
}
