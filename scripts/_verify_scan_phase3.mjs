// Verifies Phase 3 scanner sessions and token check-in on the live DB, in one rolled-back transaction.
// Usage: node scripts/_verify_scan_phase3.mjs
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID, createHash } from "crypto";

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
const { rows: vt } = await client.query(`
  select t.qr_hash, t.event_id, e.title,
         (select org.id from public.organizers org where org.id = e.organizer_id) as organizer_id
    from public.tickets t join public.events e on e.id = t.event_id
   where t.status::text = 'VALID'
   order by t.created_at desc limit 40`);
const a = vt[0];
const b = vt.find((x) => x.event_id !== a?.event_id);
if (!a || !b) {
  console.log("SKIP  need VALID tickets for two different events");
  await client.end();
  process.exit(0);
}

await client.query("begin");
try {
  const pinCode = "424242";
  const hash = createHash("sha256").update(`${a.event_id}:${pinCode}`).digest("hex");
  await client.query(
    `insert into public.scanner_pins (event_id, organizer_id, pin_code, pin_hash, staff_name)
     values ($1, $2, $3, $4, 'Verify Door')`,
    [a.event_id, a.organizer_id, pinCode, hash]);

  const { rows: [login] } = await client.query(`select * from public.scanner_login_session($1, $2)`, [a.event_id, pinCode]);
  check("door PIN login returns a token scoped to the event", !!login?.token && login.event_id === a.event_id);
  const { rows: none } = await client.query(`select * from public.scanner_login_session($1, '000000')`, [a.event_id]);
  check("wrong door PIN returns no token", none.length === 0);

  const s1 = randomUUID();
  const { rows: [r1] } = await client.query(`select * from public.check_in_ticket_by_token($1, $2, $3)`, [a.qr_hash, login.token, s1]);
  check("first scan of a valid ticket is VALID", r1.outcome === "VALID", r1.outcome);

  const { rows: [r2] } = await client.query(`select * from public.check_in_ticket_by_token($1, $2, $3)`, [a.qr_hash, login.token, randomUUID()]);
  check("second scan of the same ticket is ALREADY_USED", r2.outcome === "ALREADY_USED", r2.outcome);

  const { rows: [rep] } = await client.query(`select * from public.check_in_ticket_by_token($1, $2, $3)`, [a.qr_hash, login.token, s1]);
  check("replayed client scan returns the original outcome", rep.outcome === "VALID", rep.outcome);

  const { rows: [w] } = await client.query(`select * from public.check_in_ticket_by_token($1, $2, $3)`, [b.qr_hash, login.token, randomUUID()]);
  check("ticket from another event is WRONG_EVENT", w.outcome === "WRONG_EVENT", w.outcome);
  check("WRONG_EVENT names the ticket's real event", w.event_title === b.title, w.event_title);

  const { rows: [u] } = await client.query(`select * from public.check_in_ticket_by_token($1, $2, $3)`, ["does-not-exist", login.token, randomUUID()]);
  check("unknown ticket is INVALID", u.outcome === "INVALID", u.outcome);

  const { rows: [{ n }] } = await client.query(
    `select count(*)::int as n from public.scan_log where event_id = $1 and actor_name = 'Verify Door'`, [a.event_id]);
  check("every attempt is logged once (replay not double-logged)", n === 4, `rows=${n}`);

  const { rows: [{ n: wrongLogged }] } = await client.query(
    `select count(*)::int as n from public.scan_log where outcome = 'WRONG_EVENT' and actor_name = 'Verify Door'`);
  check("WRONG_EVENT scan is logged against the door's event", wrongLogged === 1);
} catch (err) {
  check("verification ran to completion", false, err.message);
} finally {
  await client.query("rollback");
  await client.end();
}
console.log(failures === 0 ? "\nAll Phase 3 checks passed (rolled back)." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
