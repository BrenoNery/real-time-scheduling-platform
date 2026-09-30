import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run start --workspace=@repo/api",
      cwd: repoRoot,
      url: "http://127.0.0.1:3333/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npm run start --workspace=@repo/web",
      cwd: repoRoot,
      url: "http://127.0.0.1:3000/book",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
