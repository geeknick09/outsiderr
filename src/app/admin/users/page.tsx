import { adminToggleAdminAction } from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { listAllAdminUsers } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Users — Outsiderr" };

export default async function AdminUsersPage() {
  const users = await listAllAdminUsers();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Users</h1>
        <p className="text-sm text-muted">{users.length} registered</p>
      </div>

      <div className="space-y-2">
        {users.map((user) => (
          <div key={user.id} className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{user.fullName ?? "—"}</p>
              <p className="text-xs text-muted">
                {user.phone ?? "no phone"} · Joined {formatDateTime(user.createdAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {user.isOrganizer ? <Badge tone="violet">Organizer</Badge> : null}
              {user.isAdmin ? <Badge tone="lime">Admin</Badge> : null}

              <form>
                <button
                  formAction={async () => {
                    "use server";
                    await adminToggleAdminAction(user.id, !user.isAdmin);
                  }}
                  className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-muted transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/10"
                >
                  {user.isAdmin ? "Remove admin" : "Make admin"}
                </button>
              </form>
            </div>
          </div>
        ))}
        {users.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">No users found.</p>
        ) : null}
      </div>
    </div>
  );
}
