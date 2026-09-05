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
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'organizers' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log("organizers table columns:");
  for (const row of rows) {
    console.log(`  ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
  }
  await client.end();
}

main().catch(console.error);
