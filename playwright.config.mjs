import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.mjs",
  globalSetup: "./tests/global-setup.mjs",
  use: {
    baseURL: "http://localhost:3010",
    viewport: { width: 1440, height: 1000 },
    permissions: ["camera", "microphone"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3010",
    url: "http://localhost:3010",
    reuseExistingServer: false,
    env: { SPEECH_ENGINE_URL: "http://127.0.0.1:8011" },
    timeout: 60000,
  },
  workers: 1,
  timeout: 240000,
  expect: { timeout: 25000 },
});
