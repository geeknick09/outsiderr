import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
if (typeof globalThis.WebSocket === "undefined") globalThis.WebSocket = class { constructor() {} close() {} };
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, "..", ".env"), "utf-8");
const v = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))[1].trim();
const SB_URL = v("NEXT_PUBLIC_SUPABASE_URL"), ANON = v("NEXT_PUBLIC_SUPABASE_ANON_KEY"), SERVICE = v("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
const anon = createClient(SB_URL, ANON, { auth: { persistSession: false } });
const { data: s } = await anon.auth.signInWithPassword({ email: "dev.organizer@outsiderr.test", password: "DevTest#1234" });
const tok = s.session.access_token, uid = s.user.id;
const uc = createClient(SB_URL, ANON, { global: { headers: { Authorization: `Bearer ${tok}` } }, auth: { persistSession: false } });
const org = (await admin.from("organizers").select("id").eq("owner_id", uid).single()).data;
// mimic createClub insert
const ins = await uc.from("clubs").insert({
  owner_id: org.id, name: "PROBE Club", bio: "x", type: "CLUB", city: "KOLKATA",
  avatar_url: null, cover_url: null, instagram_handle: null, upi_id: null,
  membership_type: "FREE", membership_fee_paise: 0, terms: [], verified: false,
}).select("id").single();
console.log("insert:", JSON.stringify(ins.error ?? ins.data));
