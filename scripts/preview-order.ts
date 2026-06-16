// Screenshots the Order (Заповед) for the seeded testing + calibration schemes,
// in Bulgarian (the originals are BG). ts-ext-hook.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { renderOrder } from "../src/lib/docs/order.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import { forceCalibration } from "../src/lib/seed-force.ts";

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1300 } });

const variants: [string, string][] = [
  ["order-t-bg", renderOrder({ ...pavingBlocks, orderDate: "06.01.2026" }, "bg")],
  ["order-c-bg", renderOrder({ ...forceCalibration, orderDate: "02.06.2025" }, "bg")],
];
for (const [name, html] of variants) {
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: `.tmp/${name}.png`, fullPage: true });
  console.log(`${name} captured`);
}
await browser.close();
