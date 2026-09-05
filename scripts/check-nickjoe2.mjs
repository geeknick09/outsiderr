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

  // Find nickjoe user via auth.users
  const { rows: users } = await client.query(`
    SELECT au.id, au.email, p.is_organizer, p.is_admin
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE au.email = 'nickjoe@gmail.com'
  `);
  console.log("nickjoe user:", JSON.stringify(users, null, 2));

  if (users.length > 0) {
    const userId = users[0].id;
    const { rows: orgs } = await client.query(`
      SELECT id, name, owner_id FROM public.organizers WHERE owner_id = $1
    `, [userId]);
    console.log("\nnickjoe organizer profile:", JSON.stringify(orgs, null, 2));
  }

  await client.end();
}

main().catch(console.error);
