"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

import { subscribePushAction, unsubscribePushAction } from "@/actions/push";
import { Button } from "@/components/ui/button";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr = Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
  return arr.buffer as ArrayBuffer;
}

type PermState = "default" | "granted" | "denied" | "unsupported";

export function PushSubscribe() {
  const [state, setState] = useState<PermState>("default");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setState("unsupported");
      return;
    }
    setState(Notification.permission as PermState);
  }, []);

  async function handleEnable() {
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      setState("granted");

      if (!VAPID_PUBLIC_KEY) return; // key not configured, skip subscription

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const sub =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));

      const json = sub.toJSON();
      const keys = json.keys as { p256dh: string; auth: string } | undefined;
      if (json.endpoint && keys?.p256dh && keys?.auth) {
        await subscribePushAction({
          endpoint: json.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        });
      }
    } catch {
      // ignore — user may have blocked or browser unsupported
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await unsubscribePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("default");
    } finally {
      setLoading(false);
    }
  }

  if (state === "unsupported") return null;

  if (state === "denied") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted">
        <BellOff className="h-4 w-4" />
        Notifications blocked. Enable in browser settings.
      </div>
    );
  }

  if (state === "granted") {
    return (
      <Button variant="secondary" size="sm" disabled={loading} onClick={handleDisable}>
        <BellOff className="h-4 w-4" />
        {loading ? "Disabling…" : "Disable notifications"}
      </Button>
    );
  }

  return (
    <Button variant="secondary" size="sm" disabled={loading} onClick={handleEnable}>
      <Bell className="h-4 w-4" />
      {loading ? "Enabling…" : "Enable event notifications"}
    </Button>
  );
}
