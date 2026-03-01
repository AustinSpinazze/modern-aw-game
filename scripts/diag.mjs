/**
 * Diagnostic: verify sub-texture creation works correctly.
 * Runs the game, captures console output, and takes a screenshot.
 */
import { chromium } from "playwright";
import { writeFileSync } from "fs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

const logs = [];
page.on("console", (msg) => logs.push(msg.text()));
page.on("pageerror", (err) => logs.push("PAGE_ERROR: " + err.message));

await page.goto("http://localhost:3000/match/local", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /start match/i }).click();
await page.waitForSelector("canvas", { timeout: 15000 });
await page.waitForTimeout(4000);

// Inject a diagnostic check into the page
const diagResult = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  return {
    canvasExists: !!canvas,
    canvasWidth: canvas?.width ?? 0,
    canvasHeight: canvas?.height ?? 0,
  };
});
console.log("Canvas info:", JSON.stringify(diagResult));
console.log("Relevant logs:");
for (const l of logs) {
  if (l.includes("createSubTexture") || l.includes("DIAG") || l.includes("PAGE_ERROR") || l.includes("warn") || l.includes("Could not")) {
    console.log("  |", l);
  }
}

// Screenshot
const buf = await page.screenshot({ type: "png" });
writeFileSync("scripts/diag-screenshot.png", buf);
console.log("Screenshot saved to scripts/diag-screenshot.png");

await browser.close();
