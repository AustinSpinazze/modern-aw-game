/**
 * Electron E2E Tests
 *
 * This test suite allows AI agents to verify the Electron app is working correctly.
 * Run with: pnpm test:e2e
 *
 * The tests will:
 * 1. Launch the Electron app
 * 2. Take screenshots for visual verification
 * 3. Test interactions (clicks, inputs)
 * 4. Capture console logs for debugging
 */

import { test, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import path from "path";
import fs from "fs";

// Store console logs for debugging
const consoleLogs: string[] = [];

let electronApp: ElectronApplication;
let page: Page;

test.describe("Electron App", () => {
  test.beforeAll(async () => {
    // Build the Electron app first
    const { execSync } = await import("child_process");
    console.log("Building Electron app...");
    execSync("pnpm build", {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
    });

    // Launch Electron
    console.log("Launching Electron...");
    electronApp = await electron.launch({
      args: [path.resolve(__dirname, "..")],
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
    });

    // Get the first window
    page = await electronApp.firstWindow();

    // Capture console logs
    page.on("console", (msg) => {
      const text = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(text);
      console.log(text);
    });

    // Wait for app to be ready
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000); // Extra time for React to hydrate
  });

  test.afterAll(async () => {
    // Save console logs
    const logsPath = path.resolve(__dirname, "results", "console-logs.txt");
    fs.mkdirSync(path.dirname(logsPath), { recursive: true });
    fs.writeFileSync(logsPath, consoleLogs.join("\n"));

    // Close the app
    await electronApp?.close();
  });

  test("app window opens", async () => {
    const title = await page.title();
    console.log(`Window title: ${title}`);
    expect(title).toBe("Modern AW");
  });

  test("React renders correctly", async () => {
    // Check that the root element has content
    const root = page.locator("#root");
    await expect(root).not.toBeEmpty();

    // Take a screenshot
    await page.screenshot({
      path: path.resolve(__dirname, "results", "01-initial-render.png"),
      fullPage: true,
    });
  });

  test("header displays correctly", async () => {
    const header = page.locator("h1");
    await expect(header).toContainText("Modern AW");
  });

  test("counter increments on click", async () => {
    // Find the counter value
    const counterValue = page.locator(".text-yellow-400");
    const initialValue = await counterValue.textContent();
    console.log(`Initial counter value: ${initialValue}`);

    // Click increment button
    const button = page.locator("button", { hasText: "Increment" });
    await button.click();

    // Verify counter increased
    const newValue = await counterValue.textContent();
    console.log(`New counter value: ${newValue}`);
    expect(Number(newValue)).toBe(Number(initialValue) + 1);

    // Take screenshot after increment
    await page.screenshot({
      path: path.resolve(__dirname, "results", "02-after-increment.png"),
      fullPage: true,
    });
  });

  test("Electron API is available", async () => {
    // Check that electronAPI is exposed
    const hasElectronAPI = await page.evaluate(() => {
      return typeof window.electronAPI !== "undefined";
    });
    expect(hasElectronAPI).toBe(true);

    // Check platform detection
    const platform = await page.evaluate(() => {
      return window.electronAPI?.platform;
    });
    console.log(`Detected platform: ${platform}`);
    expect(platform).toBe("darwin"); // macOS
  });

  test("no console errors", async () => {
    const errors = consoleLogs.filter((log) => log.startsWith("[error]"));
    if (errors.length > 0) {
      console.log("Console errors found:", errors);
    }
    expect(errors.length).toBe(0);
  });
});

// ─── Visual Snapshot Test ─────────────────────────────────────────────────────
// This test takes a full screenshot that AI can analyze

test("visual snapshot for AI verification", async () => {
  const app = await electron.launch({
    args: [path.resolve(__dirname, "..")],
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.waitForTimeout(1500);

  // Take high-quality screenshot
  await window.screenshot({
    path: path.resolve(__dirname, "results", "visual-snapshot.png"),
    fullPage: true,
  });

  // Get page content for text verification
  const textContent = await window.locator("body").textContent();
  fs.writeFileSync(
    path.resolve(__dirname, "results", "page-text.txt"),
    textContent || ""
  );

  await app.close();
});
