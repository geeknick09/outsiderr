import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Module-dependency direction (enforced via per-module overrides below).
// shared is the lowest layer — it may import NO sibling module (keeps it
// extractable to packages/* and prevents cycles). Everything else may only
// reach across module lines through public entries (index/server/actions).

const DEEP_INTERNALS = {
  group: [
    "@/modules/*/components/*",
    "@/modules/*/data/*",
    "@/modules/*/lib/*",
    "@/modules/*/ui/*",
    "@/modules/*/hooks/*",
    "@/modules/*/offline/*",
  ],
  message:
    "Import from the module's index.ts / server.ts / actions/* only — deep internals are private (see docs/architecture.md §3).",
};

const LEGACY = {
  group: ["@/lib/*", "@/components/*", "@/actions/*"],
  message: "Legacy path — use @/modules/<domain> (see docs/rules.md §3).",
};

// modules that `files` module must NOT import (siblings it doesn't depend on).
const FORBIDDEN = {
  "src/modules/shared/**": ["@/modules/web/*", "@/modules/organizer/*", "@/modules/admin/*", "@/modules/scanner/*", "@/modules/analytics/*", "@/modules/campaigns/*", "@/modules/web", "@/modules/organizer", "@/modules/admin", "@/modules/scanner", "@/modules/analytics", "@/modules/campaigns"],
  "src/modules/analytics/**": ["@/modules/web/*", "@/modules/organizer/*", "@/modules/admin/*", "@/modules/scanner/*", "@/modules/campaigns/*", "@/modules/web", "@/modules/organizer", "@/modules/admin", "@/modules/scanner", "@/modules/campaigns"],
  "src/modules/web/**": ["@/modules/organizer/*", "@/modules/admin/*", "@/modules/scanner/*", "@/modules/analytics/*", "@/modules/campaigns/*", "@/modules/organizer", "@/modules/admin", "@/modules/scanner", "@/modules/analytics", "@/modules/campaigns"],
  "src/modules/organizer/**": ["@/modules/web/*", "@/modules/admin/*", "@/modules/scanner/*", "@/modules/campaigns/*", "@/modules/web", "@/modules/admin", "@/modules/scanner", "@/modules/campaigns"],
  "src/modules/scanner/**": ["@/modules/web/*", "@/modules/organizer/*", "@/modules/admin/*", "@/modules/analytics/*", "@/modules/campaigns/*", "@/modules/web", "@/modules/organizer", "@/modules/admin", "@/modules/analytics", "@/modules/campaigns"],
  "src/modules/admin/**": ["@/modules/web/*", "@/modules/organizer/*", "@/modules/scanner/*", "@/modules/campaigns/*", "@/modules/web", "@/modules/organizer", "@/modules/scanner", "@/modules/campaigns"],
  "src/modules/campaigns/**": ["@/modules/web/*", "@/modules/organizer/*", "@/modules/admin/*", "@/modules/scanner/*", "@/modules/analytics/*", "@/modules/web", "@/modules/organizer", "@/modules/admin", "@/modules/scanner", "@/modules/analytics"],
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Module boundary enforcement (Phase R). Cross-module code may only be
  // imported through public entry points — `@/modules/<m>` (index),
  // `@/modules/<m>/server`, or `@/modules/<m>/actions/<file>`. Deep imports
  // into another module's internals are banned. Legacy `src/{lib,components,
  // actions}` paths are banned (dirs deleted in Phase R).
  {
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [DEEP_INTERNALS, LEGACY] },
      ],
    },
  },

  // Direction enforcement — per-module overrides ban importing sibling modules
  // the file isn't allowed to depend on. (app/ + src/middleware.ts are the
  // composition root and may import any module's public entry.)
  ...Object.entries(FORBIDDEN).map(([files, banned]) => ({
    files: [files],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [DEEP_INTERNALS, LEGACY, { group: banned, message: "Cross-module direction violation — see docs/architecture.md §3 dependency rules." }] },
      ],
    },
  })),
];

export default eslintConfig;
