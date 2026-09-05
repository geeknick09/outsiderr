import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");
const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();

const client = new pg.Client({
  connectionString: `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  const { rows: events } = await client.query("SELECT id, title FROM public.events");
  const { rows: clubs } = await client.query("SELECT id, name FROM public.clubs");

  const urls = [
    "/", "/organizer", "/admin", "/admin/events", "/admin/orders",
    "/admin/boosts", "/admin/clubs", "/admin/users", "/admin/settings",
    "/admin/legal", "/tickets", "/profile", "/clubs/create", "/login",
    "/organizer/scan",
  ];
  for (const e of events) urls.push(`/events/${e.id}`);
  for (const e of events) urls.push(`/organizer/events/${e.id}`);
  // Also pre-warm checkout pages for non-sold-out events
  const { rows: tiers } = await client.query("SELECT event_id, id FROM public.ticket_tiers");
  for (const t of tiers) urls.push(`/checkout?event=${t.event_id}&tier=${t.id}&qty=1`);
  for (const c of clubs) urls.push(`/clubs/${c.id}`);

  for (const u of urls) {
    try {
      const res = await fetch(`http://localhost:3000${u}`, { signal: AbortSignal.timeout(120000) });
      console.log(`${u} => ${res.status}`);
    } catch (e) {
      console.log(`${u} => FAIL: ${e.message}`);
    }
  }
  console.log("Pre-warm complete");
  await client.end();
}
main().catch(console.error);
