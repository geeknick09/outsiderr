import { adminToggleAdminAction } from "@/actions/admin";
import { UserAnalyticsExport } from "@/components/admin/user-analytics-export";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/submit-button";
import { getUserAnalytics, listAllAdminUsers } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Users — Outsiderr" };

export default async function AdminUsersPage() {
  const [users, analytics] = await Promise.all([
    listAllAdminUsers(),
    getUserAnalytics(),
  ]);

  const stats = [
    { label: "Total Users", value: analytics.totalUsers },
    { label: "Active Users", value: analytics.activeUsers, sub: "with confirmed orders" },
    { label: "Organizers", value: analytics.organizersCount },
    { label: "DAU", value: analytics.dau, sub: "active today" },
    { label: "MAU", value: analytics.mau, sub: "active in 30 days" },
    { label: "Returning", value: analytics.returningUsers, sub: "2+ orders" },
    { label: "Non-Returning", value: analytics.nonReturningUsers, sub: "1 order only" },
    { label: "New This Month", value: analytics.newUsersThisMonth },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Users</h1>
          <p className="text-sm text-muted">{users.length} registered · {analytics.organizersCount} organizers</p>
        </div>
        <UserAnalyticsExport analytics={analytics} users={users} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="glass rounded-2xl p-4">
            <p className="text-xs text-muted">{stat.label}</p>
            <p className="text-2xl font-black">{stat.value}</p>
            {stat.sub ? <p className="text-xs text-muted">{stat.sub}</p> : null}
          </div>
        ))}
      </div>

      {/* New users today banner */}
      {analytics.newUsersToday > 0 ? (
        <div className="glass rounded-2xl border border-emerald-500/30 p-4">
          <p className="text-sm font-bold text-emerald-500">
            {analytics.newUsersToday} new user{analytics.newUsersToday === 1 ? "" : "s"} joined today
          </p>
        </div>
      ) : null}

      {/* Users list */}
      <div className="space-y-2">
        <h2 className="text-lg font-bold">All Users</h2>
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
                <ActionButton
                  formAction={async () => {
                    "use server";
                    await adminToggleAdminAction(user.id, !user.isAdmin);
                  }}
                  loadingText="…"
                  className="border-zinc-200 text-muted transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/10"
                >
                  {user.isAdmin ? "Remove admin" : "Make admin"}
                </ActionButton>
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
