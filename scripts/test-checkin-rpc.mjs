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
  
  // Get a valid ticket
  const { rows: tickets } = await dbClient.query(`
    SELECT t.id, t.qr_hash, t.status, t.event_id, e.title
    FROM public.tickets t
    JOIN public.events e ON e.id = t.event_id
    WHERE t.status = 'VALID'
    ORDER BY t.created_at DESC LIMIT 1
  `);
  
  if (tickets.length === 0) {
    console.log("No VALID tickets found");
    await dbClient.end();
    return;
  }
  
  const ticket = tickets[0];
  console.log(`Testing with ticket: ${ticket.title} | status=${ticket.status} | hash=${ticket.qr_hash?.substring(0, 20)}...`);
  
  // Try calling the RPC directly (won't work without auth context, but let's see the error)
  try {
    const { data, error } = await dbClient.query(`
      SELECT * FROM public.check_in_ticket($1, $2)
    `, [ticket.qr_hash, ticket.event_id]);
    
    if (error) {
      console.log("RPC error:", error.message);
    } else {
      console.log("RPC result:", data.rows[0]);
    }
  } catch (e) {
    console.log("RPC call failed:", e.message);
  }
  
  // Check ticket status after
  const { rows: after } = await dbClient.query("SELECT status FROM public.tickets WHERE id = $1", [ticket.id]);
  console.log(`Ticket status after RPC: ${after[0]?.status}`);
  
  await dbClient.end();
}
main().catch(console.error);
