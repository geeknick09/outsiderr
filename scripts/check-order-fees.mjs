import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");
const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();

const dbClient = new pg.Client({
  connectionString: `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await dbClient.connect();
  // Check recent confirmed orders with their fee snapshots
  const { rows } = await dbClient.query(`
    SELECT o.id, o.status, o.commission_paise, o.convenience_fee_paise, o.organizer_payout_paise,
           o.subtotal_paise, o.total_paise, o.created_at,
           e.title, e.commission_bps, e.commission_enabled, e.convenience_fee_bps, e.convenience_fee_enabled
    FROM public.orders o
    JOIN public.events e ON e.id = o.event_id
    ORDER BY o.created_at DESC
    LIMIT 10
  `);
  for (const r of rows) {
    console.log(`Order ${r.id.substring(0,8)} | status=${r.status} | sub=${r.subtotal_paise} total=${r.total_paise} comm=${r.commission_paise} conv=${r.convenience_fee_paise} payout=${r.organizer_payout_paise} | event="${r.title}" comm_bps=${r.commission_bps} comm_en=${r.commission_enabled} conv_bps=${r.convenience_fee_bps} conv_en=${r.convenience_fee_enabled}`);
  }
  await dbClient.end();
}
main().catch(console.error);
