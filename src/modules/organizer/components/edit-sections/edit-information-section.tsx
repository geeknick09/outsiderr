"use client";

import { useActionState, useEffect, useState } from "react";
import { CollapsibleSection } from "@/modules/shared";
import { updateEventSectionAction, type UpdateEventSectionState } from "../../actions/events";
import type { EventDetail } from "@/modules/shared";

const INPUT =
  "w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white disabled:opacity-50";

export function EditInformationSection({ event }: { event: EventDetail }) {
  const [state, formAction, pending] = useActionState<UpdateEventSectionState, FormData>(
    updateEventSectionAction,
    { error: null },
  );
  const [isEditing, setIsEditing] = useState(false);
  const [thingsToKnow, setThingsToKnow] = useState(event.thingsToKnow.join("\n"));
  const [terms, setTerms] = useState(event.terms.join("\n"));

  useEffect(() => {
    if (state.saved === "information") setIsEditing(false);
  }, [state.saved]);

  function handleCancel() {
    setThingsToKnow(event.thingsToKnow.join("\n"));
    setTerms(event.terms.join("\n"));
    setIsEditing(false);
  }

  return (
    <CollapsibleSection
      title="Event Information"
      description="Things to know and terms & conditions."
      onEdit={() => setIsEditing(true)}
      isEditing={isEditing}
      onCancel={handleCancel}
      formId="sec-information"
      pending={pending}
      error={state.error}
      saved={state.saved === "information"}
    >
      <form id="sec-information" action={formAction} className="space-y-4">
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="section" value="information" />

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Things to know (one per line)</label>
          <textarea
            name="thingsToKnow"
            rows={4}
            value={thingsToKnow}
            onChange={(e) => setThingsToKnow(e.target.value)}
            readOnly={!isEditing}
            placeholder={"Bring valid ID\nNo outside food"}
            className={INPUT}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Terms & conditions (one per line)</label>
          <textarea
            name="terms"
            rows={4}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            readOnly={!isEditing}
            placeholder={"No refunds after purchase\nEntry closes 30 min before start"}
            className={INPUT}
          />
        </div>
      </form>
    </CollapsibleSection>
  );
}
