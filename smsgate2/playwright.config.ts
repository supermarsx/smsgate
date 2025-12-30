import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    trace: "on-first-retry"
  },
  webServer: {
    command: "bun --bun next dev --hostname 0.0.0.0 --port 3000",
    port: 3000,
    reuseExistingServer: true,
    env: {
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000/api/v1",
      NEXT_PUBLIC_WS_ORIGIN: "http://localhost:4000",
      NEXT_PUBLIC_WS_PATH: "/api/v1/ws"
    }
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
