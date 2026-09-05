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
  const { rows } = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'profiles' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log("profiles table columns:");
  for (const row of rows) {
    console.log(`  ${row.column_name} (${row.data_type})`);
  }

  // Check the test user (nickjoe@gmail.com) - their profile
  const { rows: users } = await client.query(`
    SELECT p.id, p.email, p.is_organizer, p.is_admin
    FROM public.profiles p
    WHERE p.email = 'nickjoe@gmail.com'
  `);
  console.log("\nnickjoe profile:", JSON.stringify(users, null, 2));

  // Check if nickjoe already has an organizer profile
  if (users.length > 0) {
    const { rows: orgs } = await client.query(`
      SELECT * FROM public.organizers WHERE owner_id = $1
    `, [users[0].id]);
    console.log("\nnickjoe organizer profile:", JSON.stringify(orgs, null, 2));
  }

  await client.end();
}

main().catch(console.error);
