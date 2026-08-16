import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url),
      ),
    },
  },
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "react",
    },
  },
  test: {
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
