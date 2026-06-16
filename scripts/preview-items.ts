import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
await page.goto("http://localhost:3000/schemes/26-01-T-1/build/plan", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Default template/ }).click();
await page.waitForTimeout(300);
// expand the "Characteristics table" auto-field to show its preview
await page.getByRole("button", { name: /Characteristics table/ }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: ".tmp/items-preview.png" });
console.log("items-preview captured");
await browser.close();
