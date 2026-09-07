"use client";

import { useEffect } from "react";

/**
 * Global error boundary — catches errors that escape the root layout.
 * This is the last-resort error boundary in Next.js App Router.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            textAlign: "center",
            background: "#0A0A0E",
            color: "#fff",
          }}
        >
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            Something went wrong
          </h2>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", opacity: 0.6 }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.625rem 1.25rem",
              borderRadius: "9999px",
              background: "#8b5cf6",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
