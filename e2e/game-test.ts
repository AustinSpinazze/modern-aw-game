/**
 * Game E2E Test
 *
 * Tests the full game flow: Setup → Start Match → Game Canvas
 * Run with: pnpm test:game
 */

import { _electron as electron } from "playwright";
import path from "path";
import fs from "fs";

const RESULTS_DIR = path.resolve(__dirname, "results");

async function runGameTest() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  console.log("🚀 Launching Electron...");
  const app = await electron.launch({
    args: [path.resolve(__dirname, "..")],
    timeout: 15000,
  });

  const page = await app.firstWindow();
  const errors: string[] = [];

  const allLogs: string[] = [];
  page.on("console", (msg) => {
    const text = `[${msg.type()}] ${msg.text()}`;
    allLogs.push(text);
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    console.error("Page error:", err);
    errors.push(err.message);
  });

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);

  // Take screenshot of setup
  await page.screenshot({
    path: path.join(RESULTS_DIR, "01-setup-screen.png"),
    fullPage: true,
  });
  console.log("📸 Setup screen captured");

  // Click "Start Match"
  console.log("🎮 Starting match...");
  const startButton = page.locator("button", { hasText: "Start Match" });
  await startButton.click();

  // Wait for game to load (data loading + canvas init)
  await page.waitForTimeout(3000);

  // Take screenshot of game
  await page.screenshot({
    path: path.join(RESULTS_DIR, "02-game-view.png"),
    fullPage: true,
  });
  console.log("📸 Game view captured");

  // Verify we're in game view
  const hasGameCanvas = await page.locator("canvas").count() > 0;
  const hasInfoPanel = await page.locator("text=Turn").count() > 0;
  const hasBackButton = await page.locator("button", { hasText: "Back to Setup" }).count() > 0;

  console.log("\n📋 Results:");
  console.log("─".repeat(40));
  console.log(`${hasGameCanvas ? "✅" : "❌"} Game canvas present`);
  console.log(`${hasInfoPanel ? "✅" : "❌"} Info panel visible`);
  console.log(`${hasBackButton ? "✅" : "❌"} Back button present`);
  console.log(`${errors.length === 0 ? "✅" : "❌"} No console errors`);

  if (errors.length > 0) {
    console.log("\n⚠️ Console errors:");
    errors.forEach((e) => console.log(`  - ${e}`));
  }

  // Test interaction: hover over the canvas
  const canvas = page.locator("canvas");
  if (await canvas.count() > 0) {
    const box = await canvas.boundingBox();
    if (box) {
      // Hover over center of canvas
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(500);

      // Take screenshot with hover
      await page.screenshot({
        path: path.join(RESULTS_DIR, "03-game-hover.png"),
        fullPage: true,
      });
      console.log("📸 Game with hover captured");
    }
  }

  // Test "End Turn" button
  const endTurnButton = page.locator("button", { hasText: "End Turn" });
  if (await endTurnButton.count() > 0) {
    console.log("🔄 Clicking End Turn...");
    await endTurnButton.click();
    await page.waitForTimeout(2000); // Wait for AI turn

    await page.screenshot({
      path: path.join(RESULTS_DIR, "04-after-ai-turn.png"),
      fullPage: true,
    });
    console.log("📸 After AI turn captured");
  }

  console.log("─".repeat(40));
  const allPassed = hasGameCanvas && hasInfoPanel && hasBackButton && errors.length === 0;
  console.log(allPassed ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED");

  // Save results
  fs.writeFileSync(
    path.join(RESULTS_DIR, "game-test-result.json"),
    JSON.stringify(
      {
        success: allPassed,
        checks: {
          gameCanvas: hasGameCanvas,
          infoPanel: hasInfoPanel,
          backButton: hasBackButton,
          noErrors: errors.length === 0,
        },
        errors,
      },
      null,
      2
    )
  );

  // Save all console logs for debugging
  fs.writeFileSync(
    path.join(RESULTS_DIR, "console-logs.txt"),
    allLogs.join("\n")
  );
  console.log(`📝 Console logs saved to ${path.join(RESULTS_DIR, "console-logs.txt")}`);
  console.log(`   Total logs: ${allLogs.length}`);

  await app.close();
  process.exit(allPassed ? 0 : 1);
}

runGameTest().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
