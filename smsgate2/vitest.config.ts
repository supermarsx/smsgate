import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", "tests/e2e/**"],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["lib/**/*.ts"]
    }
  }
});
