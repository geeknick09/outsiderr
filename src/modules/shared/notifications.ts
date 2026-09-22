import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./db/database.types";
import { createClient } from "./auth/server";
import { logger } from "./lib/logger";

/**
 * Channel-aware notification abstraction.
 *
 * Business code calls sendNotification()/sendNotifications() — it does NOT
 * insert into event_notifications directly. Channels:
 *   - "in-app"   → event_notifications row (the bell) — implemented
 *   - "push"     → push_subscriptions + provider send — scaffolded, needs a
 *                  provider (Expo Push / FCM / web-push) before it delivers
 *   - "email"    → provider adapter stub (Resend/SES — not configured yet)
 *   - "whatsapp" → provider adapter stub (not configured yet)
 *
 * Adding native push for the React Native apps = implementing the push adapter
 * here; call sites don't change.
 *
 * Notifications are best-effort by design: failures are logged, never thrown —
 * a notification must not break the primary transaction (booking, KYC, etc.).
 */

export type NotificationChannel = "in-app" | "push" | "email" | "whatsapp";

export interface SendNotificationInput {
  /** Recipient auth.users id. */
  userId: string;
  /** event_notification_type enum value (e.g. "WAITLIST_OFFER", "KYC_APPROVED"). */
  type: string;
  /** Human-readable body shown in the bell / push / message. */
  message: string;
  /** Related event, if any. */
  eventId?: string | null;
  /** Delivery channels — defaults to ["in-app"]. */
  channels?: NotificationChannel[];
}

type Client = SupabaseClient<Database>;

async function resolveClient(client?: Client): Promise<Client> {
  return client ?? ((await createClient()) as Client);
}

/** In-app channel: event_notifications insert (the bell). */
async function deliverInApp(
  supabase: Client,
  rows: { user_id: string; type: string; message: string; event_id: string | null }[],
): Promise<void> {
  const { error } = await supabase
    .from("event_notifications")
    .insert(rows as never);
  if (error) logger.warn({ error: error.message }, "notifications: in-app insert failed");
}

/** Push channel scaffold — resolves subscriptions; provider send is a TODO. */
async function deliverPush(
  supabase: Client,
  input: SendNotificationInput,
): Promise<void> {
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint")
    .eq("user_id", input.userId);

  if (error) {
    logger.warn({ error: error.message }, "notifications: push subscription lookup failed");
    return;
  }
  if (!subs?.length) return;

  // TODO(mobile): send via web-push now / Expo Push + FCM when the native apps
  // land. The subscription rows already exist; only the provider call is missing.
  logger.debug(
    { userId: input.userId, subscriptions: subs.length, type: input.type },
    "notifications: push delivery not configured (subscriptions exist)",
  );
}

/** Email/WhatsApp stubs — provider adapters land with the messaging work. */
async function deliverExternal(channel: "email" | "whatsapp", input: SendNotificationInput): Promise<void> {
  logger.debug({ userId: input.userId, type: input.type }, `notifications: ${channel} delivery not configured`);
}

/** Send one notification to one user across the requested channels. */
export async function sendNotification(
  input: SendNotificationInput,
  client?: Client,
): Promise<void> {
  const channels = input.channels ?? ["in-app"];
  try {
    const supabase = await resolveClient(client);
    await Promise.all(
      channels.map((channel) => {
        switch (channel) {
          case "in-app":
            return deliverInApp(supabase, [
              { user_id: input.userId, type: input.type, message: input.message, event_id: input.eventId ?? null },
            ]);
          case "push":
            return deliverPush(supabase, input);
          default:
            return deliverExternal(channel, input);
        }
      }),
    );
  } catch (error) {
    logger.warn({ error: String(error), type: input.type }, "notifications: send failed");
  }
}

/**
 * Batch-send: fans one logical notification out to many users.
 * In-app rows are inserted in a single statement; push/email/whatsapp are
 * delivered per-recipient.
 */
export async function sendNotifications(
  inputs: SendNotificationInput[],
  client?: Client,
): Promise<void> {
  if (inputs.length === 0) return;
  try {
    const supabase = await resolveClient(client);

    const inAppRows = inputs
      .filter((i) => (i.channels ?? ["in-app"]).includes("in-app"))
      .map((i) => ({ user_id: i.userId, type: i.type, message: i.message, event_id: i.eventId ?? null }));
    const otherChannelInputs = inputs.filter((i) =>
      (i.channels ?? ["in-app"]).some((c) => c !== "in-app"),
    );

    const tasks: Promise<void>[] = [];
    if (inAppRows.length > 0) tasks.push(deliverInApp(supabase, inAppRows));
    for (const input of otherChannelInputs) {
      for (const channel of input.channels ?? []) {
        if (channel === "in-app") continue;
        tasks.push(channel === "push" ? deliverPush(supabase, input) : deliverExternal(channel, input));
      }
    }
    await Promise.all(tasks);
  } catch (error) {
    logger.warn({ error: String(error) }, "notifications: batch send failed");
  }
}
