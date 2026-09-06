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

  // Check ticket_tiers columns
  const { rows: cols } = await dbClient.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'ticket_tiers' ORDER BY ordinal_position
  `);
  console.log("ticket_tiers columns:");
  for (const c of cols) console.log(`  ${c.column_name}: ${c.data_type}`);

  // Check the actual data for the "Test phased" event
  const { rows: tiers } = await dbClient.query(`
    SELECT id, name, tier_type, quantity, quantity_sold, phase_order, phase_opens_at, phase_closes_at
    FROM public.ticket_tiers
    WHERE event_id = '0032d880-6f4d-40dd-8589-da24c35755bb'
    ORDER BY phase_order
  `);
  console.log("\nTest phased event tiers:");
  for (const t of tiers) {
    console.log(`  ${t.name} | type=${t.tier_type} | qty=${t.quantity} | sold=${t.quantity_sold} | order=${t.phase_order} | opens=${t.phase_opens_at} | closes=${t.phase_closes_at}`);
  }

  // Check current time
  const { rows: now } = await dbClient.query("SELECT now() as now");
  console.log("\nDB current time:", now[0].now);

  await dbClient.end();
})();
