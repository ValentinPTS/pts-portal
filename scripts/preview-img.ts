import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
await page.goto("http://localhost:3000/schemes/26-01-T-1/build/plan", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Default template/ }).click();
await page.waitForTimeout(300);
// click the partner logo image inside the editor to select it → control bar appears
const img = page.locator(".we-page img").first();
await img.click();
await page.waitForTimeout(200);
await page.screenshot({ path: ".tmp/img-controls.png" });
console.log("img-controls captured");
await browser.close();
