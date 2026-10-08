"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, X, Loader2 } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  onEdit?: () => void;
  isEditing?: boolean;
  onCancel?: () => void;
  /** When set, the save button submits the form with this id (form lives in children). */
  formId?: string;
  pending?: boolean;
  disabled?: boolean;
  error?: string | null;
  saved?: boolean;
}

export function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  children,
  onEdit,
  isEditing = false,
  onCancel,
  formId,
  pending = false,
  disabled = false,
  error = null,
  saved = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-t-2xl px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/5"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-bold">{title}</span>
          {isEditing && (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-violet-neon">
              Editing
            </span>
          )}
          {saved && !isEditing && (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-500">
              Saved
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onEdit && !isEditing && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
                onEdit();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  setOpen(true);
                  onEdit();
                }
              }}
              className="rounded-lg p-1 text-muted hover:text-violet-neon"
              aria-label="Edit section"
            >
              <Pencil className="h-3.5 w-3.5" />
            </span>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted" />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-200 p-4 dark:border-white/10">
          {description ? (
            <p className="mb-3 text-xs text-muted">{description}</p>
          ) : null}
          {children}
          {error ? (
            <p className="mt-3 text-xs font-semibold text-red-500">{error}</p>
          ) : null}
          {isEditing ? (
            <div className="mt-4 flex items-center gap-2">
              <button
                type={formId ? "submit" : "button"}
                form={formId}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-full bg-neon-gradient px-4 py-1.5 text-xs font-semibold text-white shadow-glow-violet disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {pending ? "Saving…" : "Save section"}
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={pending}
                className="flex items-center gap-1 rounded-full border border-zinc-200 px-4 py-1.5 text-xs font-semibold text-muted hover:border-red-500 hover:text-red-500 disabled:opacity-50 dark:border-white/10"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
