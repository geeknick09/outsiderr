import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Module boundary enforcement (Phase R).
  // Rule: cross-module code may only be imported through a module's public
  // entry points — `@/modules/<m>` (index), `@/modules/<m>/server`, or
  // `@/modules/<m>/actions/<file>` (server actions are imported by direct path).
  // Deep imports into another module's internals are banned.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
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
            },
            // Legacy paths — enabled in Phase R8 once src/{lib,components,actions} are gone.
            // {
            //   group: ["@/lib/*", "@/components/*", "@/actions/*"],
            //   message: "Legacy path — use @/modules/<domain> (see docs/rules.md §3).",
            // },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
