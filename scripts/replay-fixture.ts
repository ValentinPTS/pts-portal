// A synthetic closed testing round as its coded 2.0 input file (plan part 8.2) — made up, codes only:
// no real laboratory, no real result. For the replay checks: written to a folder by
//   node --import ./scripts/ts-ext-hook.mjs scripts/replay-fixture.ts <dir> [stamp]
// → <dir>/replay-good.xlsx and <dir>/replay-name.xlsx (a laboratory's name where a code belongs).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { xlsx, type Sheet } from "../src/lib/xlsx.ts";
import { ANALYSIS_HEADERS as H } from "../src/lib/analysis-guide.ts";

export function replaySheets(number = "PTS 26/03-T-1"): Sheet[] {
  const chars = [
    ["ch-1", "Плътност", "Density", "БДС EN 1097-6", "EN 1097-6", "", "", "Mg/m³", 2, "", "", 2, "robust", "", "", "", "", "", 0.01, "", "", "", "", "", "", "", "z", "", 1, 4, ""],
    ["ch-2", "Водопоглъщане", "Water absorption", "БДС EN 1097-6", "EN 1097-6", "", "", "%", 1, "", "", 3, "robust", "", "", "", "", "", "", "", "", "", "", "", "", "", "z", "", "", "", ""],
  ];
  return [
    { name: "Scheme_meta", rows: [[...H.Scheme_meta], ["schema_version", "2.1"], ["scheme_code", number], ["object_title", "Скален добив"], ["object_title_en", "Aggregates"], ["design_approved", "2026-02-10"], ["report_date", "2026-05-20"], ["period", "март — май 2026"]] },
    { name: "Characteristics", rows: [[...H.Characteristics], ...chars] },
    { name: "Participants", rows: [[...H.Participants, "participates_in_ch-1", "participates_in_ch-2"], ["126301", "", "Да", "Да"], ["126302", "", "Да", "Не"], ["126303", "", "Да", "Да"]] },
    { name: "Results", rows: [[...H.Results],
      ["126301", "ch-1", 2.61, 2.63, "", 2.62, 0.02, "reported", "", "2,61; 2,63", "2,62", "0,02"],
      ["126301", "ch-2", 0.4, 0.5, 0.6, 0.5, 0.1, "reported", "", "0,4; 0,5; 0,6", "0,50", "0,1"],
      ["126302", "ch-1", 2.7, 2.72, "", 2.71, "", "excluded", "", "2,70; 2,72", "2,71", ""],
      ["126303", "ch-1", "", "", "", "", "", "N/R", "не е изпитвано", "", "", ""],
      ["126303", "ch-2", 0.45, 0.47, 0.49, 0.47, 0.05, "reported", "", "0,45; 0,47; 0,49", "0,47", "0,05"]] },
    { name: "Homogeneity", rows: [[...H.Homogeneity], ["H1", "S-01", "ch-1", 1, 2.6], ["H1", "S-01", "ch-1", 2, 2.61]] },
    { name: "Calibration", rows: [[...H.Calibration]] },
    { name: "External_providers", rows: [[...H.External_providers], ["Партньорска лаборатория за вземане на проби", "София", "Вземане на проби"]] },
  ];
}

if (process.argv[1]?.endsWith("replay-fixture.ts") && process.argv[2]) {
  const dir = process.argv[2], stamp = process.argv[3] ?? "";
  // the reference round's own number — level 1 is ITS replay (8.3); the stamp only marks the object
  const good = replaySheets().map((s) => (s.name === "Scheme_meta" ? { ...s, rows: s.rows.map((r) => (r[0] === "object_title" && stamp ? ["object_title", `Скален добив ${stamp}`] : r)) } : s));
  writeFileSync(join(dir, "replay-good.xlsx"), xlsx(good));
  const named = good.map((s) => (s.name === "Participants" ? { ...s, rows: [s.rows[0], ["Лаборатория Пример ЕООД", "", "Да", "Да"], ...s.rows.slice(2)] } : s));
  writeFileSync(join(dir, "replay-name.xlsx"), xlsx(named));
}
