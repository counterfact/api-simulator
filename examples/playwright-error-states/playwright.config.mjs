import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  use: {
    baseURL: "http://127.0.0.1:4320",
    browserName: "chromium",
  },
  webServer: [
    {
      command: "npm run api",
      env: {
        CHOKIDAR_USEPOLLING: "1",
        COUNTERFACT_TELEMETRY_DISABLED: "true",
      },
      reuseExistingServer: false,
      url: "http://127.0.0.1:4321/profiles/1",
    },
    {
      command: "npm run dev",
      reuseExistingServer: false,
      url: "http://127.0.0.1:4320",
    },
  ],
});
