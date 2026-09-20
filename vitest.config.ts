import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: {
      // "server-only" is a bundler marker for Next's RSC graph — meaningless in
      // vitest (which doesn't split client/server). Stub it so tests can import
      // module barrels that transitively reference server action files.
      "server-only": resolve(__dirname, "tests/stubs/empty.ts"),
      "@": resolve(__dirname, "src"),
    },
  },
});
