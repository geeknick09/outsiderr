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
  const { rows } = await dbClient.query(
    "SELECT email, id FROM auth.users WHERE email IN ('official.outsiderr@gmail.com','org1@gmail.com','user1@gmail.com','admin@gmail.com') ORDER BY email"
  );
  console.log("Users found:");
  for (const r of rows) console.log(`  ${r.email} -> ${r.id}`);

  // Check profiles
  const { rows: profiles } = await dbClient.query(
    "SELECT p.id, p.is_admin, p.is_organizer, u.email FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE u.email IN ('official.outsiderr@gmail.com','org1@gmail.com','user1@gmail.com','admin@gmail.com')"
  );
  console.log("\nProfiles:");
  for (const p of profiles) console.log(`  ${p.email} admin=${p.is_admin} org=${p.is_organizer}`);

  // Check organizers
  const { rows: orgs } = await dbClient.query(
    "SELECT o.id, o.name, o.owner_id, u.email FROM public.organizers o JOIN auth.users u ON u.id = o.owner_id WHERE u.email IN ('official.outsiderr@gmail.com','org1@gmail.com','user1@gmail.com','admin@gmail.com')"
  );
  console.log("\nOrganizers:");
  for (const o of orgs) console.log(`  ${o.email} -> ${o.name} (${o.id})`);

  await dbClient.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
