import { adminApproveCommunityAction, adminRejectCommunityAction } from "@/modules/admin/actions/admin";
import { Badge } from "@/modules/shared";
import { ActionButton } from "@/modules/shared";
import { listCommunities, listPendingCommunities } from "@/modules/shared/server";
import { cityLabel } from "@/modules/shared";
import { formatDateTime } from "@/modules/shared";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Communities - Outsiderr" };

export default async function AdminCommunitiesPage() {
  const [pending, verified] = await Promise.all([
    listPendingCommunities(),
    listCommunities(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-black">Communities &amp; Crews</h1>
          <a href="/admin/community-imports" className="rounded-full border border-violet-neon/40 px-3 py-1.5 text-xs font-semibold text-violet-neon hover:bg-violet-neon/10">Member imports</a>
        </div>
        <p className="text-sm text-muted">
          {pending.length} pending approval · {verified.length} live
        </p>
      </div>

      {/* Pending */}
      <section className="space-y-3">
        <h2 className="text-base font-bold">Pending approval</h2>
        {pending.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">No communities pending approval.</p>
        ) : (
          pending.map((community) => (
            <div key={community.id} className="glass flex flex-wrap items-start gap-3 rounded-3xl p-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{community.name}</p>
                  <Badge tone={community.type === "CREW" ? "violet" : "neutral"}>{community.type}</Badge>
                </div>
                <p className="text-xs text-muted">
                  By {community.ownerName}
                  {community.city ? ` · ${cityLabel(community.city)}` : ""}
                  {community.instagramHandle ? ` · ${community.instagramHandle}` : ""}
                </p>
                {community.bio ? (
                  <p className="line-clamp-2 text-xs text-muted">{community.bio}</p>
                ) : null}
                <p className="text-xs text-zinc-400">
                  Membership: {community.membershipType}
                  {community.membershipType === "PRIVATE"
                    ? ` · ₹${(community.membershipFeePaise / 100).toFixed(0)}/mo`
                    : ""}
                </p>
                {community.terms.length > 0 ? (
                  <ul className="list-disc pl-4 text-xs text-muted">
                    {community.terms.slice(0, 3).map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs text-zinc-400">
                  Submitted {formatDateTime(community.createdAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <form>
                  <ActionButton
                    formAction={async () => {
                      "use server";
                      await adminApproveCommunityAction(community.id);
                    }}
                    loadingText="…"
                    className="border-zinc-200 px-3 py-1.5 font-semibold text-muted hover:border-lime-400 hover:text-lime-600 dark:border-white/10"
                  >
                    Approve
                  </ActionButton>
                </form>
                <form>
                  <ActionButton
                    formAction={async () => {
                      "use server";
                      await adminRejectCommunityAction(community.id);
                    }}
                    loadingText="…"
                    className="border-zinc-200 px-3 py-1.5 font-semibold text-muted hover:border-red-400 hover:text-red-500 dark:border-white/10"
                  >
                    Reject
                  </ActionButton>
                </form>
              </div>
            </div>
          ))
        )}
      </section>

      {/* Live communities */}
      <section className="space-y-3">
        <h2 className="text-base font-bold">Live communities</h2>
        {verified.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">No live communities yet.</p>
        ) : (
          verified.map((community) => (
            <div key={community.id} className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{community.name}</p>
                  <Badge tone="success">Live</Badge>
                  <Badge tone={community.type === "CREW" ? "violet" : "neutral"}>{community.type}</Badge>
                </div>
                <p className="text-xs text-muted">
                  {community.ownerName} · {community.memberCount} members
                  {community.city ? ` · ${cityLabel(community.city)}` : ""}
                </p>
              </div>
              <form>
                <ActionButton
                  formAction={async () => {
                    "use server";
                    await adminRejectCommunityAction(community.id);
                  }}
                  loadingText="…"
                  className="border-zinc-200 text-muted hover:border-red-400 hover:text-red-500 dark:border-white/10"
                >
                  Unpublish
                </ActionButton>
              </form>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
