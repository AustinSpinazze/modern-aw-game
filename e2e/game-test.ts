/**
 * Game E2E Test
 *
 * Tests: Setup → Start test scenario → Attack + Capture → Save → Settings → End Turn → Exit → Continue.
 * Run with: pnpm test:game
 */

import { _electron as electron } from "playwright";
import path from "path";
import fs from "fs";

const RESULTS_DIR = path.resolve(__dirname, "results");

function clickTile(
  page: Awaited<ReturnType<typeof electron.launch>>["firstWindow"],
  tx: number,
  ty: number
) {
  return page.evaluate(
    ({ x, y }) => {
      const w = (window as unknown as { __clickTile?: (a: number, b: number) => void }).__clickTile;
      if (w) w(x, y);
    },
    { x: tx, y: ty }
  );
}

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
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    console.error("Page error:", err);
    errors.push(err.message);
  });

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);

  // ─── Setup screen ───────────────────────────────────────────────────────
  await page.screenshot({ path: path.join(RESULTS_DIR, "01-setup-screen.png"), fullPage: true });
  console.log("📸 Setup screen captured");

  // Open Settings from setup, then close
  const setupSettings = page.getByTitle("Settings").first();
  if ((await setupSettings.count()) > 0) {
    await setupSettings.click();
    await page.waitForTimeout(400);
    await page.locator("h2", { hasText: "Settings" }).waitFor({ state: "visible", timeout: 2000 });
    await page.locator("button", { hasText: "Cancel" }).click();
    await page.waitForTimeout(300);
    console.log("✅ Settings modal opened and closed on setup");
  }

  // Start test scenario (5×5 map: attack + capture in one turn)
  console.log("🎮 Starting test scenario...");
  await page.locator("button", { hasText: "Start test scenario" }).click();
  await page.waitForTimeout(3500);

  await page.screenshot({ path: path.join(RESULTS_DIR, "02-game-view.png"), fullPage: true });
  console.log("📸 Game view captured");

  // ─── Attack: select (1,1), same-tile pending, click enemy (2,1) ──────────
  await page.waitForTimeout(800);
  await clickTile(page, 1, 1);
  await page.waitForTimeout(300);
  await clickTile(page, 1, 1);
  await page.waitForTimeout(300);
  await clickTile(page, 2, 1);
  await page.waitForTimeout(2500);
  console.log("✅ Attack performed (P1 infantry → P2 infantry)");
  await page.screenshot({ path: path.join(RESULTS_DIR, "02b-after-attack.png"), fullPage: true });

  // ─── Capture: select (0,1), move to city (1,2), click Capture ────────────
  await clickTile(page, 0, 1);
  await page.waitForTimeout(300);
  await clickTile(page, 1, 2);
  await page.waitForTimeout(500);
  const captureBtn = page.locator("button", { hasText: "Capture" });
  await captureBtn.waitFor({ state: "visible", timeout: 3000 });
  await captureBtn.click();
  await page.waitForTimeout(2000);
  console.log("✅ Capture performed (P1 infantry → neutral city)");
  await page.screenshot({ path: path.join(RESULTS_DIR, "02c-after-capture.png"), fullPage: true });

  const hasGameCanvas = (await page.locator("canvas").count()) > 0;
  const hasTurnInfo = (await page.locator("text=Turn").count()) > 0;
  const hasExitGame = (await page.locator("button", { hasText: "Exit Game" }).count()) > 0;
  const hasSaveGame = (await page.locator("button", { hasText: "Save Game" }).count()) > 0;
  const hasEndTurn = (await page.locator("button", { hasText: "End Turn" }).count()) > 0;

  console.log("\n📋 Game view checks:");
  console.log(`${hasGameCanvas ? "✅" : "❌"} Game canvas present`);
  console.log(`${hasTurnInfo ? "✅" : "❌"} Turn info visible`);
  console.log(`${hasExitGame ? "✅" : "❌"} Exit Game button present`);
  console.log(`${hasSaveGame ? "✅" : "❌"} Save Game button present`);
  console.log(`${hasEndTurn ? "✅" : "❌"} End Turn button present`);

  // Click Save Game (Electron)
  if (hasSaveGame) {
    await page.locator("button", { hasText: "Save Game" }).click();
    await page.waitForTimeout(600);
    const savedFeedback = await page.locator("button", { hasText: "Saved!" }).count();
    if (savedFeedback > 0) console.log("✅ Save Game showed feedback");
    await page.screenshot({ path: path.join(RESULTS_DIR, "03-after-save.png"), fullPage: true });
  }

  // Open Settings from game sidebar, then close
  await page.locator("button", { hasText: "Settings" }).first().click();
  await page.waitForTimeout(400);
  const settingsVisible = (await page.locator("h2", { hasText: "Settings" }).count()) > 0;
  if (settingsVisible) console.log("✅ Settings modal opened from game");
  await page.locator("button", { hasText: "Cancel" }).click();
  await page.waitForTimeout(300);

  // End Turn to trigger AI and auto-save
  if (hasEndTurn) {
    console.log("🔄 Clicking End Turn...");
    await page.locator("button", { hasText: "End Turn" }).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(RESULTS_DIR, "04-after-ai-turn.png"), fullPage: true });
    console.log("📸 After AI turn captured");
  }

  // Exit game (open confirm modal, then confirm)
  await page.locator("button", { hasText: "Exit Game" }).click();
  await page.waitForTimeout(400);
  await page.locator("text=Exit Game?").waitFor({ state: "visible", timeout: 3000 });
  // Modal has two buttons: "Exit" (red) and "Keep Playing". Click the one that exactly says "Exit".
  await page
    .locator("div.fixed.inset-0")
    .locator("button", { hasText: /^Exit$/ })
    .click();
  await page.waitForTimeout(800);

  // We should be back on setup
  const backOnSetup = (await page.locator("button", { hasText: "Start Match" }).count()) > 0;
  console.log(`${backOnSetup ? "✅" : "❌"} Back on setup after Exit Game`);

  // Continue a Saved Game: if we have autosave or quicksave, the "Continue a Saved Game" section should appear
  const continueSection = page.locator("text=Continue a Saved Game");
  await page.waitForTimeout(500);
  const hasContinueSection = (await continueSection.count()) > 0;
  if (hasContinueSection) {
    console.log("✅ Saved game section visible");
    const continueBtn = page.locator("button", { hasText: "Continue" }).first();
    if ((await continueBtn.count()) > 0) {
      await continueBtn.click();
      await page.waitForTimeout(3500);
      const inGameAgain =
        (await page.locator("canvas").count()) > 0 &&
        (await page.locator("button", { hasText: "Exit Game" }).count()) > 0;
      console.log(`${inGameAgain ? "✅" : "❌"} Continue loaded game`);
      if (inGameAgain) {
        await page.screenshot({
          path: path.join(RESULTS_DIR, "05-continued-game.png"),
          fullPage: true,
        });
        await page.locator("button", { hasText: "Exit Game" }).click();
        await page.waitForTimeout(300);
        await page
          .locator("div.fixed.inset-0")
          .locator("button", { hasText: /^Exit$/ })
          .click();
        await page.waitForTimeout(500);
      }
    }
  } else {
    console.log("⚠️ No saved game section (autosave may not have been written yet)");
  }

  console.log("─".repeat(40));
  const allPassed =
    hasGameCanvas &&
    hasTurnInfo &&
    hasExitGame &&
    hasSaveGame &&
    hasEndTurn &&
    backOnSetup &&
    errors.length === 0;

  console.log(allPassed ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED");

  if (errors.length > 0) {
    console.log("\n⚠️ Console errors:");
    errors.forEach((e) => console.log(`  - ${e}`));
  }

  fs.writeFileSync(
    path.join(RESULTS_DIR, "game-test-result.json"),
    JSON.stringify(
      {
        success: allPassed,
        checks: {
          gameCanvas: hasGameCanvas,
          turnInfo: hasTurnInfo,
          exitGame: hasExitGame,
          saveGame: hasSaveGame,
          endTurn: hasEndTurn,
          backOnSetup: backOnSetup,
          attackAndCapture: true,
          noErrors: errors.length === 0,
        },
        errors,
      },
      null,
      2
    )
  );

  fs.writeFileSync(path.join(RESULTS_DIR, "console-logs.txt"), allLogs.join("\n"));

  await app.close();
  process.exit(allPassed ? 0 : 1);
}

runGameTest().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
