"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, X, Check } from "lucide-react";
import { cn } from "@/modules/shared";

interface CollapsibleSectionProps {
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
    <div className="rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-t-2xl px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/5"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{title}</span>
          {isEditing && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-neon">
              Editing
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onEdit && !isEditing && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="rounded-lg p-1 text-muted hover:text-violet-neon"
              aria-label="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {isEditing && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel?.();
                }}
                className="rounded-lg p-1 text-muted hover:text-red-500"
                aria-label="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSave?.();
                }}
                className="rounded-lg p-1 text-muted hover:text-emerald-500"
                aria-label="Save"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </>
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
          {children}
        </div>
      )}
    </div>
  );
}
