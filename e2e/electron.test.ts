/**
 * Electron E2E Tests
 *
 * Verifies the Electron app: setup screen, game flow, Settings, Save/Load API.
 * Run with: pnpm test:e2e
 */

import { test, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import path from "path";
import fs from "fs";

const consoleLogs: string[] = [];

let electronApp: ElectronApplication;
let page: Page;

test.describe("Electron App", () => {
  test.beforeAll(async () => {
    const { execSync } = await import("child_process");
    console.log("Building Electron app...");
    execSync("pnpm build", {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
    });

    console.log("Launching Electron...");
    electronApp = await electron.launch({
      args: [path.resolve(__dirname, "..")],
      env: { ...process.env, NODE_ENV: "production" },
    });

    page = await electronApp.firstWindow();

    page.on("console", (msg) => {
      const text = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(text);
      console.log(text);
    });

    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
  });

  test.afterAll(async () => {
    const logsPath = path.resolve(__dirname, "results", "console-logs.txt");
    fs.mkdirSync(path.dirname(logsPath), { recursive: true });
    fs.writeFileSync(logsPath, consoleLogs.join("\n"));
    await electronApp?.close();
  });

  test("app window opens", async () => {
    const title = await page.title();
    expect(title).toBe("Modern AW");
  });

  test("setup screen renders", async () => {
    await expect(page.locator("#root")).not.toBeEmpty();
    await expect(page.locator("h1")).toContainText("Modern AW");
    await expect(page.locator("button", { hasText: "Start Match" })).toBeVisible();
  });

  test("Electron API is available with save/load and API key methods", async () => {
    const api = await page.evaluate(() => {
      const e = (window as any).electronAPI;
      if (!e) return null;
      return {
        isElectron: e.isElectron,
        platform: e.platform,
        hasSaveGame: typeof e.saveGame === "function",
        hasLoadGame: typeof e.loadGame === "function",
        hasListSaves: typeof e.listSaves === "function",
        hasSaveApiKey: typeof e.saveApiKey === "function",
        hasLoadApiKey: typeof e.loadApiKey === "function",
      };
    });
    expect(api).not.toBeNull();
    expect(api?.isElectron).toBe(true);
    expect(api?.hasSaveGame).toBe(true);
    expect(api?.hasLoadGame).toBe(true);
    expect(api?.hasListSaves).toBe(true);
    expect(api?.hasSaveApiKey).toBe(true);
    expect(api?.hasLoadApiKey).toBe(true);
  });

  test("Settings button opens Settings modal", async () => {
    await page.getByTitle("Settings").click();
    await page.waitForTimeout(500);
    await expect(page.locator("h2", { hasText: "Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Anthropic \(Claude\)/ })).toBeVisible();
    await page.locator("button", { hasText: "Cancel" }).click();
    await page.waitForTimeout(300);
    await expect(page.locator("h2", { hasText: "Settings" })).not.toBeVisible();
  });

  test("Start Match enters game view", async () => {
    await page.locator("button", { hasText: "Start Match" }).click();
    await page.waitForTimeout(3500);

    const canvas = page.locator("canvas");
    await expect(canvas.first()).toBeVisible({ timeout: 5000 });

    await expect(page.locator("button", { hasText: "Exit Game" })).toBeVisible();
    await expect(page.getByRole("button", { name: /End Turn/ })).toBeVisible({ timeout: 3000 });
  });

  test("Save Game button is visible in game (Electron)", async () => {
    const saveBtn = page.locator("aside").getByRole("button", { name: /Save Game|Saved!/ });
    await saveBtn.scrollIntoViewIfNeeded();
    await expect(saveBtn).toBeVisible();
  });

  test("Settings opens from game sidebar", async () => {
    await page.locator("aside").getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(400);
    await expect(page.locator("h2", { hasText: "Settings" })).toBeVisible();
    await page.locator("button", { hasText: "Cancel" }).click();
    await page.waitForTimeout(300);
  });

  test("no console errors during flow", async () => {
    const errors = consoleLogs.filter((log) => log.startsWith("[error]"));
    if (errors.length > 0) {
      console.log("Console errors:", errors);
    }
    expect(errors.length).toBe(0);
  });
});

test("visual snapshot", async () => {
  const app = await electron.launch({
    args: [path.resolve(__dirname, "..")],
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.waitForTimeout(1500);

  await window.screenshot({
    path: path.resolve(__dirname, "results", "visual-snapshot.png"),
    fullPage: true,
  });

  const textContent = await window.locator("body").textContent();
  fs.mkdirSync(path.resolve(__dirname, "results"), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, "results", "page-text.txt"), textContent || "");

  await app.close();
});
