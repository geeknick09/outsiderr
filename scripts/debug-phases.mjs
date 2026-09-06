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

  // Check ALL phased events and their tiers
  const { rows: events } = await dbClient.query(`
    SELECT e.id, e.title, e.starts_at
    FROM public.events e
    WHERE EXISTS (SELECT 1 FROM public.ticket_tiers t WHERE t.event_id = e.id AND t.tier_type = 'FLAT_PHASE')
    ORDER BY e.created_at DESC
  `);

  const { rows: nowRow } = await dbClient.query("SELECT now() as now");
  console.log("Current DB time:", nowRow[0].now);
  console.log("");

  for (const e of events) {
    console.log(`Event: ${e.title} (${e.id})`);
    console.log(`  starts_at: ${e.starts_at}`);

    const { rows: tiers } = await dbClient.query(`
      SELECT id, name, tier_type, quantity, quantity_sold, phase_order, phase_opens_at, phase_closes_at
      FROM public.ticket_tiers
      WHERE event_id = $1
      ORDER BY phase_order, sort_order
    `, [e.id]);

    for (const t of tiers) {
      const opens = t.phase_opens_at ? new Date(t.phase_opens_at).getTime() : null;
      const closes = t.phase_closes_at ? new Date(t.phase_closes_at).getTime() : null;
      const now = Date.now();
      let state = "UNKNOWN";
      if (opens && now < opens) state = "UPCOMING";
      else if (closes && now >= closes) state = "CLOSED";
      else if (opens && now >= opens && (!closes || now < closes)) state = "ACTIVE";
      else if (!opens) state = "NO_OPEN_DATE";

      console.log(`  ${t.name} | type=${t.tier_type} | qty=${t.quantity} | sold=${t.quantity_sold} | order=${t.phase_order} | opens=${t.phase_opens_at} | closes=${t.phase_closes_at} | STATE=${state}`);
    }
    console.log("");
  }

  await dbClient.end();
})();
