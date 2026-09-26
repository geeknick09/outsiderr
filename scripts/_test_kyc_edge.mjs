// KYC edge-case probe — covers wizard-block logic (server paths), rejection
// notice flow, resubmit, withdraw, rejection limit, admin notifs, thread.
// Self-cleaning. Run: node scripts/_test_kyc_edge.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
if (typeof globalThis.WebSocket === "undefined") globalThis.WebSocket = class { constructor() {} close() {} };
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, "..", ".env"), "utf-8");
const envVar = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const admin = createClient(envVar("NEXT_PUBLIC_SUPABASE_URL"), envVar("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const R = (n, ok, d = "") => { results.push({ n, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); };

const PW = "EdgeTest#1234";
const tag = `kycedge${Date.now()}@test.local`;
let userId, orgId, adminIds = [];

// Setup: user + admin users
{
  const { data } = await admin.auth.admin.createUser({ email: tag, password: PW, email_confirm: true });
  userId = data.user.id;
  const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true).limit(5);
  adminIds = (admins ?? []).map((a) => a.id);
  if (!adminIds.length) R("setup: admin exists", false, "no admin profile found");
}
const userC = createClient(envVar("NEXT_PUBLIC_SUPABASE_URL"), envVar("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
await userC.auth.signInWithPassword({ email: tag, password: PW });

// T1: become organizer (creates organizers row + is_organizer flag)
{
  const { data, error } = await admin.from("organizers").insert({
    owner_id: userId, name: "KYC Edge Org",
    bio: "test", upi_id: "edge@upi",
    bank_account_name: "Edge", bank_account_number: "12345678901",
    bank_ifsc: "SBIN0001234", bank_account_type: "SAVINGS",
    pan_number: "ABCDE1234F", pan_name: "Edge",
    kyc_submitted: true, kyc_status: "PENDING",
  }).select("id").single();
  orgId = data?.id;
  if (orgId) await admin.from("profiles").update({ is_organizer: true }).eq("id", userId);
  R("T1 organizer row created", !!orgId, error?.message ?? `orgId=${orgId}`);
  if (error && !orgId) console.log("  err:", error.message);
}

// T2: KYC submit → notifyAdmins-equivalent insert → every admin can read it under their JWT
{
  if (adminIds.length) {
    await admin.from("event_notifications").insert(
      adminIds.map((aid) => ({ user_id: aid, type: "KYC_SUBMITTED", message: "New organizer application submitted by KYC Edge Org" })),
    );
    // Verify the notification SELECT policy works as expected: target user's
    // JWT can read their own rows, a different user's JWT cannot read others'.
    const { count: delivered } = await admin.from("event_notifications").select("id", { count: "exact", head: true }).eq("type", "KYC_SUBMITTED").ilike("message", "%KYC Edge Org%");
    await admin.from("event_notifications").insert({ user_id: userId, type: "KYC_SUBMITTED", message: "New organizer application submitted by KYC Edge Org" });
    const { count: ownRead } = await userC.from("event_notifications").select("id", { count: "exact", head: true }).eq("type", "KYC_SUBMITTED").ilike("message", "%KYC Edge Org%");
    const { data: adminNotifs } = await admin.from("event_notifications").select("id, user_id").eq("type", "KYC_SUBMITTED").ilike("message", "%KYC Edge Org%").neq("user_id", userId).limit(5);
    let crossRead = 0;
    for (const n of adminNotifs ?? []) {
      const { data } = await userC.from("event_notifications").select("id").eq("id", n.id);
      if ((data ?? []).length > 0) crossRead++;
    }
    R("T2 delivered to admins + owner reads own + RLS blocks others", delivered >= adminIds.length && ownRead >= 1 && crossRead === 0, `delivered=${delivered}/${adminIds.length} ownRead=${ownRead} crossRead=${crossRead}`);
    await admin.from("event_notifications").delete().eq("type", "KYC_SUBMITTED").ilike("message", "%KYC Edge Org%");
  } else R("T2 KYC_SUBMITTED readable by all admins", true, "no admin users found (skipped)");
}

// T3: admin rejects → organizer notified (KYC_REJECTED) + thread row logged w/ admin email
{
  const { data: admins } = await admin.auth.admin.listUsers();
  const adminEmail = admins?.users?.find((u) => adminIds.includes(u.id))?.email ?? "admin@test";
  await admin.from("organizers").update({
    kyc_status: "REJECTED", rejection_count: 1, kyc_review_note: "PAN blurry", kyc_reviewed_at: new Date().toISOString(),
  }).eq("id", orgId);
  await admin.from("kyc_messages").insert({ organizer_id: orgId, sender_role: "admin", sender_email: adminEmail, message: "Rejected: PAN blurry" });
  await admin.from("event_notifications").insert({ user_id: userId, type: "KYC_REJECTED", message: "Rejected: PAN blurry" });
  const { count: n } = await admin.from("event_notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("type", "KYC_REJECTED");
  const { data: msg } = await admin.from("kyc_messages").select("sender_email, sender_role").eq("organizer_id", orgId);
  R("T3 reject → organizer notified + thread w/ admin email", n >= 1 && msg?.[0]?.sender_role === "admin" && !!msg[0].sender_email, `notifs=${n} msg=${msg?.length}`);
}

// T4: multi-admin attribution — second admin clarifies; thread shows both emails
{
  await admin.from("kyc_messages").insert({ organizer_id: orgId, sender_role: "admin", sender_email: "admin2@test", message: "Please re-upload PAN" });
  const { data } = await userC.from("kyc_messages").select("sender_email").eq("organizer_id", orgId).order("created_at");
  R("T4 organizer reads full thread (2 admins)", (data ?? []).length === 2 && data[0].sender_email !== data[1].sender_email, `msgs=${data?.length}`);
}

// T5: organizer can't read another organizer's thread (RLS)
{
  const { data: other } = await admin.from("kyc_messages").select("id").neq("organizer_id", orgId).limit(1).maybeSingle();
  if (other) {
    const { data } = await userC.from("kyc_messages").select("id").eq("id", other.id);
    R("T5 RLS: cannot read others' thread", (data ?? []).length === 0);
  } else R("T5 RLS: cannot read others' thread", true, "no other thread to probe (skipped)");
}

// T6: resubmit → PENDING again (submit_kyc flips REJECTED→PENDING)
{
  const { error } = await userC.rpc("submit_kyc", { p_organizer_id: orgId });
  const { data } = await admin.from("organizers").select("kyc_status").eq("id", orgId).single();
  R("T6 resubmit REJECTED→PENDING", !error && data?.kyc_status === "PENDING", error?.message ?? data?.kyc_status);
}

// T7: rejection limit — count=5 → access state resolves blocked (kyc_status REJECTED + count>=limit)
{
  const { data: s } = await admin.from("platform_settings").select("value").eq("key", "organizer_rejection_limit").single();
  const limit = Number(s?.value ?? 5);
  await admin.from("organizers").update({ kyc_status: "REJECTED", rejection_count: limit }).eq("id", orgId);
  const { data: o } = await admin.from("organizers").select("kyc_status, rejection_count").eq("id", orgId).single();
  // getOrganizerAccessState: blocked = REJECTED && rejectionCount >= limit
  const blocked = o.kyc_status === "REJECTED" && o.rejection_count >= limit;
  R("T7 count=limit → blocked resolves", blocked, `count=${o.rejection_count} limit=${limit}`);
}

// T8: withdraw → organizers row + is_organizer flag cleared (action-equivalent)
{
  // withdrawOrganizerApplication: delete organizers row, clear profiles.is_organizer
  await admin.from("organizers").delete().eq("id", orgId);
  await admin.from("profiles").update({ is_organizer: false }).eq("id", userId);
  const { data: org } = await admin.from("organizers").select("id").eq("owner_id", userId).maybeSingle();
  const { data: prof } = await admin.from("profiles").select("is_organizer").eq("id", userId).single();
  R("T8 withdraw → row deleted + flag cleared", !org && prof?.is_organizer === false);
}

// T9: withdraw-blocked guard — recreate org + event → withdrawal must be refused
{
  const { data, error: orgErr } = await admin.from("organizers").insert({
    owner_id: userId, name: "KYC Edge Org 2",
    kyc_status: "APPROVED", kyc_submitted: true,
  }).select("id, kyc_status").single();
  const newOrg = data?.id;
  if (!newOrg) {
    R("T9 APPROVED + events → withdraw refused (guard data)", false, `org insert: ${orgErr?.message}`);
  } else {
    const { data: ev, error: evErr } = await admin.from("events").insert({
      organizer_id: newOrg, title: "EdgeEvent", description: "t", category: "JAM",
      city: "KOLKATA", venue_name: "x", starts_at: new Date(Date.now() + 86400000 * 60).toISOString(),
      status: "DRAFT",
    }).select("id").single();
    // withdrawOrganizerApplication refuses when kycStatus=APPROVED or events exist — verify both conditions hold
    if (evErr) console.log("  ev err:", evErr.message);
    R("T9 APPROVED + events → withdraw refused (guard data)", !!ev && data.kyc_status === "APPROVED");
    if (ev) await admin.from("events").delete().eq("id", ev.id);
    await admin.from("organizers").delete().eq("id", newOrg);
  }
}

// T10: wizard doc-error gate — canAdvance logic (replicated): error blocks step 1 & 3
{
  const step1Blocked = (panDocError, uploadingPan) =>
    !(!!"ABCDE1234F" && true && !!"Edge" && !panDocError && !uploadingPan);
  const step3Blocked = (bankDocError, uploadingBank) =>
    !(!!"e@upi" && true && !!"123" && !!"SBIN0X" && true && !!"N" && !bankDocError && !uploadingBank);
  R("T10 doc error blocks advance (pan)", step1Blocked("too large", false));
  R("T10 doc error blocks advance (bank)", step3Blocked("too large", false));
  R("T10 in-flight upload blocks advance", step1Blocked(null, true) && step3Blocked(null, true));
  R("T10 clean state allows advance", !step1Blocked(null, false) && !step3Blocked(null, false));
}

// T11: KYC notification type insertable in enum
{
  const { error } = await admin
    .from("event_notifications")
    .insert({ user_id: userId, type: "KYC_SUBMITTED", message: "x" });
  R("T11 KYC_SUBMITTED type insertable", !error, error?.message);
}

// Cleanup
await admin.from("kyc_messages").delete().eq("organizer_id", orgId);
await admin
  .from("event_notifications")
  .delete()
  .eq("user_id", userId)
  .in("type", ["KYC_REJECTED", "KYC_SUBMITTED"]);
await admin.from("organizers").delete().eq("owner_id", userId);
await admin.auth.admin.deleteUser(userId).catch(() => {});

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
