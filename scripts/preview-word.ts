import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });

for (const [name, url] of [
  ["word-testing", "http://localhost:3000/schemes/26-01-T-1/build/plan"],
  ["word-calibration", "http://localhost:3000/schemes/25-06-C-1/build/plan"],
] as const) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Default template/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `.tmp/${name}.png` });
  console.log(`${name} captured`);
}
await browser.close();
