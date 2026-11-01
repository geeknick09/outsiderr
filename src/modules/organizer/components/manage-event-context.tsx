"use client";

import { createContext, useCallback, useContext, useState } from "react";

/**
 * Lets edit-section forms publish just-saved event fields so page-level UI
 * (the manage header) shows them instantly — before router.refresh() swaps
 * in the fresh server props (which produced a visible old→new flash).
 */
const EditsCtx = createContext<{
  overrides: Record<string, unknown>;
  patch: (p: Record<string, unknown>) => void;
} | null>(null);

export function EventEditsProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});
  const patch = useCallback(
    (p: Record<string, unknown>) => setOverrides((o) => ({ ...o, ...p })),
    [],
  );
  return <EditsCtx.Provider value={{ overrides, patch }}>{children}</EditsCtx.Provider>;
}

/** null outside a provider — sections can call it unconditionally. */
export function useEventEdits() {
  return useContext(EditsCtx);
}
