import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await page.screenshot({ path: ".tmp/login.png" });
console.log("login captured");
await browser.close();
