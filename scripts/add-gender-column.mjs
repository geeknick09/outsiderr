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
  console.log("Adding gender column to profiles...");
  await dbClient.query(`alter table public.profiles add column if not exists gender text check (gender in ('male','female','non-binary','other'))`);
  console.log("Done. Verifying:");
  const { rows } = await dbClient.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'gender'`);
  console.log(rows);
  await dbClient.end();
})();
