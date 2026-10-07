"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, X, Check } from "lucide-react";

interface CollapsibleSectionProps {
  id?: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  onEdit?: () => void;
  isEditing?: boolean;
  onCancel?: () => void;
  onSave?: () => void;
  disabled?: boolean;
}

export function CollapsibleSection({
  id,
  title,
  defaultOpen = false,
  children,
  onEdit,
  isEditing = false,
  onCancel,
  onSave,
  disabled = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div id={id} className="scroll-mt-36 rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
      <div className="flex items-center justify-between rounded-t-2xl px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-white/5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="text-sm font-bold">{title}</span>
          {isEditing && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-neon">
              Editing
            </span>
          )}
        </button>
        <div className="ml-2 flex shrink-0 items-center gap-2">
          {onEdit && !isEditing && !disabled && (
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                onEdit();
              }}
              className="rounded-lg p-1 text-muted hover:text-violet-neon"
              aria-label={`Edit ${title}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {isEditing && (
            <>
              <button
                type="button"
                onClick={() => onCancel?.()}
                className="rounded-lg p-1 text-muted hover:text-red-500"
                aria-label={`Cancel editing ${title}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onSave?.()}
                className="rounded-lg p-1 text-muted hover:text-emerald-500"
                aria-label={`Save ${title}`}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="rounded p-1 text-muted"
          >
            {open ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-zinc-200 p-4 dark:border-white/10">
          {children}
        </div>
      )}
    </div>
  );
}
