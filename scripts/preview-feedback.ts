import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { renderFeedback } from "../src/lib/docs/feedback.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1300 } });
for (const [name, html] of [["feedback-bg", renderFeedback(pavingBlocks, "bg")], ["feedback-en", renderFeedback(pavingBlocks, "en")]] as const) {
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: `.tmp/${name}.png`, fullPage: true });
  console.log(`${name} captured`);
}
await browser.close();
