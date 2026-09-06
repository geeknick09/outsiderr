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
}

/**
 * Subscribe to Supabase Realtime Postgres Changes.
 *
 * - Connects on mount, disconnects on unmount (no websocket leaks).
 * - Reconnects when the tab becomes visible again (visibilitychange).
 * - Uses a ref for the callback so the latest closure is always called
 *   without re-subscribing on every render.
 */
export function useRealtime(config: UseRealtimeConfig) {
  const callbackRef = useRef(config.onPayload);
  callbackRef.current = config.onPayload;

  const { channelName, table, event, filter, schema, enabled } = config;

  useEffect(() => {
    if (enabled === false) return;

    const supabase = createClient();
    const channel = supabase.channel(channelName);

    channel.on(
      "postgres_changes",
      {
        event,
        schema: schema ?? "public",
        table,
        ...(filter ? { filter } : {}),
      },
      (payload: { eventType: string; new: unknown; old: unknown }) => {
        callbackRef.current({
          eventType: payload.eventType as RealtimePayload["eventType"],
          new: (payload.new ?? {}) as Record<string, unknown>,
          old: (payload.old ?? {}) as Record<string, unknown>,
        });
      },
    );
    channel.subscribe();

    // Reconnect on tab focus
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        channel.subscribe();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      supabase.removeChannel(channel);
    };
  }, [channelName, table, event, filter, schema, enabled]);
}
