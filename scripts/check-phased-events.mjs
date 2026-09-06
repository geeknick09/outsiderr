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

  // Find any event with phased tiers
  const { rows: phasedEvents } = await dbClient.query(`
    SELECT e.id, e.title, e.status, e.pricing_mode, e.starts_at, e.created_at
    FROM public.events e
    WHERE EXISTS (SELECT 1 FROM public.ticket_tiers t WHERE t.event_id = e.id AND t.tier_type = 'FLAT_PHASE')
    ORDER BY e.created_at DESC
    LIMIT 5
  `);
  console.log("Events with phased tiers:", phasedEvents.length);
  for (const e of phasedEvents) {
    console.log(`\nEvent: ${e.title} (${e.id})`);
    console.log(`  status=${e.status} pricing_mode=${e.pricing_mode} starts_at=${e.starts_at}`);

    const { rows: tiers } = await dbClient.query(`
      SELECT id, name, tier_type, price_paise, quantity, quantity_sold,
             phase_order, phase_opens_at, phase_closes_at, sort_order
      FROM public.ticket_tiers
      WHERE event_id = $1
      ORDER BY phase_order, sort_order
    `, [e.id]);

    for (const t of tiers) {
      console.log(`  Tier: ${t.name} | type=${t.tier_type} | price=${t.price_paise} | qty=${t.quantity} | sold=${t.quantity_sold} | phase_order=${t.phase_order} | opens=${t.phase_opens_at} | closes=${t.phase_closes_at}`);
    }
  }

  await dbClient.end();
})();
