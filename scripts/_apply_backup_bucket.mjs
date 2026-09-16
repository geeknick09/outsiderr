// Apply the backups storage bucket and RLS policies to the live Supabase project.
// Run with: node scripts/_apply_backup_bucket.mjs
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

async function main() {
  console.log("Creating backups bucket...");

  // Check if bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets ?? []).some((b) => b.id === "backups");

  if (!exists) {
    const { error } = await supabase.storage.createBucket("backups", {
      public: false,
      fileSizeLimit: 100 * 1024 * 1024, // 100MB
    });
    if (error) {
      console.error("Failed to create bucket:", error.message);
      process.exit(1);
    }
    console.log("✓ Backups bucket created (private, 100MB limit)");
  } else {
    console.log("✓ Backups bucket already exists");
  }

  // RLS policies must be applied via SQL editor (service client can't run raw SQL)
  // The policies are in supabase/schema.sql and supabase/migrations/fix_all.sql
  console.log("\nNOTE: RLS policies for the backups bucket must be applied via");
  console.log("the Supabase SQL Editor. Run the SQL from supabase/schema.sql");
  console.log("(search for 'Backups bucket') or supabase/migrations/fix_all.sql.");
  console.log("\nThe service-role key bypasses RLS, so the backup cron will work");
  console.log("even without the policies — they are for defense-in-depth.");

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
