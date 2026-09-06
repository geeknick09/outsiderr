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
  
  // Check is_event_staff function
  const { rows: funcs } = await dbClient.query(`
    SELECT p.proname, pg_get_functiondef(p.oid) as def
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'is_event_staff'
  `);
  if (funcs.length > 0) {
    console.log("is_event_staff exists:");
    console.log(funcs[0].def.substring(0, 500));
  } else {
    console.log("❌ is_event_staff NOT FOUND");
  }

  // Check the check_in_ticket with 2 params - get its body
  const { rows: rpcs } = await dbClient.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'check_in_ticket'
    AND pg_get_function_arguments(p.oid) = 'p_qr_hash text, p_event_id uuid'
  `);
  if (rpcs.length > 0) {
    console.log("\ncheck_in_ticket(p_qr_hash text, p_event_id uuid) body:");
    console.log(rpcs[0].def.substring(0, 1000));
  } else {
    console.log("\n❌ check_in_ticket with event_id NOT FOUND");
  }

  await dbClient.end();
}
main().catch(console.error);
