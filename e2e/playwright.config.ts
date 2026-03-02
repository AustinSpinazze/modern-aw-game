import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  timeout: 30000,
  retries: 0,
  use: {
    // Capture screenshots on failure
    screenshot: "only-on-failure",
    // Capture trace on failure for debugging
    trace: "retain-on-failure",
  },
  // Output directory for screenshots and traces
  outputDir: "./results",
  // Reporter for CI-friendly output
  reporter: [["list"], ["html", { outputFolder: "./results/html-report" }]],
});
