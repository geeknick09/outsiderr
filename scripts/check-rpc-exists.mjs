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

  // Check if create_paid_order RPC exists
  const { rows: rpcCheck } = await dbClient.query(`
    SELECT proname, pronargs FROM pg_proc WHERE proname = 'create_paid_order'
  `);
  console.log("create_paid_order RPC:", rpcCheck);

  // Check if description column exists
  const { rows: colCheck } = await dbClient.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'organizers' AND column_name = 'description'
  `);
  console.log("organizers.description column:", colCheck);

  // Try calling the RPC directly
  const { rows: testCall, error: rpcError } = await dbClient.query(`
    SELECT * FROM public.create_paid_order(
      p_event_id := '00000000-0000-0000-0000-000000000000',
      p_tier_id := '00000000-0000-0000-0000-000000000000',
      p_quantity := 1,
      p_unit_price_paise := 30000,
      p_subtotal_paise := 30000,
      p_platform_fee_paise := 1500,
      p_total_paise := 31500,
      p_fee_payer := 'BUYER',
      p_utr_reference := '428193756201',
      p_payment_proof_url := null,
      p_buyer_name := 'Test',
      p_buyer_phone := '+919876543210',
      p_buyer_email := null,
      p_buyer_gender := null
    )
  `).catch(e => ({ rows: [], error: e }));
  console.log("RPC test call error:", rpcError?.message ?? "none");

  await dbClient.end();
})();
