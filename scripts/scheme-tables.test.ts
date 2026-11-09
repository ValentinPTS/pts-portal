// Plan part 3.14 — the round export's scheme tables: every record the scheme keeps
// since Phase 3 laid out as a table in coded/ (its life, amendments, extensions,
// batches and values, characteristics and their versions, the 2.0 design data, the
// lists, the prices). Codes only.
import { readFileSync } from "node:fs";
import { schemeTables } from "../src/lib/round-export.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const T = structuredClone(pavingBlocks) as Scheme;
const s: Scheme = {
  ...T,
  lifecycle: { acts: [{ act: "open", from: "draft", to: "open", at: "2026-01-02T08:00:00Z", by: "head@ptsbg.eu", day: "2026-01-02" }], stages: { "4": { day: "2026-01-01", at: "2026-01-01T08:00:00Z", by: "head@ptsbg.eu" }, "3": { day: "2025-12-30", at: "x", by: "y" } } },
  amendments: [{ id: "a1", no: 1, orderNo: "З-7", orderDate: "2026-02-01", reason: "причина", points: "т. 10", validity: "няма", day: "2026-02-01", at: "x", by: "head@ptsbg.eu" }],
  extensions: [{ id: "e1", code: "261101", key: "resultsDue", until: "2026-03-10", orderNo: "З-8", orderDate: "2026-03-01", reason: "болест в Лаборатория Тест Плевен", day: "2026-03-01", at: "x", by: "head@ptsbg.eu" }],
  batches: [{ id: "b1", label: "P1", material: "Добавъчен материал", preparedOn: "2026-01-10", storage: "сухо", prefix: "12603", createdAt: "2026-01-10T08:00:00Z", createdBy: "head@ptsbg.eu", objects: [{ code: "1260301", role: "homogeneity" }, { code: "1260302" }], homogeneity: [{ series: "H1", sampleCode: "1260301", characteristic: 0, characteristicName: "Водопоглъщане", characteristicId: "ch-1", replicate: 1, value: 12.4 }, { series: "H1", sampleCode: "1260301", characteristic: 0, characteristicName: "Водопоглъщане", characteristicId: "ch-1", replicate: 1, value: 12.9 }] }],
  characteristicVersions: [{ no: 1, at: "x", by: "head@ptsbg.eu", day: "2026-01-01", characteristics: [{ ...T.parameters[0], id: "ch-1" }] }],
  period: "март – май 2026",
  externalProviders: [{ id: "p1", name: "Пробовземач ООД", address: "София", servicesBg: "Вземане на проби", servicesEn: "Sampling" }],
  lists: { shipmentDocs: [{ id: "li-1", bg: "Товарителница", en: "Waybill" }], accreditationRequired: true, seq: 1 },
  commercial: { base: 10000, sharePct: 40 },
};
const tables = schemeTables(s);
const byFile = Object.fromEntries(tables.map(([f, rows, cols]) => [f, { rows, cols }]));
eq("one table for each record of Phase 3, in coded/", tables.map(([f]) => f), ["coded/lifecycle_acts.csv", "coded/lifecycle_stages.csv", "coded/amendments.csv", "coded/extensions.csv", "coded/batches.csv", "coded/batch_objects.csv", "coded/homogeneity.csv", "coded/characteristics.csv", "coded/characteristic_versions.csv", "coded/scheme_meta.csv", "coded/external_providers.csv", "coded/scheme_lists.csv", "coded/commercial.csv"]);
t("every row's fields are among its columns (nothing lost to a missing column)", tables.every(([, rows, cols]) => rows.every((r) => Object.keys(r).every((k) => cols.includes(k) || (r as Record<string, unknown>)[k] === undefined)) || (console.error(rows, cols), false)));
eq("the lifecycle: the acts, and the stages in order", [byFile["coded/lifecycle_acts.csv"].rows.length, (byFile["coded/lifecycle_stages.csv"].rows as { stage: string }[]).map((r) => r.stage)], [1, ["3", "4"]]);
eq("the batches: each object with its role, each value with the characteristic's id", [(byFile["coded/batch_objects.csv"].rows as { role: string }[]).map((r) => r.role), (byFile["coded/homogeneity.csv"].rows as { characteristicId: string }[])[0].characteristicId], [["homogeneity", ""], "ch-1"]);
eq("…every value on record, which counts said; the place from 1, as characteristics.csv (review)", (byFile["coded/homogeneity.csv"].rows as { current: string; place: number }[]).map((r) => [r.value, r.current, r.place]), [[12.4, "no", 1], [12.9, "yes", 1]]);
t("…a batch keeps its id and who made it when (review)", byFile["coded/batches.csv"].cols.includes("id") && byFile["coded/batches.csv"].cols.includes("createdBy") && byFile["coded/batches.csv"].cols.includes("drawAt"));
eq("prices in euros with their unit — never bare cents (review)", (byFile["coded/commercial.csv"].rows as { key: string; value: string; unit: string }[]).filter((r) => ["base", "sharePct"].includes(r.key)), [{ key: "base", value: "100.00", unit: "EUR" }, { key: "sharePct", value: "40", unit: "%" }]);
eq("Scheme_meta: key and value, as 2.0 reads it", (byFile["coded/scheme_meta.csv"].rows as { key: string; value: string }[]).find((r) => r.key === "period")?.value, "март – май 2026");
eq("the characteristics with their stable ids; the versions with theirs", [(byFile["coded/characteristics.csv"].rows as { place: number }[]).length === s.parameters.length, (byFile["coded/characteristic_versions.csv"].rows as { ids: string }[])[0].ids], [true, "ch-1"]);
t("the extensions by the participation's code — never a name", JSON.stringify(byFile["coded/extensions.csv"].rows).includes("261101") && !/labName|email/.test(byFile["coded/extensions.csv"].cols.join(",")));
eq("an empty scheme: the tables there — only its own Scheme_meta, lists, prices and the providers point 3 names hold rows; never a crash", schemeTables({ ...T }).map(([, rows]) => rows.length > 0 ? "rows" : "empty").filter((x) => x === "rows").length, 4);
// review: a laboratory's name typed into a free text is scrubbed out of coded/, as any
const { makeScrubber, scrubDeep } = await import("../src/lib/round-export.ts");
const scrub = makeScrubber(["Лаборатория Тест Плевен"]);
const scrubbed = JSON.stringify(scrubDeep(byFile["coded/extensions.csv"].rows, scrub));
t("…a laboratory's name in a free text (an extension's reason) is scrubbed out of coded/ (review)", !scrubbed.includes("Лаборатория Тест Плевен") && scrubbed.includes("болест"));
const exp = readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8");
t("written into coded/ and scrubbed like every coded table", /for \(const \[file, rows, cols\] of schemeTables\(s\)\) addCoded\(file, rows, cols\);/.test(exp));

console.log(`scheme-tables.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
