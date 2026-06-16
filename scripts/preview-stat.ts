// Screenshots the Statistical project (testing + calibration), BG. ts-ext-hook.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { renderStatProject, renderStatProjectC } from "../src/lib/docs/stat-project.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import { forceCalibration } from "../src/lib/seed-force.ts";

// give the testing scheme a σpt,min on one characteristic to exercise §7.3
const t = { ...pavingBlocks, parameters: pavingBlocks.parameters.map((p, i) => (i === 2 ? { ...p, sigmaMin: 0.3 } : p)) };

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1300 } });
for (const [name, html] of [["stat-t-bg", renderStatProject(t, "bg")], ["stat-c-bg", renderStatProjectC(forceCalibration, "bg")]] as const) {
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: `.tmp/${name}.png`, fullPage: true });
  console.log(`${name} captured`);
}
await browser.close();
