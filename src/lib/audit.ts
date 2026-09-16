import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

/**
 * Audit logging for important financial and administrative actions.
 *
 * Uses the existing `admin_change_log` table to record:
 * - Who performed the action (admin_id)
 * - What table/entity was affected
 * - What field changed, from what value, to what value
 * - Why the change was made (optional reason)
 *
 * This is a best-effort log — failures are logged but do not block the action.
 * The caller should not wait on or depend on the audit log succeeding.
 */

export interface AuditEntry {
  adminId: string;
  tableName: string;
  entityId?: string | null;
  fieldName: string;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
}

/**
 * Record an audit entry. Best-effort — errors are logged but not thrown.
 * Uses the service-role client so it works in server actions and webhooks
 * regardless of the current user's RLS permissions.
 */
export async function auditLog(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("admin_change_log").insert({
      admin_id: entry.adminId,
      table_name: entry.tableName,
      entity_id: entry.entityId ?? null,
      field_name: entry.fieldName,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      reason: entry.reason ?? null,
    });

    if (error) {
      logger.error(
        { error: error.message, tableName: entry.tableName, entityId: entry.entityId },
        "audit log insert failed",
      );
    }
  } catch (e) {
    logger.error(
      { error: e instanceof Error ? e.message : String(e), tableName: entry.tableName },
      "audit log exception",
    );
  }
}

/**
 * Record a financial action (order approval, rejection, refund, payout).
 * Stores the action type in `field_name` and relevant details in `new_value`.
 */
export async function auditFinancialAction(
  adminId: string,
  action: string,
  orderId: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await auditLog({
    adminId,
    tableName: "orders",
    entityId: orderId,
    fieldName: action,
    newValue: JSON.stringify(details),
  });
}

/**
 * Record an event lifecycle change (publish, cancel, postpone, delete).
 */
export async function auditEventAction(
  adminId: string,
  action: string,
  eventId: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await auditLog({
    adminId,
    tableName: "events",
    entityId: eventId,
    fieldName: action,
    newValue: JSON.stringify(details),
  });
}
