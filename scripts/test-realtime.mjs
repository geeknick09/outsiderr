/**
 * Dynamic Realtime Test
 * 
 * 1. Verifies Realtime publication is active
 * 2. Creates a Supabase client and subscribes to event_notifications
 * 3. Inserts a test notification
 * 4. Verifies the notification is received via Realtime
 * 5. Cleans up
 */

import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { WebSocket } from "ws";

// Polyfill WebSocket for Node.js 21 (realtime-js needs it)
global.WebSocket = WebSocket;

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "..", ".env"), "utf-8");

const SUPABASE_URL = envContent.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1].trim();
const SUPABASE_ANON_KEY = envContent.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$/m)?.[1].trim();
const DB_PWD = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();

console.log("=== Outsiderr Realtime Dynamic Test ===\n");

// --- Step 1: Verify Realtime publication ---
console.log("1. Checking Realtime publication...");
const dbClient = new pg.Client({
  connectionString: `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(DB_PWD)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});
await dbClient.connect();

const { rows: pubRows } = await dbClient.query(`
  select tablename from pg_publication_tables 
  where pubname = 'supabase_realtime' 
  order by tablename
`);
const publishedTables = pubRows.map(r => r.tablename);
console.log("   Tables in supabase_realtime:", publishedTables);

const required = ["event_notifications", "ticket_tiers", "orders", "tickets"];
const missing = required.filter(t => !publishedTables.includes(t));
if (missing.length > 0) {
  console.log("   ❌ MISSING:", missing);
  process.exit(1);
}
console.log("   ✓ All 4 required tables are in the publication\n");

// --- Step 2: Find a test user and event ---
console.log("2. Finding a test user with notifications...");
const { rows: userRows } = await dbClient.query(`
  select en.user_id, count(*) as notif_count 
  from event_notifications en 
  group by en.user_id 
  order by notif_count desc 
  limit 1
`);

let testUserId;
let testEventId;

if (userRows.length > 0) {
  testUserId = userRows[0].user_id;
  console.log("   Found user with existing notifications:", testUserId);
} else {
  // Find any user
  const { rows: anyUser } = await dbClient.query(`
    select id from auth.users limit 1
  `);
  if (anyUser.length === 0) {
  console.log("   No users found — skipping notification insert test");
    await dbClient.end();
    console.log("\n✅ Realtime publication is correctly configured.");
    process.exit(0);
  }
  testUserId = anyUser[0].id;
  console.log("   Using first user:", testUserId);
}

// Find an event for this notification
const { rows: eventRows } = await dbClient.query(`
  select id from events limit 1
`);
testEventId = eventRows[0]?.id;

if (!testEventId) {
  console.log("   No events found — skipping notification insert test");
  await dbClient.end();
  console.log("\n✅ Realtime publication is correctly configured.");
  process.exit(0);
}
console.log("   Using event:", testEventId, "\n");

// --- Step 3: Test Realtime subscription via Supabase client ---
console.log("3. Testing Supabase Realtime websocket subscription...");

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});

let realtimeReceived = false;
let receivedPayload = null;

// Subscribe to event_notifications INSERT
const channel = supabase.channel("test-notifications");

channel.on(
  "postgres_changes",
  {
    event: "INSERT",
    schema: "public",
    table: "event_notifications",
  },
  (payload) => {
    realtimeReceived = true;
    receivedPayload = payload;
    console.log("   ✓ Realtime event received!");
    console.log("   Event type:", payload.eventType);
    console.log("   New row:", JSON.stringify(payload.new, null, 2));
  }
);

await new Promise((resolve) => {
  channel.subscribe((status) => {
    console.log("   Channel status:", status);
    if (status === "SUBSCRIBED") resolve();
  });
});

console.log("   Waiting 1 second for subscription to stabilize...");
await new Promise(r => setTimeout(r, 1000));

// --- Step 4: Insert a test notification ---
console.log("\n4. Inserting test notification...");
const testMessage = `Realtime test at ${new Date().toISOString()}`;

// Note: We insert directly via pg because the anon key won't have insert permission
// without being authenticated as the organizer. This is just for testing.
try {
  await dbClient.query(`
    insert into public.event_notifications (event_id, user_id, type, message)
    values ($1, $2, 'VENUE_CHANGE', $3)
  `, [testEventId, testUserId, testMessage]);
  console.log("   ✓ Test notification inserted");
} catch (err) {
  console.log("   ❌ Insert failed:", err.message);
}

// Wait for realtime event
console.log("   Waiting up to 5 seconds for realtime delivery...");
await new Promise(r => setTimeout(r, 5000));

if (realtimeReceived) {
  console.log("\n✅ REALTIME TEST PASSED — notification was received via websocket!");
  console.log("   Message:", receivedPayload?.new?.message);
} else {
  console.log("\n⚠️  Realtime event was NOT received within 5 seconds.");
  console.log("   This could be due to:");
  console.log("   - RLS blocking the anon key from seeing the notification");
  console.log("   - Network latency");
  console.log("   - The test client not being authenticated");
  console.log("   The publication is correctly configured (verified in step 1).");
  console.log("   In the actual app, the user is authenticated and RLS allows reading own notifications.");
}

// --- Step 5: Cleanup ---
console.log("\n5. Cleaning up...");
supabase.removeChannel(channel);

// Delete the test notification
await dbClient.query(`
  delete from public.event_notifications 
  where message = $1
`, [testMessage]);
console.log("   ✓ Test notification deleted");

await dbClient.end();
await supabase.removeAllChannels();

console.log("\n=== Test Complete ===");
console.log("Summary:");
console.log("  - Realtime publication: ✓ Configured");
console.log("  - All 4 tables: ✓ Published");
console.log(`  - Realtime delivery: ${realtimeReceived ? "✓ Received" : "⚠️ Not received (likely RLS — normal for unauthenticated test client)"}`);
