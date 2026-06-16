// Renders the Final Report for synthetic scored schemes and screenshots the
// generated SVG charts via Playwright, so the chart geometry can be eyeballed.
// Run with the ts-ext-hook (see package note) — writes PNGs to .tmp/.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { renderReport } from "../src/lib/docs/report.ts";
import { renderReportC } from "../src/lib/docs/report-c.ts";
import type { Scheme } from "../src/lib/types.ts";

const base = (over: Partial<Scheme>): Scheme => ({
  id: "x", number: "PTS 26/01-T-1", type: "T", status: "report",
  titleEn: "Paving blocks", titleBg: "Паваж", objectEn: "paving blocks", objectBg: "павета",
  distribution: "simultaneous", formNumber: "", revision: "Revision 1", revisionDate: "01.01.2026",
  standard: "ISO/IEC 17043:2023", regNo: "752/T-008", minParticipants: 5,
  team: [{ roleEn: "Manager", roleBg: "Ръководител", name: "I. Belovski" }],
  partner: { nameEn: "P", nameBg: "P", locationEn: "", locationBg: "", servicesEn: [], servicesBg: [] },
  parameters: [], schedule: [], prices: [], assignedValueMethodEn: "robust mean", assignedValueMethodBg: "робастна средна",
  scoresEn: "", scoresBg: "", clauses: {}, ...over,
});

const t = base({
  type: "T",
  parameters: [{ standardEn: "EN 1338", standardBg: "EN 1338", characteristicEn: "Tensile splitting strength", characteristicBg: "Якост", rangeEn: "", rangeBg: "", specimensEn: "", specimensBg: "" }],
  scoring: {
    assigned: { "0": { xpt: 3.6, sigma: 0.3, u: 0.05 } },
    results: {
      "261101": { "0": { value: 3.62, u: 0.1 } },
      "261102": { "0": { value: 3.1, u: 0.12 } },
      "261103": { "0": { value: 4.8, u: 0.2 } },
      "261104": { "0": { value: 3.55, u: 0.09 } },
      "261105": { "0": { value: 3.9, u: 0.15 } },
    },
  },
});

const c = base({
  type: "C", number: "PTS 25/06-C-1", titleEn: "Force", titleBg: "Сила",
  calibration: {
    quantityEn: "Force", quantityBg: "Сила", unit: "kN", deviceEn: "Ring", deviceBg: "Пръстен",
    points: ["20", "60", "100", "140", "200"], directionsEn: ["Tension", "Compression"], directionsBg: ["Опън", "Натиск"],
    referenceLabEn: "", referenceLabBg: "", referenceLabLocEn: "", referenceLabLocBg: "",
    methodEn: "ISO 376", methodBg: "ISO 376", feeEn: "", feeBg: "", stabilityFormula: "", enCriterionEn: "", enCriterionBg: "",
  },
  scoring: {
    assigned: {
      "0:0": { xpt: 20, sigma: 0, u: 0.04 }, "0:1": { xpt: 60, sigma: 0, u: 0.06 },
      "0:2": { xpt: 100, sigma: 0, u: 0.1 }, "0:3": { xpt: 140, sigma: 0, u: 0.14 },
      "0:4": { xpt: 200, sigma: 0, u: 0.2 },
    },
    results: {
      "256101": {
        "0:0": { value: 20.02, u: 0.03 }, "0:1": { value: 60.05, u: 0.05 },
        "0:2": { value: 100.3, u: 0.08 }, "0:3": { value: 139.8, u: 0.1 },
        "0:4": { value: 201.1, u: 0.15 },
      },
    },
  },
});

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });

for (const [name, html] of [["report-t", renderReport(t, "en")], ["report-c", renderReportC(c, "en")]] as const) {
  writeFileSync(`.tmp/${name}.html`, html);
  await page.setContent(html, { waitUntil: "load" });
  const charts = page.locator("svg.chart");
  const n = await charts.count();
  for (let i = 0; i < n; i++) {
    await charts.nth(i).screenshot({ path: `.tmp/${name}-chart${i}.png` });
  }
  console.log(`${name}: ${n} chart(s) captured`);
}
await browser.close();
