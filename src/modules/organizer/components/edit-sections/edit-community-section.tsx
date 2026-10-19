"use client";

import { useActionState, useEffect, useState } from "react";
import { CollapsibleSection } from "@/modules/shared";
import { updateEventSectionAction, type UpdateEventSectionState } from "../../actions/events";
import type { Community, EventDetail } from "@/modules/shared";

const VISIBILITY_LABEL: Record<string, string> = {
  OPEN: "Open - anyone can book",
  MEMBERS_ONLY: "Members only - only community members can book",
  INVITE_ONLY: "Invite only - hidden, join via your invite link",
};

export function EditCommunitySection({
  event,
  communities,
  lockLogistics = false,
}: {
  event: EventDetail;
  communities: Community[];
  lockLogistics?: boolean;
}) {
  const [state, formAction, pending] = useActionState<UpdateEventSectionState, FormData>(
    updateEventSectionAction,
    { error: null },
  );
  const [isEditing, setIsEditing] = useState(false);
  const [communityId, setCommunityId] = useState(event.communityId ?? "");
  const [visibility, setVisibility] = useState<string>(event.visibility ?? "OPEN");

  useEffect(() => {
    if (state.saved === "community") setIsEditing(false);
  }, [state.saved]);

  function handleCancel() {
    setCommunityId(event.communityId ?? "");
    setVisibility(event.visibility ?? "OPEN");
    setIsEditing(false);
  }

  const currentCommunity = communities.find((c) => c.id === event.communityId);

  return (
    <CollapsibleSection
      title="Community"
      description={
        currentCommunity
          ? `Part of ${currentCommunity.name} - ${VISIBILITY_LABEL[event.visibility ?? "OPEN"]}`
          : "Public event - not linked to a community."
      }
      onEdit={() => setIsEditing(true)}
      isEditing={isEditing}
      onCancel={handleCancel}
      formId="sec-community"
      pending={pending}
      disabled={lockLogistics}
      error={state.error}
      saved={state.saved === "community"}
    >
      <form id="sec-community" action={formAction} className="space-y-4">
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="section" value="community" />

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Attach to</span>
          <select
            name="communityId"
            value={communityId}
            onChange={(e) => setCommunityId(e.target.value)}
            disabled={!isEditing}
            className="w-full rounded-2xl border border-zinc-200 bg-transparent px-3 py-2.5 text-sm disabled:opacity-70 dark:border-white/10"
          >
            <option value="">Public event - no community</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {communityId ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Who can book</span>
            <select
              name="visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              disabled={!isEditing}
              className="w-full rounded-2xl border border-zinc-200 bg-transparent px-3 py-2.5 text-sm disabled:opacity-70 dark:border-white/10"
            >
              {Object.entries(VISIBILITY_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            <span className="block text-[10px] text-muted">
              Invite-only links are managed from the event&apos;s share menu.
            </span>
          </label>
        ) : (
          <input type="hidden" name="visibility" value="OPEN" />
        )}

        {isEditing && (
          <p className="text-[11px] text-muted">
            Members of the selected community see this event on their community page. Switching
            communities moves the event instantly.
          </p>
        )}
      </form>
    </CollapsibleSection>
  );
}
