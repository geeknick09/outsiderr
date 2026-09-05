import pg from "pg";
import { readFileSync } from "fs";
import { join } from "path";

const envPath = join(process.cwd(), ".env");
const envContent = readFileSync(envPath, "utf-8");
const envVars = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) envVars[match[1]] = match[2];
}

const dbPassword = encodeURIComponent(envVars.SUPABASE_DB_PASSWORD ?? "");
const client = new pg.Client({
  connectionString: `postgresql://postgres.nlhwnoqgrnbyprksthfi:${dbPassword}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
});

async function main() {
  await client.connect();
  // Delete the QA Test Organizer
  const { rowCount } = await client.query("DELETE FROM public.organizers WHERE name = 'QA Test Organizer'");
  console.log(`Deleted ${rowCount} organizer profile(s)`);

  // Reset is_organizer flag for nickjoe
  const { rows } = await client.query(`
    UPDATE public.profiles SET is_organizer = false
    WHERE id = (SELECT id FROM auth.users WHERE email = 'nickjoe@gmail.com')
    RETURNING id
  `);
  console.log("Reset is_organizer for:", rows);

  await client.end();
}

main().catch(console.error);
