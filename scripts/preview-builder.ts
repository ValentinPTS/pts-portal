import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1340, height: 1180 }, deviceScaleFactor: 2 });
await page.goto("http://localhost:3000/schemes/26-01-T-1/build/plan", { waitUntil: "networkidle" });

// if the "start from…" screen is shown, begin from the Default template
const startBtn = page.getByRole("button", { name: /Default template/ });
if (await startBtn.count()) { await startBtn.first().click(); await page.waitForTimeout(400); }

// select the partner logo so the image control bar is visible in the shot
const img = page.locator(".we-page img").first();
if (await img.count()) { await img.click(); await page.waitForTimeout(250); }

await page.screenshot({ path: ".tmp/app-builder.png", fullPage: true });
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: ".tmp/app-builder-top.png" });
console.log("app-builder captured");
await browser.close();
