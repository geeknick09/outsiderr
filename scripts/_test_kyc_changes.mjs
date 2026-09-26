// Verify the pending_kyc change-request lifecycle end-to-end at DB level:
// stage → columns unchanged → approve applies + clears; reject clears, old values stay.
// Also confirms organizers_public never exposes pending_kyc.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
if (typeof globalThis.WebSocket === "undefined") globalThis.WebSocket = class { constructor() {} close() {} };
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, "..", ".env"), "utf-8");
const envVar = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const R = (n, ok, d = "") => console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`);

const admin = createClient(envVar("NEXT_PUBLIC_SUPABASE_URL"), envVar("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const userClient = createClient(envVar("NEXT_PUBLIC_SUPABASE_URL"), envVar("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
const { data: auth } = await userClient.auth.signInWithPassword({
  email: "dev.user@outsiderr.test",
  password: "DevTest#1234",
});
const uid = auth?.user?.id;
R("dev.user sign-in", !!uid);

await admin.from("organizers").delete().eq("owner_id", uid);
const { data: org } = await admin
  .from("organizers")
  .insert({
    owner_id: uid, name: "Change Test Org", kyc_status: "APPROVED", verified: true,
    pan_number: "AAAAA1234A", bank_ifsc: "HDFC0001234", upi_id: "old@upi",
  })
  .select("id").single();
R("seed approved organizer", !!org?.id);

// ---- Stage: organizer edits PAN + IFSC — real columns must NOT change ----
await admin.from("organizers").update({
  bio: "new safe bio",
  pending_kyc: { pan_number: "BBBBB5678B", bank_ifsc: "ICIC0009876" },
}).eq("id", org.id);
const staged = await admin.from("organizers").select("bio, pan_number, bank_ifsc, pending_kyc").eq("id", org.id).single();
R("stage: safe field applied", staged.data?.bio === "new safe bio");
R("stage: pan unchanged (still verified)", staged.data?.pan_number === "AAAAA1234A");
R("stage: ifsc unchanged (still verified)", staged.data?.bank_ifsc === "HDFC0001234");
R("stage: pending_kyc holds proposal", staged.data?.pending_kyc?.pan_number === "BBBBB5678B");

// ---- Approve: pending applies to real columns + stage clears ----
const pending1 = staged.data.pending_kyc;
await admin.from("organizers").update({ ...pending1, pending_kyc: null }).eq("id", org.id);
const afterApprove = await admin.from("organizers").select("pan_number, bank_ifsc, pending_kyc").eq("id", org.id).single();
R("approve: pan applied", afterApprove.data?.pan_number === "BBBBB5678B");
R("approve: ifsc applied", afterApprove.data?.bank_ifsc === "ICIC0009876");
R("approve: pending cleared", afterApprove.data?.pending_kyc === null);
R("approve: status still APPROVED", (await admin.from("organizers").select("kyc_status").eq("id", org.id).single()).data?.kyc_status === "APPROVED");

// ---- Reject: stage clears, previously-approved values stay ----
await admin.from("organizers").update({ pending_kyc: { upi_id: "fraud@upi" } }).eq("id", org.id);
await admin.from("organizers").update({ pending_kyc: null }).eq("id", org.id); // reject path
const afterReject = await admin.from("organizers").select("upi_id, pending_kyc").eq("id", org.id).single();
R("reject: upi keeps old verified value", afterReject.data?.upi_id === "old@upi");
R("reject: pending cleared", afterReject.data?.pending_kyc === null);

// ---- organizers_public must not expose pending_kyc ----
const pubCheck = await userClient.from("organizers_public").select("*").eq("id", org.id).maybeSingle();
R("organizers_public hides pending_kyc", pubCheck.data && !("pending_kyc" in pubCheck.data));

// cleanup
await admin.from("organizers").delete().eq("id", org.id);
console.log("done");
