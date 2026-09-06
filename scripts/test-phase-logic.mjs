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

  const { rows: events } = await dbClient.query(`
    SELECT e.id, e.title
    FROM public.events e
    WHERE EXISTS (SELECT 1 FROM public.ticket_tiers t WHERE t.event_id = e.id AND t.tier_type = 'FLAT_PHASE')
    ORDER BY e.created_at DESC
  `);

  const now = Date.now();
  console.log("Current time:", new Date().toISOString());
  console.log("");

  for (const e of events) {
    console.log(`Event: ${e.title}`);
    const { rows: tiers } = await dbClient.query(`
      SELECT id, name, quantity, quantity_sold, phase_order, phase_opens_at, phase_closes_at
      FROM public.ticket_tiers
      WHERE event_id = $1 AND tier_type = 'FLAT_PHASE'
      ORDER BY phase_order
    `, [e.id]);

    let prevPhaseEnded = true;
    let carryForward = 0;

    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      const opensAt = t.phase_opens_at ? new Date(t.phase_opens_at).getTime() : null;
      const nextOpensAt = tiers[i + 1]?.phase_opens_at ? new Date(tiers[i + 1].phase_opens_at).getTime() : null;
      const closesAt = t.phase_closes_at ? new Date(t.phase_closes_at).getTime() : nextOpensAt;

      const effectiveQuantity = t.quantity + carryForward;
      const effectiveAvailable = effectiveQuantity - t.quantity_sold;
      const isSoldOut = effectiveAvailable <= 0;
      const isTimeOver = closesAt !== null && now >= closesAt;
      const hasEnded = isSoldOut || isTimeOver;

      // NEW LOGIC: phase 1 opens at its own opensAt, phase N opens when previous ends
      const hasOpened = i === 0
        ? (opensAt === null || now >= opensAt)
        : prevPhaseEnded;

      const hasNotClosed = closesAt === null || now < closesAt;
      const isActive = hasOpened && hasNotClosed && !isSoldOut;

      let status;
      if (isActive) status = "ACTIVE";
      else if (isSoldOut) status = "SOLD_OUT";
      else if (isTimeOver) status = "CLOSED";
      else status = "UPCOMING";

      console.log(`  Phase ${i + 1}: ${t.name} | qty=${t.quantity} sold=${t.quantity_sold} effAvail=${Math.max(0, effectiveAvailable)} | hasOpened=${hasOpened} prevEnded=${prevPhaseEnded} | STATUS=${status}`);

      prevPhaseEnded = hasEnded;
      carryForward = Math.max(0, effectiveAvailable);
    }
    console.log("");
  }

  await dbClient.end();
})();
