"use client";

import { useActionState, useEffect, useState } from "react";
import { CollapsibleSection, CATEGORIES, cn } from "@/modules/shared";
import { updateEventSectionAction, type UpdateEventSectionState } from "../../actions/events";
import type { EventDetail } from "@/modules/shared";

const INPUT =
  "w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white disabled:opacity-50";

export function EditDetailsSection({ event, lockLogistics = false }: { event: EventDetail; lockLogistics?: boolean }) {
  const [state, formAction, pending] = useActionState<UpdateEventSectionState, FormData>(
    updateEventSectionAction,
    { error: null },
  );
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [tags, setTags] = useState(event.tags.join(", "));
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    (event.categories?.length ? event.categories : [event.category]) as string[],
  );

  useEffect(() => {
    if (state.saved === "details") setIsEditing(false);
  }, [state.saved]);

  function handleCancel() {
    setTitle(event.title);
    setDescription(event.description);
    setTags(event.tags.join(", "));
    setSelectedCategories((event.categories?.length ? event.categories : [event.category]) as string[]);
    setIsEditing(false);
  }

  return (
    <CollapsibleSection
      title="Event Details"
      description="Title, about, categories and tags."
      onEdit={() => setIsEditing(true)}
      isEditing={isEditing}
      onCancel={handleCancel}
      formId="sec-details"
      pending={pending}
      disabled={lockLogistics}
      error={state.error}
      saved={state.saved === "details"}
    >
      <form id="sec-details" action={formAction} className="space-y-4">
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="section" value="details" />

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Title</label>
          <input
            name="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            readOnly={!isEditing}
            required
            className={INPUT}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">About the event</label>
          <textarea
            name="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            readOnly={!isEditing}
            className={INPUT}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Categories</label>
          <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
            {CATEGORIES.filter((c) => c.value !== "ALL").map((cat) => {
              const isSelected = selectedCategories.includes(cat.value as string);
              return (
                <button
                  type="button"
                  key={cat.value}
                  disabled={!isEditing}
                  onClick={() =>
                    setSelectedCategories((prev) =>
                      isSelected ? prev.filter((c) => c !== cat.value) : [...prev, cat.value as string],
                    )
                  }
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                    isSelected
                      ? "border-violet-neon bg-violet-neon/15 text-violet-neon"
                      : "border-zinc-200 text-zinc-600 hover:border-violet-neon/50 dark:border-white/10 dark:text-zinc-300",
                    !isEditing && "cursor-default opacity-70",
                  )}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
          {selectedCategories.map((cat) => (
            <input key={cat} type="hidden" name="categories" value={cat} />
          ))}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Tags (comma separated)</label>
          <input
            name="tags"
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            readOnly={!isEditing}
            placeholder="live music, rooftop, techno"
            className={INPUT}
          />
        </div>
      </form>
    </CollapsibleSection>
  );
}
