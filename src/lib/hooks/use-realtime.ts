"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

export interface RealtimePayload {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

export interface UseRealtimeConfig {
  /** Unique channel name — must be different per subscription */
  channelName: string;
  /** Table name, e.g. "event_notifications" */
  table: string;
  /** Event type to listen for */
  event: "INSERT" | "UPDATE" | "DELETE" | "*";
  /** Optional filter, e.g. "user_id=eq.abc-123" */
  filter?: string;
  /** Schema name, defaults to "public" */
  schema?: string;
  /** Callback when a matching change is received */
  onPayload: (payload: RealtimePayload) => void;
  /** Set to false to disable the subscription (default true) */
  enabled?: boolean;
  /** Debounce callbacks in ms (default 100) to prevent rapid-fire re-renders */
  debounceMs?: number;
}

// Singleton Supabase client — created once, reused across all hooks.
// This prevents a new WebSocket connection per component mount.
let supabaseSingleton: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!supabaseSingleton) {
    supabaseSingleton = createClient();
  }
  return supabaseSingleton;
}

/**
 * Subscribe to Supabase Realtime Postgres Changes.
 *
 * - Uses a singleton Supabase client (one WebSocket, not one per component).
 * - Properly unsubscribes on unmount (await unsubscribe before removeChannel).
 * - Debounces callbacks to prevent rapid-fire re-renders on bulk DB changes.
 * - Reconnects on tab focus only if the channel is not already subscribed.
 */
export function useRealtime(config: UseRealtimeConfig) {
  const callbackRef = useRef(config.onPayload);
  callbackRef.current = config.onPayload;

  const { channelName, table, event, filter, schema, enabled, debounceMs = 100 } = config;

  useEffect(() => {
    if (enabled === false) return;

    const supabase = getSupabase();
    const channel = supabase.channel(channelName);

    // Debounce timer ref
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastPayload: RealtimePayload | null = null;

    channel.on(
      "postgres_changes",
      {
        event,
        schema: schema ?? "public",
        table,
        ...(filter ? { filter } : {}),
      },
      (payload: { eventType: string; new: unknown; old: unknown }) => {
        lastPayload = {
          eventType: payload.eventType as RealtimePayload["eventType"],
          new: (payload.new ?? {}) as Record<string, unknown>,
          old: (payload.old ?? {}) as Record<string, unknown>,
        };
        // Debounce: only fire the callback after the configured quiet period.
        // This prevents rapid-fire re-renders when many rows change at once.
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (lastPayload) {
            callbackRef.current(lastPayload);
            lastPayload = null;
          }
        }, debounceMs);
      },
    );
    channel.subscribe();

    // Reconnect on tab focus — only if not already subscribed
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        // Supabase auto-reconnects; only re-subscribe if the channel dropped
        if (channel.state !== "joined" && channel.state !== "joining") {
          channel.subscribe();
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (debounceTimer) clearTimeout(debounceTimer);
      // Proper cleanup: unsubscribe first, then remove the channel
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [channelName, table, event, filter, schema, enabled, debounceMs]);
}
