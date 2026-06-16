import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { getDoc } from "../src/lib/documents.ts";
import { withSkin, stripBodyMarkers } from "../src/lib/doc-shell.ts";
import { getSkin } from "../src/skins/index.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";

mkdirSync(".tmp", { recursive: true });
const render = getDoc("plan")!.render!;
const html = (id: string) => stripBodyMarkers(withSkin(getSkin(id), () => render(pavingBlocks, "bg")));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 820, height: 1120 }, deviceScaleFactor: 2 });
for (const id of ["classic", "modern", "minimal"]) {
  await p.setContent(html(id), { waitUntil: "load" });
  await p.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve())).catch(() => {});
  await p.waitForTimeout(500);
  await p.screenshot({ path: `.tmp/skin-${id}.png` });
  console.log("shot", id);
}
await b.close();
