// Add Razorpay notification types to the event_notification_type enum
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");
const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();

if (!dbPassword) {
  console.error("SUPABASE_DB_PASSWORD not found in .env");
  process.exit(1);
}

const dbClient = new pg.Client({
  connectionString: `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});

const types = [
  "PAYMENT_SUCCESS",
  "PAYMENT_FAILED",
  "REFUND_INITIATED",
  "REFUND_COMPLETED",
  "PAYOUT_COMPLETED",
];

(async () => {
  await dbClient.connect();
  console.log("=== Adding Razorpay notification types ===\n");

  for (const t of types) {
    try {
      await dbClient.query(`alter type event_notification_type add value if not exists '${t}'`);
      console.log(`✓ ${t} added (or already exists)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already") || msg.includes("duplicate")) {
        console.log(`✓ ${t} (already exists)`);
      } else {
        console.error(`✗ ${t}:`, msg);
      }
    }
  }

  await dbClient.end();
  console.log("\n=== Notification types migration complete ===");
})().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
