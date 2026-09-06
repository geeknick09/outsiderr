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

  // Check the check_in_ticket RPC definition
  const { rows } = await dbClient.query(`
    SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'check_in_ticket'
  `);
  console.log("check_in_ticket RPC definition:");
  console.log(rows[0]?.def?.substring(0, 500));

  // Check is_event_staff
  const { rows: staffRows } = await dbClient.query(`
    SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'is_event_staff'
  `);
  console.log("\nis_event_staff RPC definition:");
  console.log(staffRows[0]?.def?.substring(0, 300));

  // Check is_current_user_admin
  const { rows: adminRows } = await dbClient.query(`
    SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'is_current_user_admin'
  `);
  console.log("\nis_current_user_admin RPC definition:");
  console.log(adminRows[0]?.def?.substring(0, 300));

  await dbClient.end();
})();
