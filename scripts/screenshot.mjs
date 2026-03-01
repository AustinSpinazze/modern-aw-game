/**
 * Playwright screenshot helper.
 * Usage: node scripts/screenshot.mjs [output.png] [--zoom X Y W H]
 * Navigates to the local match, waits for Pixi canvas to render, saves screenshot.
 * Optional --zoom crops to the specified pixel region for inspection.
 */
import { chromium } from "playwright";
import { writeFileSync } from "fs";

const args = process.argv.slice(2);
const OUT = args[0] ?? "scripts/map-screenshot.png";
const zoomIdx = args.indexOf("--zoom");
const ZOOM = zoomIdx >= 0
  ? { x: +args[zoomIdx+1], y: +args[zoomIdx+2], w: +args[zoomIdx+3], h: +args[zoomIdx+4] }
  : null;

const URL = "http://localhost:3000/match/local";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

console.log(`Navigating to ${URL} ...`);
await page.goto(URL, { waitUntil: "networkidle" });

// Click "Start Match" on the setup screen
await page.getByRole("button", { name: /start match/i }).click();

// Wait for the Pixi canvas to appear and for tiles to render
await page.waitForSelector("canvas", { timeout: 15000 });
await page.waitForTimeout(3000); // allow Pixi + texture loads to complete

const screenshotOpts = ZOOM
  ? { type: "png", clip: { x: ZOOM.x, y: ZOOM.y, width: ZOOM.w, height: ZOOM.h } }
  : { type: "png" };

const buf = await page.screenshot(screenshotOpts);
writeFileSync(OUT, buf);
console.log(`Screenshot saved → ${OUT}${ZOOM ? ` (clipped to ${ZOOM.w}×${ZOOM.h} at ${ZOOM.x},${ZOOM.y})` : ""}`);

await browser.close();
