"use client";

import { useRef, useState, useTransition } from "react";
import { FileUp, Loader2, Upload } from "lucide-react";

import { requestMemberImportAction } from "@/modules/shared/actions/communities";
import { Button } from "@/modules/shared";

interface ParsedRow {
  name: string;
  phone?: string;
  email?: string;
  events_attended?: number;
}

// Minimal CSV parser - handles commas, quoted cells, CRLF. Excel exports as CSV.
function parseCsv(text: string): ParsedRow[] {
  const rows: string[][] = [];
  let cur: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === "," || ch === "\t" || ch === ";") { cur.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(cell); cell = "";
      if (cur.some((c) => c.trim())) rows.push(cur);
      cur = [];
    } else cell += ch;
  }
  cur.push(cell);
  if (cur.some((c) => c.trim())) rows.push(cur);

  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iName = idx(["name", "full name", "full_name", "member name"]);
  const iPhone = idx(["phone", "ph", "phone number", "mobile", "ph no"]);
  const iEmail = idx(["email", "e-mail", "email id"]);
  const iAtt = idx(["events attended", "events_attended", "attended", "events"]);
  const body = iName === -1 ? rows : rows.slice(1);

  return body
    .map((r) => ({
      name: (r[iName === -1 ? 0 : iName] ?? "").trim(),
      phone: iPhone >= 0 ? r[iPhone]?.trim() : undefined,
      email: iEmail >= 0 ? r[iEmail]?.trim() : undefined,
      events_attended: iAtt >= 0 ? parseInt(r[iAtt] ?? "0", 10) || 0 : 0,
    }))
    .filter((r) => r.name || r.phone || r.email);
}

export function MemberImportPanel({
  communityId,
  imports,
}: {
  communityId: string;
  imports: { id: string; filename: string; status: string; validRows: number; invalidRows: number; createdAt: string }[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [filename, setFilename] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setFilename(file.name);
    const text = await file.text();
    setRows(parseCsv(text));
    setMsg(null);
  }

  function submit() {
    if (!rows?.length) return;
    startTransition(async () => {
      const res = await requestMemberImportAction(communityId, filename, rows);
      if (res.error) setMsg(res.error);
      else {
        setMsg("Submitted for admin approval.");
        setRows(null);
        setFilename("");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-zinc-300 p-5 text-center dark:border-white/15">
        <p className="text-sm font-semibold">Import existing members</p>
        <p className="mt-1 text-xs text-muted">
          CSV with columns: <code>name, phone, email, events_attended</code>. Invalid rows are dropped;
          an admin reviews before members are added.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,.xlsx"
          className="hidden"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button type="button" onClick={() => fileRef.current?.click()} className="mt-3">
          <FileUp className="h-4 w-4" /> Choose file
        </Button>
      </div>

      {rows ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold">{filename} - {rows.length} rows parsed</p>
          <div className="max-h-56 overflow-auto rounded-2xl border border-zinc-200 text-xs dark:border-white/10">
            <table className="w-full">
              <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900">
                <tr className="text-left text-muted">
                  <th className="px-3 py-2">Name</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Attended</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-zinc-100 dark:border-white/5">
                    <td className="px-3 py-1.5">{r.name}</td>
                    <td className="px-3 py-1.5">{r.phone}</td>
                    <td className="px-3 py-1.5">{r.email}</td>
                    <td className="px-3 py-1.5">{r.events_attended}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 50 ? <p className="text-xs text-muted">… and {rows.length - 50} more</p> : null}
          <Button onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Submit for review
          </Button>
        </div>
      ) : null}

      {msg ? <p className="text-sm font-semibold text-lime-neon">{msg}</p> : null}

      {imports.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Past imports</p>
          {imports.map((i) => (
            <div key={i.id} className="glass flex items-center justify-between rounded-2xl px-4 py-2.5 text-sm">
              <span className="truncate">{i.filename}</span>
              <span className="shrink-0 text-xs text-muted">
                {i.validRows} valid · {i.invalidRows} dropped · {i.status.toLowerCase()}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
