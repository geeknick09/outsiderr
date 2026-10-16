"use client";

import { useState } from "react";
import { Plus, Trash2, AlertTriangle, FileCheck } from "lucide-react";

import { formatPaise } from "@/modules/shared";
import {
  addComplianceTaskAction,
  toggleComplianceTaskAction,
  deleteComplianceTaskAction,
} from "@/modules/admin/actions/compliance";

const KIND_LABEL: Record<string, string> = {
  REGISTRATION: "Registration",
  FILING: "Filing",
  POLICY_REVIEW: "Policy review",
  TASK: "Task",
};

const KIND_TONE: Record<string, string> = {
  REGISTRATION: "bg-blue-500/15 text-blue-400",
  FILING: "bg-amber-400/15 text-amber-400",
  POLICY_REVIEW: "bg-violet-neon/15 text-violet-neon",
  TASK: "bg-zinc-500/15 text-muted",
};

void formatPaise;

export function CompliancePanel({
  tasks,
}: {
  tasks: {
    id: string;
    title: string;
    kind: string;
    dueDate: string | null;
    status: string;
    notes: string | null;
    overdue: boolean;
    doneAt: string | null;
  }[];
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("TASK");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!title.trim()) { setError("Give the task a title."); return; }
    setBusy(true); setError(null);
    const r = await addComplianceTaskAction({ title, kind, dueDate, notes });
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setTitle(""); setDueDate(""); setNotes("");
  }

  async function toggle(id: string, done: boolean) {
    setBusy(true);
    await toggleComplianceTaskAction(id, done);
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm("Delete this task?")) return;
    setBusy(true);
    await deleteComplianceTaskAction(id);
    setBusy(false);
  }

  const open = tasks.filter((t) => t.status === "OPEN");
  const done = tasks.filter((t) => t.status === "DONE");

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="glass space-y-3 rounded-3xl p-4">
        <div className="flex flex-wrap gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title - e.g. GST filing for September"
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          >
            {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          />
        </div>
        <div className="flex gap-2">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          />
          <button
            onClick={add}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-full bg-neon-gradient px-4 py-2 text-sm font-bold text-white shadow-glow-violet disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>

      {/* Open tasks */}
      <TaskList tasks={open} onToggle={toggle} onRemove={remove} empty="Nothing outstanding." />

      {done.length > 0 ? (
        <details className="glass rounded-3xl p-4">
          <summary className="cursor-pointer text-sm font-semibold text-muted">
            Completed ({done.length})
          </summary>
          <div className="mt-3">
            <TaskList tasks={done} onToggle={toggle} onRemove={remove} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function TaskList({
  tasks,
  onToggle,
  onRemove,
  empty,
}: {
  tasks: {
    id: string; title: string; kind: string; dueDate: string | null;
    status: string; notes: string | null; overdue: boolean;
  }[];
  onToggle: (id: string, done: boolean) => void;
  onRemove: (id: string) => void;
  empty?: string;
}) {
  if (tasks.length === 0) {
    return <p className="glass rounded-3xl p-5 text-center text-sm text-muted">{empty ?? "Nothing here."}</p>;
  }
  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <div
          key={t.id}
          className={`glass flex items-center gap-3 rounded-2xl p-3 ${t.overdue ? "border-red-400/50" : ""}`}
        >
          <button
            onClick={() => onToggle(t.id, t.status !== "DONE")}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              t.status === "DONE"
                ? "border-lime-neon bg-lime-neon/20 text-lime-neon"
                : "border-zinc-300 dark:border-white/20 hover:border-violet-neon"
            }`}
          >
            {t.status === "DONE" ? <FileCheck className="h-4 w-4" /> : null}
          </button>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${t.status === "DONE" ? "text-muted line-through" : ""}`}>
              {t.title}
            </p>
            {t.notes ? <p className="truncate text-xs text-muted">{t.notes}</p> : null}
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${KIND_TONE[t.kind] ?? KIND_TONE.TASK}`}>
            {KIND_LABEL[t.kind] ?? t.kind}
          </span>
          {t.dueDate ? (
            <span className={`flex items-center gap-1 text-xs ${t.overdue ? "font-bold text-red-400" : "text-muted"}`}>
              {t.overdue ? <AlertTriangle className="h-3 w-3" /> : null}
              {t.dueDate}
            </span>
          ) : null}
          <button onClick={() => onRemove(t.id)} className="text-muted transition-colors hover:text-red-400">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
