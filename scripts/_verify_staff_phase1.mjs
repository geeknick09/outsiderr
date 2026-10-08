// Verifies the Phase 1 staff RPCs on the live DB. Everything runs in one transaction
// that is rolled back. Usage: node scripts/_verify_staff_phase1.mjs
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "..", ".env"), "utf-8");
const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();
const dbUrl = envContent.match(/^SUPABASE_DB_URL=(.+)$/m)?.[1]?.trim();
const connectionString = dbUrl || `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: [two] } = await client.query(`
  select (select id from public.organizers order by created_at limit 1) as org_a,
         (select id from public.organizers order by created_at desc limit 1) as org_b,
         (select id from public.events order by created_at limit 1) as ev_any`);
const { rows: [evA] } = await client.query(
  `select id from public.events where organizer_id = $1 limit 1`, [two.org_a]);
const { rows: [evB] } = await client.query(
  `select id from public.events where organizer_id is not null and organizer_id <> $1 limit 1`, [two.org_a]);

await client.query("begin");
try {
  const { rows: [reg] } = await client.query(
    `select * from public.staff_register('ORGANIZER', $1, 'Verify Staff', 'v@example.com', '9000000001', null)`, [two.org_a]);
  check("register returns a 6-digit PIN", /^\d{6}$/.test(reg.pin), reg.pin);

  const { rows: [stored] } = await client.query(
    `select pin_hash from public.staff_members where id = $1`, [reg.staff_id]);
  check("PIN is stored hashed, not plaintext", stored.pin_hash !== reg.pin && stored.pin_hash.startsWith("$2"));
  const { rows: [ok] } = await client.query(
    `select (extensions.crypt($1, $2) = $2) as ok`, [reg.pin, stored.pin_hash]);
  check("stored hash verifies the issued PIN", ok.ok === true);

  const { rows: [reset] } = await client.query(`select public.staff_reset_pin($1) as pin`, [reg.staff_id]);
  const { rows: [old] } = await client.query(
    `select (extensions.crypt($1, pin_hash) = pin_hash) as ok from public.staff_members where id = $2`, [reg.pin, reg.staff_id]);
  check("reset issues a new PIN and invalidates the old one", /^\d{6}$/.test(reset.pin) && (old.ok === false || reg.pin === reset.pin));

  if (evA) {
    await client.query(`select public.staff_set_assignment($1, $2, true)`, [reg.staff_id, evA.id]);
    check("organizer staff can be assigned to own event", true);
  }
  if (evB) {
    await client.query("savepoint sp_cross");
    try {
      await client.query(`select public.staff_set_assignment($1, $2, true)`, [reg.staff_id, evB.id]);
      check("organizer staff refused for another organizer's event", false, "accepted");
    } catch (err) {
      check("organizer staff refused for another organizer's event", /own events/.test(err.message), err.message);
      await client.query("rollback to savepoint sp_cross");
    }
  }
} catch (err) {
  check("verification ran to completion", false, err.message);
} finally {
  await client.query("rollback");
  await client.end();
}
console.log(failures === 0 ? "\nAll staff checks passed (rolled back)." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
