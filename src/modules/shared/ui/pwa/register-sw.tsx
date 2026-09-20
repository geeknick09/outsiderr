"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // Register immediately — don't wait for load event
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Check for updates every hour
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      })
      .catch(() => {
        // Registration failures are non-fatal
      });

    // Prompt user to refresh when a new SW takes over
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        // Smooth reload — keeps the app feeling instant
        window.location.reload();
      });
    }
  }, []);

  return null;
}
