"use client";

import { useState } from "react";
import { CollapsibleSection } from "@/modules/shared";
import { CATEGORIES } from "@/modules/shared";
import { cn } from "@/modules/shared";

interface EditDetailsSectionProps {
  event: {
    title: string;
    description: string;
    category: string;
    categories?: string[];
  };
  lockLogistics?: boolean;
  onDirtyChange: () => void;
}

export function EditDetailsSection({ event, lockLogistics, onDirtyChange }: EditDetailsSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    (event.categories ?? [event.category]) as string[],
  );

  function handleSave() {
    setIsEditing(false);
    onDirtyChange();
  }

  function handleCancel() {
    setTitle(event.title);
    setDescription(event.description);
    setSelectedCategories((event.categories ?? [event.category]) as string[]);
    setIsEditing(false);
  }

  return (
    <CollapsibleSection
      title="Event Details"
      defaultOpen={false}
      onEdit={() => setIsEditing(true)}
      isEditing={isEditing}
      onCancel={handleCancel}
      onSave={handleSave}
      disabled={lockLogistics}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-muted mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!isEditing}
            className="w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted mb-1.5">About the event</label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!isEditing}
            className="w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted mb-1.5">Categories</label>
          <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
            {CATEGORIES.filter((c) => c.value !== "ALL").map((cat) => {
              const isSelected = selectedCategories.includes(cat.value as string);
              return (
                <label
                  key={cat.value}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                    isSelected
                      ? "border-violet-neon bg-violet-neon/15 text-violet-neon"
                      : "border-zinc-200 text-zinc-600 hover:border-violet-neon/50 dark:border-white/10 dark:text-zinc-300",
                    !isEditing && "pointer-events-none opacity-70",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCategories([...selectedCategories, cat.value as string]);
                      } else {
                        setSelectedCategories(selectedCategories.filter((c) => c !== cat.value));
                      }
                    }}
                    disabled={!isEditing}
                    className="hidden"
                  />
                  {cat.label}
                </label>
              );
            })}
          </div>
        </div>

        {/* Hidden form fields for submission */}
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="description" value={description} />
        {selectedCategories.map((cat) => (
          <input key={cat} type="hidden" name="categories" value={cat} />
        ))}
        <input type="hidden" name="category" value={selectedCategories[0] || ""} />
      </div>
    </CollapsibleSection>
  );
}
