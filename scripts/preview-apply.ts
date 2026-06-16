// Screenshots the public apply flow from the live dev server (client wizard).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

await page.goto("http://localhost:3000/apply", { waitUntil: "networkidle" });
await page.screenshot({ path: ".tmp/apply-list.png", fullPage: true });
console.log("apply-list captured");

await page.goto("http://localhost:3000/apply/26-01-T-1", { waitUntil: "networkidle" });
await page.screenshot({ path: ".tmp/apply-step1.png", fullPage: true });
console.log("apply-step1 captured");

// advance to step 3 (test items) — fill required step-1/2 fields first
for (const [name, val] of [["labName", "Stroylab"], ["manager", "G. Petrov"], ["contactPerson", "G. Petrov"], ["email", "a@b.bg"], ["phone", "0888"]] as const) {
  await page.fill(`input[name="${name}"]`, val);
}
await page.getByRole("button", { name: /Напред към детайли/ }).click();
for (const [name, val] of [["deliveryAddress", "Sofia, 13 Lazarov"], ["postalCode", "1000"]] as const) {
  await page.fill(`input[name="${name}"]`, val);
}
await page.getByRole("button", { name: /Напред към тестовете/ }).click();
await page.screenshot({ path: ".tmp/apply-step3.png", fullPage: true });
console.log("apply-step3 captured");

await browser.close();
