// Renders the Certificate blank vs. issued-for-a-participant and screenshots the
// top region so the filled lab name + code can be eyeballed. Run with ts-ext-hook.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { renderCertificate } from "../src/lib/docs/certificate.ts";
import type { Scheme } from "../src/lib/types.ts";

const s: Scheme = {
  id: "x", number: "PTS 26/01-T-1", type: "T", status: "report",
  titleEn: "Proficiency testing of paving blocks", titleBg: "Изпитване за пригодност на павета",
  objectEn: "paving blocks", objectBg: "павета", distribution: "simultaneous",
  formNumber: "", revision: "Revision 1", revisionDate: "01.01.2026", standard: "ISO/IEC 17043:2023",
  regNo: "752/T-008", minParticipants: 5,
  team: [{ roleEn: "PT Scheme Manager", roleBg: "Ръководител на схемата", name: "I. Belovski" }],
  partner: { nameEn: "", nameBg: "", locationEn: "", locationBg: "", servicesEn: [], servicesBg: [] },
  parameters: [{ standardEn: "EN 1338", standardBg: "EN 1338", characteristicEn: "Tensile splitting strength", characteristicBg: "Якост на опън при разцепване", rangeEn: "", rangeBg: "", specimensEn: "", specimensBg: "" }],
  schedule: [], prices: [], assignedValueMethodEn: "", assignedValueMethodBg: "", scoresEn: "", scoresBg: "", clauses: {},
};

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1300 } });

const variants: [string, string][] = [
  ["cert-blank", renderCertificate(s, "en")],
  ["cert-issued", renderCertificate(s, "en", { participant: { code: "261103", labName: "Stroylab Test Center Ltd, Sofia", certNo: "PTS 26/01-T-1-48217", certDate: "26.06.2026" } })],
];
for (const [name, html] of variants) {
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: `.tmp/${name}.png`, fullPage: true });
  console.log(`${name} captured`);
}
await browser.close();
