/**
 * Quick Electron App Verification
 *
 * A fast script to verify the Electron app is working.
 * Run with: pnpm test:quick
 *
 * This script:
 * 1. Launches the Electron app
 * 2. Takes a screenshot
 * 3. Extracts text content
 * 4. Reports any errors
 * 5. Exits with status code (0 = success, 1 = failure)
 */

import { _electron as electron } from "playwright";
import path from "path";
import fs from "fs";

const RESULTS_DIR = path.resolve(__dirname, "results");
const TIMEOUT = 10000;

interface CheckResult {
  success: boolean;
  screenshot?: string;
  textContent?: string;
  errors: string[];
  checks: { name: string; passed: boolean; details?: string }[];
}

async function runQuickCheck(): Promise<CheckResult> {
  const result: CheckResult = {
    success: true,
    errors: [],
    checks: [],
  };

  // Ensure results directory exists
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  let app;
  try {
    console.log("🚀 Launching Electron app...");
    app = await electron.launch({
      args: [path.resolve(__dirname, "..")],
      timeout: TIMEOUT,
    });

    const page = await app.firstWindow();

    // Capture console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Wait for page to load
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000); // Wait for React

    // Check 1: Window title
    const title = await page.title();
    result.checks.push({
      name: "Window Title",
      passed: title === "Modern AW",
      details: `Title: "${title}"`,
    });

    // Check 2: React rendered
    const rootContent = await page.locator("#root").innerHTML();
    const hasContent = rootContent.length > 100;
    result.checks.push({
      name: "React Rendered",
      passed: hasContent,
      details: `Root innerHTML length: ${rootContent.length}`,
    });

    // Check 3: Key elements present
    const hasHeader = (await page.locator("h1").count()) > 0;
    const hasButton = (await page.locator("button").count()) > 0;
    result.checks.push({
      name: "Key Elements Present",
      passed: hasHeader && hasButton,
      details: `Header: ${hasHeader}, Button: ${hasButton}`,
    });

    // Check 4: Electron API available
    const hasElectronAPI = await page.evaluate(() => {
      return typeof (window as any).electronAPI !== "undefined";
    });
    result.checks.push({
      name: "Electron API Bridge",
      passed: hasElectronAPI,
      details: hasElectronAPI ? "Available" : "Not available",
    });

    // Check 5: No console errors
    result.checks.push({
      name: "No Console Errors",
      passed: consoleErrors.length === 0,
      details:
        consoleErrors.length > 0
          ? consoleErrors.join("; ")
          : "No errors",
    });

    // Take screenshot
    const screenshotPath = path.join(RESULTS_DIR, "quick-check.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    result.screenshot = screenshotPath;
    console.log(`📸 Screenshot saved: ${screenshotPath}`);

    // Extract text content
    const textContent = await page.locator("body").textContent();
    result.textContent = textContent || "";
    const textPath = path.join(RESULTS_DIR, "quick-check-text.txt");
    fs.writeFileSync(textPath, result.textContent);

    // Add any console errors to result
    result.errors = consoleErrors;

    // Determine overall success
    result.success = result.checks.every((c) => c.passed);
  } catch (error) {
    result.success = false;
    result.errors.push(String(error));
    console.error("❌ Error:", error);
  } finally {
    if (app) {
      await app.close();
    }
  }

  return result;
}

// Main execution
(async () => {
  console.log("═".repeat(60));
  console.log("  ELECTRON QUICK CHECK");
  console.log("═".repeat(60));

  const result = await runQuickCheck();

  console.log("\n📋 Results:");
  console.log("─".repeat(40));

  for (const check of result.checks) {
    const icon = check.passed ? "✅" : "❌";
    console.log(`${icon} ${check.name}: ${check.details || ""}`);
  }

  if (result.errors.length > 0) {
    console.log("\n⚠️  Errors:");
    result.errors.forEach((e) => console.log(`   - ${e}`));
  }

  console.log("─".repeat(40));
  console.log(result.success ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED");
  console.log("─".repeat(40));

  if (result.screenshot) {
    console.log(`\n📸 Screenshot: ${result.screenshot}`);
  }

  // Write JSON result for programmatic access
  const jsonPath = path.join(RESULTS_DIR, "quick-check-result.json");
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(`📄 Full result: ${jsonPath}`);

  process.exit(result.success ? 0 : 1);
})();
