import { createClient, createServiceClient } from "@/modules/shared/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = ["ledger", "payouts", "refunds", "orders"] as const;
type Kind = (typeof KINDS)[number];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** Flatten joined rows (events: {title} → event_title). */
function flat(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) out[`${k}_${sk}`] = sv;
    } else {
      out[k] = v;
    }
  }
  return out;
}

type TableName = "payment_ledger" | "payout_records" | "refunds" | "orders";

const SELECTS: Record<Kind, { table: TableName; select: string; dateCol: string }> = {
  ledger: {
    table: "payment_ledger",
    select:
      "id, type, order_id, event_id, organizer_id, gross_amount_paise, commission_paise, convenience_fee_paise, razorpay_fee_paise, refund_amount_paise, net_organizer_paise, net_platform_paise, razorpay_payment_id, razorpay_refund_id, notes, created_at, events(title), organizers(name)",
    dateCol: "created_at",
  },
  payouts: {
    table: "payout_records",
    select:
      "id, organizer_id, event_id, amount_paise, status, method, bank_reference, failure_reason, notes, initiated_at, completed_at, organizers(name), events(title)",
    dateCol: "initiated_at",
  },
  refunds: {
    table: "refunds",
    select:
      "id, order_id, event_id, user_id, amount_paise, platform_fee_paise, status, refund_scope, reason, initiated_at, completed_at, razorpay_refund_id, events(title), profiles(full_name)",
    dateCol: "initiated_at",
  },
  orders: {
    table: "orders",
    select:
      "id, event_id, user_id, tier_id, quantity, unit_price_paise, subtotal_paise, commission_paise, convenience_fee_paise, gateway_fee_paise, platform_fee_paise, organizer_payout_paise, total_paise, fee_payer, status, order_source, razorpay_payment_id, invoice_number, buyer_name, buyer_phone, created_at, confirmed_at, events(title)",
    dateCol: "created_at",
  },
};

/**
 * GET /api/admin/export/{ledger|payouts|refunds|orders}?from=&to=
 * CSV download. Admin session only — service client for cross-org rows.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  if (!KINDS.includes(kind as Kind)) return new Response("Unknown export.", { status: 404 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Sign in required.", { status: 401 });
  const { data: profile } = await supabase
    .from("profiles").select("is_admin").eq("id", auth.user.id).maybeSingle();
  if (profile?.is_admin !== true) return new Response("Forbidden.", { status: 403 });

  const cfg = SELECTS[kind as Kind];
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const service = createServiceClient();
  let query = service.from(cfg.table).select(cfg.select).order(cfg.dateCol, { ascending: true });
  if (from) query = query.gte(cfg.dateCol, `${from}T00:00:00Z`);
  if (to) query = query.lte(cfg.dateCol, `${to}T23:59:59Z`);

  const { data, error } = await query;
  if (error) return new Response(error.message, { status: 500 });

  const rows = ((data ?? []) as unknown[]).map((r) => flat(r as Record<string, unknown>));
  const csv = toCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="outsiderr-${kind}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}