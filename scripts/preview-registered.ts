// Screenshots PTS-L 4.4-1 (named/logistics) and PTS-L 4.4-2 (coded mapping).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { renderRegistered, renderRegisteredCoded } from "../src/lib/docs/registered.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import { forceCalibration } from "../src/lib/seed-force.ts";

const labs = [
  { code: "261101", labName: "Stroylab Test Center Ltd, Sofia", country: "Bulgaria", contact: "G. Petrov", phone: "0888 605 643", email: "lab@stroylab.bg", deliveryAddress: "13 Prof. Tsvetan Lazarov Blvd, fl.7, Sofia", participations: 2 },
  { code: "261102", labName: "BetonControl OOD, Plovdiv", country: "Bulgaria", contact: "N. Bugova", phone: "0887 857 139", email: "office@betoncontrol.bg", deliveryAddress: "44A Levski G, Plovdiv", participations: 1 },
  { code: "261103", labName: "GeoTest SRL, Bucharest", country: "Romania", contact: "A. Ionescu", phone: "+40 21 555 0123", email: "lab@geotest.ro", deliveryAddress: "Str. Calea Victoriei 10, Bucharest", participations: 1 },
];

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1300 } });
const variants: [string, string][] = [
  ["list-441-t", renderRegistered(pavingBlocks, "bg", { participants: labs })],
  ["list-442-t", renderRegisteredCoded(pavingBlocks, "bg", { participants: labs })],
  ["list-442-c", renderRegisteredCoded(forceCalibration, "bg", { participants: labs.map((l) => ({ ...l, code: l.code.replace("261", "256") })) })],
];
for (const [name, html] of variants) {
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: `.tmp/${name}.png`, fullPage: true });
  console.log(`${name} captured`);
}
await browser.close();
