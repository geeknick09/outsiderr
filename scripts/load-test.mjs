/**
 * Load Test — 50, 100, 150, 200 users
 *
 * Tests the dev server's ability to handle concurrent requests.
 * Uses batched concurrent requests (10 at a time) to avoid overwhelming
 * the single-threaded Next.js dev server.
 */
import { chromium } from "playwright";
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

const BASE = "http://localhost:3000";
const USER_LEVELS = [50, 100, 150, 200];
const BATCH_SIZE = 10; // Process 10 users at a time to avoid overwhelming dev server
const TIMEOUT = 60000; // 60 second timeout per request

async function main() {
  await dbClient.connect();

  // Get a published event for testing
  const { rows: events } = await dbClient.query(
    "SELECT id FROM public.events WHERE status = 'PUBLISHED' ORDER BY created_at DESC LIMIT 1"
  );
  const eventId = events[0]?.id;
  if (!eventId) {
    console.log("FATAL: No published events found for load test");
    await dbClient.end();
    return;
  }

  console.log(`Load testing with event: ${eventId}`);
  console.log(`Base URL: ${BASE}`);
  console.log(`Batch size: ${BATCH_SIZE} concurrent users at a time`);
  console.log("");

  const allResults = [];

  for (const numUsers of USER_LEVELS) {
    console.log(`\n=== Load Test: ${numUsers} users ===`);
    const browser = await chromium.launch({ headless: true });
    
    const allTaskResults = [];
    const startTime = Date.now();

    // Process users in batches
    for (let batchStart = 0; batchStart < numUsers; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, numUsers);
      const batchSize = batchEnd - batchStart;
      
      const batchTasks = [];
      for (let i = batchStart; i < batchEnd; i++) {
        batchTasks.push((async () => {
          const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
          const page = await context.newPage();
          const taskStart = Date.now();
          let success = false;
          let error = null;
          let statusCode = 0;

          try {
            // Visit homepage
            const response = await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
            statusCode = response?.status() ?? 0;
            success = statusCode === 200;
          } catch (e) {
            error = e.message?.substring(0, 100);
          }

          const duration = Date.now() - taskStart;
          await context.close();
          return { success, error, duration, statusCode };
        })());
      }

      const batchResults = await Promise.all(batchTasks);
      allTaskResults.push(...batchResults);
      
      // Brief pause between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const totalDuration = Date.now() - startTime;

    // Analyze results
    const successes = allTaskResults.filter(r => r.success);
    const failures = allTaskResults.filter(r => !r.success);
    const avgDuration = Math.round(allTaskResults.reduce((sum, r) => sum + r.duration, 0) / allTaskResults.length);
    const maxDuration = Math.max(...allTaskResults.map(r => r.duration));
    const minDuration = Math.min(...allTaskResults.map(r => r.duration));
    const successRate = ((successes.length / numUsers) * 100).toFixed(1);

    console.log(`  Total time: ${totalDuration}ms`);
    console.log(`  Success: ${successes.length}/${numUsers} (${successRate}%)`);
    console.log(`  Failures: ${failures.length}`);
    console.log(`  Avg response: ${avgDuration}ms`);
    console.log(`  Min response: ${minDuration}ms`);
    console.log(`  Max response: ${maxDuration}ms`);
    
    if (failures.length > 0) {
      console.log(`  Sample errors: ${failures.slice(0, 3).map(f => f.error?.substring(0, 80)).join("; ")}`);
    }

    allResults.push({
      users: numUsers,
      totalDuration,
      successes: successes.length,
      failures: failures.length,
      successRate: parseFloat(successRate),
      avgDuration,
      maxDuration,
      minDuration,
    });

    await browser.close();
    
    // Pause between test levels
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Summary
  console.log("\n============================================================");
  console.log("LOAD TEST SUMMARY");
  console.log("============================================================");
  console.log("Users | Success | Failures | Success% | Avg(ms) | Max(ms) | Total(ms)");
  console.log("------|---------|----------|----------|---------|---------|----------");
  for (const r of allResults) {
    console.log(`${String(r.users).padStart(5)} | ${String(r.successes).padStart(7)} | ${String(r.failures).padStart(8)} | ${String(r.successRate).padStart(8)}% | ${String(r.avgDuration).padStart(7)} | ${String(r.maxDuration).padStart(7)} | ${String(r.totalDuration).padStart(9)}`);
  }

  await dbClient.end();
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
