import { adminApproveClubAction, adminRejectClubAction } from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/submit-button";
import { listClubs, listPendingClubs } from "@/lib/data/clubs";
import { CITY_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Clubs — Outsiderr" };

export default async function AdminClubsPage() {
  const [pending, verified] = await Promise.all([
    listPendingClubs(),
    listClubs(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Clubs & Crews</h1>
        <p className="text-sm text-muted">
          {pending.length} pending approval · {verified.length} live
        </p>
      </div>

      {/* Pending */}
      <section className="space-y-3">
        <h2 className="text-base font-bold">Pending approval</h2>
        {pending.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">No clubs pending approval.</p>
        ) : (
          pending.map((club) => (
            <div key={club.id} className="glass flex flex-wrap items-start gap-3 rounded-3xl p-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{club.name}</p>
                  <Badge tone={club.type === "CREW" ? "violet" : "neutral"}>{club.type}</Badge>
                </div>
                <p className="text-xs text-muted">
                  By {club.ownerName}
                  {club.city ? ` · ${CITY_LABELS[club.city]}` : ""}
                  {club.instagramHandle ? ` · ${club.instagramHandle}` : ""}
                </p>
                {club.bio ? (
                  <p className="line-clamp-2 text-xs text-muted">{club.bio}</p>
                ) : null}
                <p className="text-xs text-zinc-400">
                  Membership: {club.membershipType}
                  {club.membershipType === "PAID"
                    ? ` · ₹${(club.membershipFeePaise / 100).toFixed(0)}/mo`
                    : ""}
                </p>
                {club.terms.length > 0 ? (
                  <ul className="list-disc pl-4 text-xs text-muted">
                    {club.terms.slice(0, 3).map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs text-zinc-400">
                  Submitted {formatDateTime(club.createdAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <form>
                  <ActionButton
                    formAction={async () => {
                      "use server";
                      await adminApproveClubAction(club.id);
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
                      await adminRejectClubAction(club.id);
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

      {/* Live clubs */}
      <section className="space-y-3">
        <h2 className="text-base font-bold">Live clubs</h2>
        {verified.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">No live clubs yet.</p>
        ) : (
          verified.map((club) => (
            <div key={club.id} className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{club.name}</p>
                  <Badge tone="success">Live</Badge>
                  <Badge tone={club.type === "CREW" ? "violet" : "neutral"}>{club.type}</Badge>
                </div>
                <p className="text-xs text-muted">
                  {club.ownerName} · {club.memberCount} members
                  {club.city ? ` · ${CITY_LABELS[club.city]}` : ""}
                </p>
              </div>
              <form>
                <ActionButton
                  formAction={async () => {
                    "use server";
                    await adminRejectClubAction(club.id);
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
