"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ButtonVariant, ButtonSize } from "@/components/ui/button";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-neon-gradient text-white hover:shadow-[0_0_20px_rgba(139,92,246,0.5)] focus-visible:ring-violet-neon",
  secondary:
    "border border-zinc-200 bg-white text-zinc-900 hover:border-violet-neon/60 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:border-violet-neon/60",
  ghost:
    "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10",
  danger:
    "border border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-300",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
};

interface SubmitButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  loadingText?: string;
  children: React.ReactNode;
  disabled?: boolean;
  formAction?: (formData: FormData) => void | Promise<void>;
}

/**
 * A submit button that automatically shows a loading spinner when the parent
 * `<form>` is being submitted (via `formAction` or `action`).
 *
 * Uses `useFormStatus()` from `react-dom` — must be rendered inside a `<form>`.
 *
 * Works in both server and client components (this file is "use client").
 */
export function SubmitButton({
  variant = "primary",
  size = "md",
  className,
  loadingText,
  children,
  disabled,
  formAction,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={disabled || pending}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingText ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * Compact action button for inline admin/organizer actions (Approve, Reject, etc.)
 * Automatically shows a spinner when the parent form is submitting.
 *
 * Uses the same styling as the inline action buttons in admin pages.
 */
export function ActionButton({
  className,
  loadingText,
  children,
  disabled,
  formAction,
}: {
  className?: string;
  loadingText?: string;
  children: React.ReactNode;
  disabled?: boolean;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={disabled || pending}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-muted transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {pending ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          {loadingText ?? "…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}
