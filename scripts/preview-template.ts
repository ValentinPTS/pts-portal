// Opens the Plan builder, clicks "Default template", and screenshots the loaded
// editor (no save → no DB write). Verifies the Default-template flow.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
await page.goto("http://localhost:3000/schemes/26-01-T-1/build/plan", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Default template/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: ".tmp/template-loaded.png", fullPage: false });
console.log("template-loaded captured");
await browser.close();
