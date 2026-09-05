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
  const { rows: users } = await client.query(`
    SELECT u.id, u.email, p.full_name, p.is_admin, p.is_organizer
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    ORDER BY u.created_at
  `);
  console.log("All users:");
  users.forEach(u => console.log(`  ${u.email} | admin=${u.is_admin} org=${u.is_organizer} | ${u.full_name}`));

  const { rows: clubs } = await client.query("SELECT id, name, verified, membership_type, member_count FROM public.clubs");
  console.log("\nAll clubs:");
  clubs.forEach(c => console.log(`  ${c.name} | verified=${c.verified} type=${c.membership_type} members=${c.member_count}`));

  const { rows: orgs } = await client.query("SELECT id, name, owner_id FROM public.organizers");
  console.log("\nAll organizers:");
  orgs.forEach(o => console.log(`  ${o.name} | owner=${o.owner_id}`));

  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
