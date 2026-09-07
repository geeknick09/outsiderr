"use client";

import { useEffect, useRef } from "react";

/**
 * Swagger UI page.
 *
 * Loads Swagger UI from the official CDN (no npm dependency needed) and
 * points it at the OpenAPI spec served from /api/openapi.json.
 *
 * Users can view all HTTP API routes, schemas, and send test requests
 * directly from the browser.
 */
export default function ApiDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Load CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css";
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);

    // Load Swagger UI Bundle
    const bundleScript = document.createElement("script");
    bundleScript.src = "https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js";
    bundleScript.crossOrigin = "anonymous";
    bundleScript.async = true;

    // Load Standalone Preset
    const presetScript = document.createElement("script");
    presetScript.src = "https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-standalone-preset.js";
    presetScript.crossOrigin = "anonymous";
    presetScript.async = true;

    bundleScript.onload = () => {
      presetScript.onload = () => {
        const w = window as unknown as {
          SwaggerUIBundle?: {
            (config: Record<string, unknown>): void;
            presets: { apis: unknown };
            plugins: { DownloadUrl: unknown };
          };
          SwaggerUIStandalonePreset?: unknown;
          ui?: unknown;
        };
        if (typeof window !== "undefined" && w.SwaggerUIBundle) {
          w.ui = w.SwaggerUIBundle({
            url: "/api/openapi.json",
            dom_id: "#swagger-ui",
            deepLinking: true,
            presets: [w.SwaggerUIBundle.presets.apis, w.SwaggerUIStandalonePreset],
            plugins: [w.SwaggerUIBundle.plugins.DownloadUrl],
            layout: "StandaloneLayout",
            docExpansion: "list",
            filter: true,
            showExtensions: true,
            showCommonExtensions: true,
            tryItOutEnabled: true,
            supportedSubmitMethods: ["get", "post", "put", "delete", "patch"],
          });
        }
      };
      document.body.appendChild(presetScript);
    };

    document.body.appendChild(bundleScript);

    return () => {
      // Cleanup: remove scripts and CSS on unmount
      document.head.removeChild(link);
      if (bundleScript.parentNode) bundleScript.parentNode.removeChild(bundleScript);
      if (presetScript.parentNode) presetScript.parentNode.removeChild(presetScript);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <div
        ref={containerRef}
        className="swagger-ui-wrapper"
        style={{ maxWidth: 1400, margin: "0 auto", padding: 20 }}
      >
        <div id="swagger-ui" />
      </div>
      <style>{`
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info { margin: 40px 0 30px; }
        body { margin: 0; }
      `}</style>
    </div>
  );
}
