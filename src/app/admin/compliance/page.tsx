import { ClipboardCheck, AlertTriangle } from "lucide-react";

import { listComplianceTasks, getComplianceSignals } from "@/modules/admin/server";
import { CompliancePanel } from "@/modules/admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Compliance - Outsiderr" };

export default async function AdminCompliancePage() {
  const [tasks, signals] = await Promise.all([listComplianceTasks(), getComplianceSignals()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <ClipboardCheck className="h-6 w-6 text-violet-neon" />
          Compliance
        </h1>
        <p className="text-sm text-muted">
          Registrations, filing dates, policy reviews - what&apos;s outstanding and what needs attention.
        </p>
      </div>

      {/* Auto signals */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Needs attention</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {signals.map((s) => (
            <a
              key={s.label}
              href={s.href}
              className={`glass rounded-3xl p-4 transition-colors hover:border-violet-neon ${
                s.count > 0 ? "border-amber-400/40" : ""
              }`}
            >
              <p className="text-2xl font-black">{s.count}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
                {s.count > 0 ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> : null}
                {s.label}
              </p>
              <p className="text-xs text-muted">{s.note}</p>
            </a>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Task tracker</p>
        <CompliancePanel tasks={tasks.map((t) => ({
          id: t.id, title: t.title, kind: t.kind, dueDate: t.due_date,
          status: t.status, notes: t.notes, overdue: t.overdue, doneAt: t.done_at,
        }))} />
      </div>
    </div>
  );
}
