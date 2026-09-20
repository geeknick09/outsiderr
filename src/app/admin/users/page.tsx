import { adminToggleAdminAction } from "@/actions/admin";
import { UserAnalyticsExport } from "@/components/admin/user-analytics-export";
import { Badge } from "@/modules/shared";
import { ActionButton } from "@/modules/shared";
import { getUserAnalytics } from "@/modules/analytics/server";
import { listAllAdminUsers } from "@/modules/admin/server";
import { formatDateTime } from "@/modules/shared";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Users — Outsiderr" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const [users, analytics] = await Promise.all([
    listAllAdminUsers(),
    getUserAnalytics(),
  ]);

  const pageSize = 20;
  const pageNumber = Math.max(1, Number(page ?? 1) || 1);
  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  const safePage = Math.min(pageNumber, totalPages);
  const pageUsers = users.slice((safePage - 1) * pageSize, safePage * pageSize);

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
        {pageUsers.map((user) => (
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

      {users.length > pageSize ? (
        <div className="flex items-center justify-between gap-3 rounded-3xl border border-zinc-200 bg-white/50 p-3 text-xs dark:border-white/10 dark:bg-white/5">
          <a
            href={buildUsersPageHref(safePage - 1)}
            className={`rounded-full border px-3 py-1.5 font-semibold ${safePage <= 1 ? "pointer-events-none opacity-50" : "border-zinc-200 text-muted hover:border-violet-neon dark:border-white/10"}`}
          >
            Previous
          </a>
          <span className="text-muted">Page {safePage} of {totalPages}</span>
          <a
            href={buildUsersPageHref(safePage + 1)}
            className={`rounded-full border px-3 py-1.5 font-semibold ${safePage >= totalPages ? "pointer-events-none opacity-50" : "border-zinc-200 text-muted hover:border-violet-neon dark:border-white/10"}`}
          >
            Next
          </a>
        </div>
      ) : null}
    </div>
  );
}

function buildUsersPageHref(page: number) {
  if (page <= 1) return "/admin/users";
  return `/admin/users?page=${page}`;
}
