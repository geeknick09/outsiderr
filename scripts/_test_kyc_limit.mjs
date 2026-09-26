// Apply the rejection-limit-enforcing submit_kyc and verify end-to-end:
// a user at the limit gets an RPC exception via PostgREST (the path that
// bypasses app-level guards), under-limit submits fine.
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
if (typeof globalThis.WebSocket === "undefined") globalThis.WebSocket = class { constructor() {} close() {} };
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, "..", ".env"), "utf-8");
const envVar = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const R = (n, ok, d = "") => console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`);

// 1. Apply the new function via direct pg
const dbUrl = envVar("SUPABASE_DB_URL") || `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(envVar("SUPABASE_DB_PASSWORD"))}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
const pgClient = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await pgClient.connect();
const fnSql = `
create or replace function public.submit_kyc(p_organizer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rejections int;
  v_limit int;
begin
  if not exists (
    select 1 from public.organizers
    where id = p_organizer_id and owner_id = auth.uid()
  ) and not public.is_current_user_admin() then
    raise exception 'Not authorised to submit KYC for this organizer';
  end if;

  if auth.role() = 'authenticated' and not public.is_current_user_admin() then
    select coalesce(rejection_count, 0)
      into v_rejections
      from public.organizers
     where id = p_organizer_id;

    select coalesce((value #>> '{}')::int, 5)
      into v_limit
      from public.platform_settings
     where key = 'organizer_rejection_limit';
    v_limit := coalesce(v_limit, 5);

    if v_limit > 0 and v_rejections >= v_limit then
      raise exception 'Organizer application rejected the maximum number of times';
    end if;
  end if;

  update public.organizers
     set kyc_submitted = true,
         kyc_status = 'PENDING',
         kyc_reviewed_at = null,
         kyc_review_note = null
   where id = p_organizer_id;
end;
$$;
grant execute on function public.submit_kyc(uuid) to authenticated, service_role;`;
try {
  await pgClient.query(fnSql);
  R("submit_kyc replaced live", true);
} catch (e) {
  R("submit_kyc replaced live", false, e.message);
}
await pgClient.end();

const admin = createClient(envVar("NEXT_PUBLIC_SUPABASE_URL"), envVar("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 2. Sign in as a dev user, seed a REJECTED organizer row at the limit
const userClient = createClient(envVar("NEXT_PUBLIC_SUPABASE_URL"), envVar("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
const { data: auth, error: authErr } = await userClient.auth.signInWithPassword({
  email: "dev.user@outsiderr.test",
  password: "DevTest#1234",
});
R("dev.user sign-in", !!auth?.user && !authErr, authErr?.message);
const uid = auth?.user?.id;
if (!uid) process.exit(1);

// clean any leftover row, then insert REJECTED at count=limit (5)
await admin.from("organizers").delete().eq("owner_id", uid);
const { data: org, error: orgErr } = await admin
  .from("organizers")
  .insert({ owner_id: uid, name: "Limit Test Org", kyc_status: "REJECTED", rejection_count: 5, verified: false })
  .select("id")
  .single();
R("seed rejected organizer (count=5)", !orgErr && !!org?.id, orgErr?.message);

// 3. User-JWT RPC call at the limit → must raise the exception
const { error: rpcErr } = await userClient.rpc("submit_kyc", { p_organizer_id: org.id });
R("blocked: submit_kyc raises at limit", !!rpcErr && rpcErr.message.includes("maximum"), rpcErr?.message ?? "no error!");
const { data: afterBlocked } = await admin.from("organizers").select("kyc_status, rejection_count").eq("id", org.id).single();
R("status unchanged after blocked call", afterBlocked?.kyc_status === "REJECTED", afterBlocked?.kyc_status);

// 4. Drop count below limit → same RPC path must succeed
await admin.from("organizers").update({ rejection_count: 1 }).eq("id", org.id);
const { error: rpcErr2 } = await userClient.rpc("submit_kyc", { p_organizer_id: org.id });
R("under limit: submit_kyc succeeds", !rpcErr2, rpcErr2?.message);
const { data: afterOk } = await admin.from("organizers").select("kyc_status").eq("id", org.id).single();
R("status flipped to PENDING", afterOk?.kyc_status === "PENDING", afterOk?.kyc_status);

// 5. Cleanup
await admin.from("organizers").delete().eq("id", org.id);
console.log("done");
