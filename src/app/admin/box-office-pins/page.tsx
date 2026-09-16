import { Store } from "lucide-react";

import { listAllBoxOfficePins } from "@/lib/data/box-office-pins";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Box Office PINs — Outsiderr" };

export default async function AdminBoxOfficePinsPage() {
  const pins = await listAllBoxOfficePins();

  const activePins = pins.filter((p) => p.isActive);
  const inactivePins = pins.filter((p) => !p.isActive);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Store className="h-6 w-6 text-violet-neon" />
        <h1 className="text-2xl font-black tracking-tight">Box Office PINs</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="glass rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-violet-neon">{pins.length}</p>
          <p className="text-[10px] text-muted">Total PINs</p>
        </div>
        <div className="glass rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-lime-neon">{activePins.length}</p>
          <p className="text-[10px] text-muted">Active</p>
        </div>
        <div className="glass rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-muted">{inactivePins.length}</p>
          <p className="text-[10px] text-muted">Revoked</p>
        </div>
        <div className="glass rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-amber-500">
            {activePins.filter((p) => p.lastUsedAt).length}
          </p>
          <p className="text-[10px] text-muted">Used</p>
        </div>
      </div>

      {pins.length === 0 ? (
        <p className="glass rounded-3xl p-5 text-sm text-muted">
          No box office PINs have been generated yet.
        </p>
      ) : (
        <div className="space-y-3">
          {activePins.map((pin) => (
            <div key={pin.id} className="glass rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{pin.staffName}</p>
                  <p className="text-xs text-muted">
                    Event: {pin.eventTitle ?? pin.eventId.slice(0, 8)}
                  </p>
                  <p className="mt-1 font-mono text-lg font-black tracking-widest text-violet-neon">
                    {pin.pinCode}
                  </p>
                </div>
                <div className="text-right text-xs text-muted">
                  <p className="font-semibold text-violet-neon">{pin.role}</p>
                  {pin.lastUsedAt ? (
                    <p>Last used: {formatDateTime(pin.lastUsedAt)}</p>
                  ) : (
                    <p>Never used</p>
                  )}
                  <p>Created: {formatDateTime(pin.createdAt)}</p>
                </div>
              </div>
            </div>
          ))}

          {inactivePins.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted hover:text-violet-neon">
                Revoked PINs ({inactivePins.length})
              </summary>
              <div className="mt-2 space-y-1">
                {inactivePins.map((pin) => (
                  <div key={pin.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 dark:bg-white/5">
                    <span className="text-muted line-through">{pin.staffName}</span>
                    <span className="font-mono text-muted line-through">{pin.pinCode}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}
    </div>
  );
}
