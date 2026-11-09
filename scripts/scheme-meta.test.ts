// Plan part 3.13 — the design data and the external providers for PTS_Analysis 2.0
// (D3; schema_version 2.1): Scheme_meta's seven keys — the approval of the design
// from stage 4, the report date from the report act, the period as the report writes
// it — and External_providers (name, address, services), which is also the plan's
// point 3 when listed.
import { readFileSync } from "node:fs";
import { schemeMeta, providerRows, metaGaps, readProviders, readPeriod, providersHtml, metaDiff, reportDate, legacyProviders, MAX_PROVIDERS, PROVIDER_PROBLEM_TEXT, META_GAP_TEXT, SCHEMA_VERSION } from "../src/lib/scheme-meta.ts";
import { renderOrder } from "../src/lib/docs/order.ts";
import { renderPlan } from "../src/lib/docs/plan.ts";
import { renderPlanC } from "../src/lib/docs/plan-c.ts";
import { fingerprint } from "../src/lib/editions.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import { forceCalibration } from "../src/lib/seed-force.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const T = structuredClone(pavingBlocks) as Scheme;
const lived: Scheme = {
  ...T, period: "март – май 2026",
  lifecycle: { acts: [{ act: "report", from: "processing", to: "report", at: "2026-06-10T08:00:00Z", by: "a@b", day: "2026-06-10" }], stages: { "4": { day: "2026-02-20", at: "2026-02-20T09:00:00Z", by: "a@b" } } } as Scheme["lifecycle"],
};
eq("Scheme_meta: the seven keys of the contract, in its words", Object.keys(schemeMeta(lived)), ["schema_version", "scheme_code", "object_title", "object_title_en", "design_approved", "report_date", "period"]);
eq("…schema 2.1, the number, the object both ways, the design's approval (stage 4), the report act's day, the period", schemeMeta(lived), { schema_version: SCHEMA_VERSION, scheme_code: T.number, object_title: T.objectBg, object_title_en: T.objectEn, design_approved: "2026-02-20", report_date: "2026-06-10", period: "март – май 2026" });
eq("…the report date is the report act's (a report is never taken back — one act)", reportDate({ lifecycle: { acts: [{ act: "process", day: "2026-06-01" }, { act: "report", day: "2026-06-12" }] } as never }), "2026-06-12");
eq("what 2.0 needs that the scheme does not hold yet — said before the export (7.1)", metaGaps({ ...T, objectEn: "", period: undefined, lifecycle: undefined } as Scheme), ["object_title_en", "design_approved", "period"]);

// the providers
let n = 0; const id = () => `p${++n}`;
const r1 = readProviders([{ id: "", name: "ТСУ Пиещяни", address: "Pieštany, SK", servicesBg: "Референтно калибриране", servicesEn: "Reference calibration" }, { id: "", name: "", address: "", servicesBg: "", servicesEn: "" }], undefined, id);
eq("rows read, a blank one dropped, an id each", r1.ok ? r1.providers.map((p) => [p.id, p.name]) : r1, [["p1", "ТСУ Пиещяни"]]);
eq("…a known id kept", (() => { const r = readProviders([{ id: "p1", name: "ТСУ Пиещяни (ред.)", address: "", servicesBg: "", servicesEn: "" }], r1.ok ? r1.providers : [], id); return r.ok ? r.providers[0].id : r; })(), "p1");
eq("a row without a name refused, named", readProviders([{ id: "", name: "", address: "Адрес", servicesBg: "", servicesEn: "" }], undefined, id), { ok: false, problem: "no-name", row: 1 });
eq(`at most ${MAX_PROVIDERS}, counted as posted`, readProviders([], undefined, id, MAX_PROVIDERS + 1), { ok: false, problem: "too-many" });
eq("the period: kept when not posted, cleared when blank, bounded", [readPeriod(null, "x"), readPeriod("  ", "x"), readPeriod("а".repeat(121), "x")], [{ ok: true, period: "x" }, { ok: true, period: undefined }, { ok: false }]);
t("every problem has its words", Object.values(PROVIDER_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));
const withProv: Scheme = { ...T, externalProviders: r1.ok ? r1.providers : [] };
eq("External_providers as the contract reads it — services in Bulgarian", providerRows(withProv), [{ name: "ТСУ Пиещяни", address: "Pieštany, SK", services: "Референтно калибриране", servicesEn: "Reference calibration" }]);
eq("…the English where only that is given (review)", providerRows({ ...T, externalProviders: [{ id: "x", name: "N", address: "", servicesBg: "", servicesEn: "Transport" }] })[0].services, "Transport");
eq("…no list: the providers the plan's point 3 names — the sheet and the plan never differ (review)", [providerRows(T).map((p) => p.name), legacyProviders({ ...structuredClone(forceCalibration) } as Scheme).length], [[T.partner.nameBg], 1]);
eq("the journal keeps every field, before and after — a removed provider keeps its words (review)", metaDiff({ externalProviders: withProv.externalProviders }, { period: "март" }), ["period: «—» → «март»", "external provider removed: «ТСУ Пиещяни» / «Pieštany, SK» / «Референтно калибриране» / «Reference calibration»"]);
t("stage 4 ticked after the results: said — its date proves nothing (review)", metaGaps({ ...lived, lifecycle: { ...lived.lifecycle, stages: { "4": { day: "2026-02-20", at: "x", by: "y", afterResults: true } } } } as Scheme).includes("design_approved_after_results") && !!META_GAP_TEXT.design_approved_after_results);

// the plan's point 3
t("…and the Order names the same providers as the plan (review)", renderOrder(withProv, "bg").includes("ТСУ Пиещяни") && !renderOrder(withProv, "bg").includes(T.partner.nameBg));
t("listed: the plan's point 3 is the list — testing and calibration (old and M1)", renderPlan(withProv, "bg").includes("Референтно калибриране") && renderPlanC({ ...structuredClone(forceCalibration), externalProviders: withProv.externalProviders } as Scheme, "bg").includes("ТСУ Пиещяни") && renderPlanC({ ...structuredClone(forceCalibration), calTemplate: "m1", externalProviders: withProv.externalProviders } as Scheme, "en").includes("Reference calibration"));
t("…not listed: point 3 as it was (older schemes unchanged)", renderPlan(T, "bg") === renderPlan({ ...T, externalProviders: undefined }, "bg") && !providersHtml(T, "bg"));
t("the providers are a document's content (the plan); the period is not", fingerprint(T, "plan") !== fingerprint(withProv, "plan") && fingerprint(T, "plan") === fingerprint({ ...T, period: "март" }, "plan"));

// the action and the editor
const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const actions = read("../src/lib/actions.ts");
t("read from the form; one that does not read keeps them, named, the rest saved; on record", /const metaRefusal = /.test(actions) && /period: periodNow,\s*externalProviders: providersNow,/.test(actions) && /logActivity\("scheme\.meta"/.test(actions) && /meta=\$\{encodeURIComponent\(metaRefusal\)\}/.test(actions));
t("…the period and the providers each on its own (review)", /if \(periodRead\.ok\) periodNow = periodRead\.period;\s*if \(!metaRefusal\) \{/.test(actions) && /periodRefused \? "per=1" : ""/.test(actions));
const editor = read("../src/components/SchemeEditor.tsx");
t("the editor says the list replaces point 3, offers to take it from there, says when the plan is saved elsewhere, and what 2.0 still lacks (review)", /data-providers-hint/.test(editor) && /data-take-legacy/.test(editor) && /init\.planSaved/.test(editor) && /data-meta-gaps/.test(editor));
t("the editor shows the dates from the lifecycle — never typed — and takes the period and the providers", /data-design-approved/.test(editor) && /data-report-date/.test(editor) && /name="period"/.test(editor) && /name=\{`prov_\$\{i\}_name`\}/.test(editor));

console.log(`scheme-meta.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
