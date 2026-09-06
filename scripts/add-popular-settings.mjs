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
  await dbClient.query(`insert into public.platform_settings (key, value, description) values ('max_popular_per_city', '4', 'Max popular events shown per city on homepage') on conflict (key) do nothing`);
  await dbClient.query(`insert into public.platform_settings (key, value, description) values ('max_sponsored_per_city', '4', 'Max sponsored/featured events shown per city on homepage') on conflict (key) do nothing`);
  console.log("done");
  await dbClient.end();
})();
