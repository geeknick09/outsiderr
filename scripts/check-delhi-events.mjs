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

  // Get all Delhi events
  const { rows: delhiEvents } = await client.query(
    "SELECT id, title, status, organizer_id, city FROM public.events WHERE city = 'DELHI' ORDER BY created_at DESC LIMIT 10"
  );
  console.log("Delhi events:", JSON.stringify(delhiEvents, null, 2));

  // Check if organizers exist for these events
  if (delhiEvents.length > 0) {
    const organizerIds = delhiEvents.map((e) => e.organizer_id);
    const { rows: organizers } = await client.query(
      "SELECT id, name, owner_id FROM public.organizers WHERE id = ANY($1)",
      [organizerIds]
    );
    console.log("\nOrganizers for Delhi events:", JSON.stringify(organizers, null, 2));

    // Check for missing organizers
    const missingOrgs = organizerIds.filter((id) => !organizers.find((o) => o.id === id));
    if (missingOrgs.length > 0) {
      console.log("\nMISSING ORGANIZERS:", missingOrgs);
    }
  }

  // Get all events with their organizers
  const { rows: allEvents } = await client.query(
    "SELECT e.id, e.title, e.status, e.city, e.organizer_id, o.name as organizer_name FROM public.events e LEFT JOIN public.organizers o ON e.organizer_id = o.id ORDER BY e.created_at DESC LIMIT 20"
  );
  console.log("\nAll events with organizers:", JSON.stringify(allEvents, null, 2));

  await client.end();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
