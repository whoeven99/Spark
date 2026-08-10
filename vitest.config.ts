import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "app"),
    },
  },
  test: {
    setupFiles: ["tests/setup/hermetic.ts"],
    include: ["tests/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "scripts/**/*.test.cjs",
    ],
  },
});
