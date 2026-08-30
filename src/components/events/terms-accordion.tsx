"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export function TermsAccordion({ terms }: { terms: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass rounded-3xl">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <span className="text-base font-bold">Terms &amp; Conditions</span>
        <ChevronDown
          className={cn("h-5 w-5 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <ul className="animate-fade-in space-y-3 border-t border-zinc-200 p-5 text-sm text-muted dark:border-white/10">
          {terms.map((term) => (
            <li key={term} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-neon" />
              <span>{term}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
