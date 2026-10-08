// Makes fix_all.sql applicable in one transaction on a live DB:
//  - drop request_postponement_refund before each re-create (return type changed)
//  - drop the old 'organizers owner/admin read' policy before re-creating it
//  - point stale create_reserved_order grant/revoke lines at the live 8-arg signature
//  - drop the obsolete apply_failed_payment(text) before revoking it
// Idempotent: re-running changes nothing once applied.
// Usage: node scripts/_fix_bundle_idempotency.mjs
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = join(__dirname, "..", "supabase", "migrations", "fix_all.sql");
let sql = readFileSync(file, "utf-8");
const before = sql;

const rpc = "create or replace function public.request_postponement_refund(";
sql = sql.split(rpc).join(`drop function if exists public.request_postponement_refund(uuid, uuid);\n${rpc}`);
sql = sql.replace(/drop function if exists public\.request_postponement_refund\(uuid, uuid\);\n(drop function if exists public\.request_postponement_refund\(uuid, uuid\);\n)+/g,
  "drop function if exists public.request_postponement_refund(uuid, uuid);\n");

const pol = 'create policy "organizers owner/admin read" on public.organizers';
sql = sql.split(pol).join(`drop policy if exists "organizers owner/admin read" on public.organizers;\n${pol}`);
sql = sql.replace(/(drop policy if exists "organizers owner\/admin read" on public\.organizers;\n)+/g,
  'drop policy if exists "organizers owner/admin read" on public.organizers;\n');

sql = sql.split("public.create_reserved_order(uuid, uuid, integer, integer, integer, integer, integer, integer, integer, integer, text, text, text, text, text)")
  .join("public.create_reserved_order(uuid, uuid, integer, text, text, text, text, text)");

sql = sql.replace("revoke execute on function public.apply_failed_payment(text) from public, anon, authenticated;",
  "drop function if exists public.apply_failed_payment(text);");

writeFileSync(file, sql);
console.log(sql === before ? "no changes (already fixed)" : "bundle updated");
