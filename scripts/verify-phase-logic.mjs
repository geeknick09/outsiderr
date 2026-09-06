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

(async () => {
  await dbClient.connect();

  const eventId = "3985a285-aea9-4c0f-849d-b5b919d103d5";

  const { rows: tiers } = await dbClient.query(`
    SELECT id, name, tier_type, quantity, quantity_sold, phase_order, phase_opens_at, phase_closes_at
    FROM public.ticket_tiers
    WHERE event_id = $1
    ORDER BY phase_order, sort_order
  `, [eventId]);

  const now = Date.now();
  console.log("Current time (ms):", now);
  console.log("");

  for (const t of tiers) {
    const opensMs = t.phase_opens_at ? new Date(t.phase_opens_at).getTime() : null;
    const closesMs = t.phase_closes_at ? new Date(t.phase_closes_at).getTime() : null;

    // Replicate the computePhaseAvailability logic
    const isUpcoming = opensMs !== null && now < opensMs;
    const hasOpened = opensMs === null || now >= opensMs;
    const hasNotClosed = closesMs === null || now < closesMs;
    const effectiveAvailable = t.quantity - t.quantity_sold;
    const isSoldOut = effectiveAvailable <= 0;
    const isActive = hasOpened && hasNotClosed && !isSoldOut;

    console.log(`Tier: ${t.name}`);
    console.log(`  tier_type: ${t.tier_type}`);
    console.log(`  phase_opens_at: ${t.phase_opens_at} (ms: ${opensMs})`);
    console.log(`  phase_closes_at: ${t.phase_closes_at} (ms: ${closesMs})`);
    console.log(`  quantity: ${t.quantity}, sold: ${t.quantity_sold}`);
    console.log(`  isUpcoming: ${isUpcoming}`);
    console.log(`  hasOpened: ${hasOpened}`);
    console.log(`  hasNotClosed: ${hasNotClosed}`);
    console.log(`  isSoldOut: ${isSoldOut}`);
    console.log(`  isActive: ${isActive}`);
    console.log("");
  }

  await dbClient.end();
})();
