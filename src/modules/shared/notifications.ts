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
 *   - "push"     → notification_outbox row → drained by /api/cron/drain-notifications
 *                  to the provider (Expo Push / FCM — adapter lands with M3)
 *   - "email"    → notification_outbox row → provider adapter pending
 *   - "whatsapp" → notification_outbox row → provider adapter pending
 *
 * The outbox makes external delivery crash-safe: the row is written durably
 * and a cron drainer retries with backoff. Rows expire after 24h so enabling
 * a provider later doesn't blast stale notifications.
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

/** In-app channel: event_notifications insert (the bell).
 * Uses the service client — sendNotification is a trusted server-side
 * abstraction (callers authorize before calling), and the insert policy only
 * allows the event organizer; cross-user notifications (e.g. invitee →
 * inviter) would otherwise be silently dropped. */
async function deliverInApp(
  supabase: Client,
  rows: { user_id: string; type: string; message: string; event_id: string | null }[],
): Promise<void> {
  void supabase;
  const { createServiceClient } = await import("./auth/service");
  const { error } = await createServiceClient()
    .from("event_notifications")
    .insert(rows as never);
  if (error) logger.warn({ error: error.message }, "notifications: in-app insert failed");
}

/** External channels: enqueue a durable outbox row; the drain cron delivers.
 * Uses the service client — the outbox is service-role only. */
async function enqueueOutbox(
  input: SendNotificationInput,
  channel: "push" | "email" | "whatsapp",
): Promise<void> {
  const { createServiceClient } = await import("./auth/service");
  const { error } = await createServiceClient().rpc("enqueue_notification_outbox", {
    p_user_id: input.userId,
    p_event_id: input.eventId ?? null,
    p_type: input.type,
    p_title: null,
    p_message: input.message,
    p_channel: channel,
    p_payload: {},
  });
  if (error) logger.warn({ error: error.message, channel }, "notifications: outbox enqueue failed");
}

/** Send one notification to one user across the requested channels. */
export async function sendNotification(
  input: SendNotificationInput,
  client?: Client,
): Promise<void> {
  // Some order types (walk-in / box-office) have no buyer account — nothing to notify.
  if (!input.userId) return;
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
          default:
            return enqueueOutbox(input, channel);
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
  // Drop rows without a recipient (walk-in/box-office orders have no user_id).
  inputs = inputs.filter((i) => i.userId);
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
        tasks.push(enqueueOutbox(input, channel));
      }
    }
    await Promise.all(tasks);
  } catch (error) {
    logger.warn({ error: String(error) }, "notifications: batch send failed");
  }
}

/**
 * Notify every admin user (in-app bell). Used for pending-review queues:
 * KYC submissions, boost requests, door-staff payments. Best-effort.
 */
export async function notifyAdmins(
  input: Omit<SendNotificationInput, "userId">,
): Promise<void> {
  try {
    const { createServiceClient } = await import("./auth/service");
    const service = createServiceClient();
    const { data: admins } = await service
      .from("profiles")
      .select("id")
      .eq("is_admin", true);
    if (!admins?.length) return;
    await sendNotifications(
      admins.map((a) => ({ ...input, userId: a.id })),
      service as unknown as Client,
    );
  } catch (error) {
    logger.warn({ error: String(error), type: input.type }, "notifications: admin notify failed");
  }
}
