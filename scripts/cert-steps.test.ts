// Plan part 7.7 — certificates from the approved report (D2's three conditions; D7; Реш. 135).
import { readFileSync } from "node:fs";
import { readCertContent, readScope, sameText, reportedKeys, scopeOf, certState, legacyIssued, releasedBeforeCorrection, readRelease, CERT_STATE_TEXT, CERT_PROBLEM_TEXT, type CertRecord } from "../src/lib/cert-model.ts";
import type { ReportIssue } from "../src/lib/report-issue-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const full = { bg_conclusion: "Удовлетворително", bg_results: "z = 0,4 (плътност)", bg_period: "01.10–30.11.2026", bg_methods: "БДС EN 1097-6" };
const en = { en_conclusion: "Satisfactory", en_results: "z = 0.4 (density)", en_period: "01.10–30.11.2026", en_methods: "BDS EN 1097-6" };
eq("the content: in Bulgarian each field required (600 at most); in English all four or none (review)", [
  Object.keys((readCertContent(full) as { text: object }).text),
  Object.keys((readCertContent({ ...full, ...en }) as { text: object }).text),
  (readCertContent({ ...full, bg_results: "" }) as { problem: string }).problem,
  (readCertContent({ ...full, bg_methods: " " }) as { problem: string }).problem,
  (readCertContent({ ...full, bg_conclusion: "я".repeat(601) }) as { problem: string }).problem,
  (readCertContent({ ...full, en_conclusion: "Satisfactory" }) as { problem: string }).problem,
], [["bg"], ["bg", "en"], "results", "methods", "too-long", "en-partial"]);
const tx = (readCertContent(full) as { text: Record<string, unknown> }).text as never;
t("a «retype» with the same words is not a new typing", sameText(tx, tx) && !sameText(tx, (readCertContent({ ...full, ...en }) as { text: never }).text) && !sameText(undefined, tx));

// ── the scope: what was reported ────────────────────────────────────────────
const T = { type: "T", parameters: [{ id: "dens", characteristicBg: "Плътност", characteristicEn: "Density", unit: "Mg/m³" }, { id: "abs", characteristicBg: "Водопоглъщане", characteristicEn: "Water absorption", unit: "%" }, { id: "los", characteristicBg: "Лос Анджелис", characteristicEn: "Los Angeles", unit: "" }] };
const tData = { kind: "T", draft: { rows: { abs: { mean: "1" }, dens: { mean: "2" }, los: { nr: true } } }, values: { abs: {}, dens: {}, los: { nr: true } } };
eq("reported keys: not N/R (testing), not N/A (calibration)", [reportedKeys(tData), reportedKeys({ kind: "C", draft: { points: { "pt-1": { U: "1" }, "pt-2": { na: true } } }, values: { "pt-1": {}, "pt-2": { na: true } } })], [["abs", "dens"], ["pt-1"]]);
eq("the scope from the version in force — in the scheme's order, both languages, with units", scopeOf(T, [], { data: tData }, []), { items: [{ key: "dens", bg: "Плътност, Mg/m³", en: "Density, Mg/m³" }, { key: "abs", bg: "Водопоглъщане, %", en: "Water absorption, %" }], from: "version" });
eq("…results by a sheet (no version): the characteristics it ran for", scopeOf(T, [], null, [2, 0]).items.map((x) => x.key), ["los", "dens"]);
const C = { type: "C", parameters: [], calibration: { unit: "kN" } };
const pts = [{ key: "pt-1|up", nominal: "20", direction: { bg: "натоварване", en: "loading" } }, { key: "pt-2|up", nominal: "100", direction: { bg: "натоварване", en: "loading" } }];
eq("the scope the typist confirmed: a subset of what is offered, one at least (review)", [readScope(["abs", "x"], [{ key: "dens", bg: "", en: "" }, { key: "abs", bg: "", en: "" }]), readScope([], [{ key: "dens", bg: "", en: "" }]).ok], [{ ok: true, items: [{ key: "abs", bg: "", en: "" }] }, false]);
eq("…a calibration scheme: the points reported, with the direction", scopeOf(C, pts, { data: { kind: "C", draft: { points: { "pt-2|up": { U: "1" }, "pt-1|up": { na: true } } }, values: { "pt-2|up": {}, "pt-1|up": { na: true } } } }, []).items, [{ key: "pt-2|up", bg: "100 kN · натоварване", en: "100 kN · loading" }]);

// ── the steps ───────────────────────────────────────────────────────────────
const sw = { releases: [], configVersion: 1, templates: [], gateTexts: "6.8", analysisVersions: ["2.0.3"] };
const R = (r: number): ReportIssue => ({ id: `x${r}`, r, kind: r === 1 ? "issue" : "correction", editionId: `ed${r}`, editionNo: r, at: "a", by: "m", day: "d", reason: "", scope: "", codes: [], analysisVersion: "2.0.3", importId: `i${r}`, reportSha: `S${r}`, transferCheckId: "c", software: sw });
const content = { text: tx, scope: [], scopeFrom: "version" as const, fromR: 1, reportSha: "S1", by: "stat@ptsbg.eu", at: "2026-12-01T10:00:00Z" };
const numbered: CertRecord = { no: "PTS 26/03-T-1-48217", date: "01.12.2026", registeredBy: "head@ptsbg.eu", registeredAt: "2026-12-01T09:00:00Z" };
const st = (cert: CertRecord | null, o: Partial<{ issue: ReportIssue | null; nr: boolean; reached: boolean }> = {}) => certState({ cert, issue: "issue" in o ? o.issue! : R(1), nr: o.nr ?? false, reached: o.reached ?? true });
eq("the state machine — the step that comes next", [
  st(null, { issue: null }),
  st({ ...numbered, content }, { nr: true }),
  st(null),
  st({ no: "PTS 26/03-T-1-99999", date: "x" }),
  st(numbered),
  st({ ...numbered, content }, { issue: R(2) }),
  st({ ...numbered, content }),
  st({ ...numbered, content, checked: { by: "qm@ptsbg.eu", at: "b" } }, { reached: false }),
  st({ ...numbered, content, checked: { by: "qm@ptsbg.eu", at: "b" } }),
  st({ ...numbered, content, checked: { by: "qm@ptsbg.eu", at: "b" }, released: { by: "head@ptsbg.eu", at: "c", langs: ["bg"] } }, { issue: R(2) }),
  certState({ cert: numbered, issue: null, nr: false, reached: false, legacy: true }),
], ["no-report", "nr", "no-number", "no-number", "no-content", "stale", "unchecked", "awaiting-payment", "ready", "released", "legacy"]);
eq("a report issued before 7.4 (no R on record): its 0.15 certificates stay issued — never a scheme not yet issued", [legacyIssued({ status: "report" }), legacyIssued({ status: "closed", reportIssues: [] }), legacyIssued({ status: "report", reportIssues: [R(1)] }), legacyIssued({ status: "processing" })], [true, true, false, false]);
t("a released certificate whose report was corrected since — said", releasedBeforeCorrection({ ...numbered, content, released: { by: "h", at: "c", langs: ["bg"] } }, R(2)) && !releasedBeforeCorrection({ ...numbered, content, released: { by: "h", at: "c", langs: ["bg"] } }, R(1)));
eq("the release: the issue date (default — the one recorded; dd.mm.yyyy, a real day); the language(s) — one at least, each typed (review)", [
  readRelease({ date: "", langs: ["bg"] }, "01.12.2026"),
  readRelease({ date: "31.02.2026", langs: ["bg"] }, "01.12.2026").ok,
  readRelease({ date: "02.12.2026", langs: ["en", "bg", "xx", "en"] }, "01.12.2026"),
  readRelease({ date: "02.12.2026", langs: [] }, "01.12.2026").ok,
  readRelease({ date: "", langs: ["en"] }, "01.12.2026", ["bg"]),
], [{ ok: true, date: "01.12.2026", langs: ["bg"] }, false, { ok: true, date: "02.12.2026", langs: ["en", "bg"] }, false, { ok: false, problem: "langs-typed" }]);
t("every state and refusal has its words, both languages", [...Object.values(CERT_STATE_TEXT), ...Object.values(CERT_PROBLEM_TEXT)].every((x) => !!x.bg && !!x.en));

// ── the wiring ──────────────────────────────────────────────────────────────
const act = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const fnOf = (name: string) => { const a = act.indexOf(`export async function ${name}`); return act.slice(a, act.indexOf("\n}\n", a)); };
const num = fnOf("issueCertificateAction");
t("the number (0.15) is step 1 only: nothing told, no case-file step; a released certificate's number is not changed; the content kept; never for N/R or off the final list (review)", !/notifyReportIssued/.test(num) && !/addCaseEvent/.test(num) && /if \(existing\?\.released\) \{ out\.problem = "released"/.test(num) && /logActivity\("certificate\.numbered"/.test(num) && /const kept: Partial<CertRecord>/.test(num) && /if \(sc && p && \(!inFinalRound\(sc, p\) \|\| certNR\(sc, p\.id\)\)\) return \{ error: "nr" \};/.test(num));
const typed = fnOf("recordCertContentAction");
t("the content: the statistics expert or the scheme manager; from the R in force, its hash kept; the scope read from the version in force; typed again — the check cleared; journalled without a value", /await requireOneOf\(\["results\.process", "scheme\.edit"\], schemeId\);/.test(typed) && /const content = \{ text, scope: items, scopeFrom: scope\.from, fromR: issue\.r, reportSha: issue\.reportSha, by, byKey: await actorKeyNow\(\)/.test(typed) && /versionInForce\(part, await listSubmissions\(schemeId, part\.id\), scheme\.submissionLocks, scheme\.labUploads\)/.test(typed) && /const picked = readScope\(formData\.getAll\("scope"\), scope\.items\);/.test(typed) && /redirect\(back\("cert=same-text"\)\)/.test(typed) && /const \{ checked: _old, \.\.\.rest \} = c;/.test(typed) && /after: \{ r: issue\.r, scope: items\.map\(\(x\) => x\.key\), scopeFrom: scope\.from, langs: Object\.keys\(text\) \}/.test(typed) && !/after: \{[^}]*(text|conclusion|results|period|methods)\b[^}]*\}/.test(typed.replace("langs: Object.keys(text)", "")));
const chk = fnOf("checkCertContentAction");
t("the check: a SECOND person — never who typed it; what they saw is what is there (again in the lock)", /if \(\(await actorKeyNow\(\)\) === \(content\.byKey \?\? content\.by\.toLowerCase\(\)\)\) redirect\(back\("cert=same-person"\)\);/.test(chk) && /if \(c!\.content!\.at !== typedAt\) \{ outcome = "stale"; return \{\}; \}/.test(chk));
const rel = fnOf("releaseCertificateAction");
t("the release: who may approve; only «ready» (the report issued and reached it, the content from the R in force and checked, not N/R) — again in the lock; who to tell first; the laboratory told; journalled without the number", /await requireCap\("approve", schemeId\);/.test(rel) && /if \(certStateOf\(scheme, code, part\.id\) !== "ready"\) redirect\(back\("cert=state"\)\);/.test(rel) && /if \(certStateOf\(cur, code, part\.id\) !== "ready" \|\| c!\.content!\.at !== typedAt\)/.test(rel) && rel.indexOf("const tell = await labToTell(schemeId, code);") < rel.indexOf("released: { by, at:") && /if \(tell!\.labId\) await notifyReportIssued\(tell!\.labId, schemeId, scheme\.number, code\);/.test(rel) && /logActivity\("certificate\.released"/.test(rel) && !/\.no\b/.test(rel.slice(rel.indexOf('logActivity("certificate.released"'), rel.indexOf('logActivity("certificate.released"') + 260)) && /if \(typedAt !== seen\.at\) redirect\(back\("cert=stale"\)\);/.test(rel) && /Object\.keys\(seen\.text\) as CertLang\[\]/.test(rel));
const cn = readFileSync(new URL("../src/lib/cert-number.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/lab/doc/[scheme]/[doc]/route.ts", import.meta.url), "utf8");
const exp = readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8");
t("the laboratory: a released certificate only (or one issued under 0.15 on a report before 7.4), in a language it was released in, with this language's content, the scope and its R; the round export the same", /return c && \(c\.released \|\| legacy\) \? c : undefined;/.test(cn) && /const cert = labCertificate\(scheme\.certificates, mine\.code, legacyIssued\(scheme\)\);/.test(route) && /const certLang = langs\.includes\(lang\) \? lang : langs\[0\];/.test(route) && /content: cert\.content\?\.text\[certLang\], scope: cert\.content\?\.scope, fromR: cert\.content\?\.fromR/.test(route) && /const cert = labCertificate\(s\.certificates, p\.code, legacyIssued\(s\)\);\s*if \(!cert \|\| \(cert\.released && !cert\.released\.langs\.includes\(lang\)\)\) continue;/.test(exp) && /"releasedBy", "releasedAt", "releasedLangs"/.test(exp));
const doc = readFileSync(new URL("../src/lib/docs/certificate.ts", import.meta.url), "utf8");
const print = readFileSync(new URL("../src/app/schemes/[id]/doc/[doc]/print/route.ts", import.meta.url), "utf8");
t("the certificate prints the scope, the content as typed and the R it came from; PTS's preview of one not released is marked so (review)", /opts\?\.participant\?\.scope/.test(doc) && /contentHtml\(lang, opts\?\.participant\?\.content, opts\?\.participant\?\.fromR, ilc\)/.test(doc) && /previewMark\(lang, opts\?\.participant\?\.preview\)/.test(doc) && /const preview = cert\?\.released \|\| legacyIssued\(scheme\) \? undefined/.test(print));
const page = readFileSync(new URL("../src/app/schemes/[id]/doc/[doc]/page.tsx", import.meta.url), "utf8");
t("the steps on the certificate's page: per participation on the final list; the number shown beside the code only to who may see names (Реш. 115)", /<CertificateSteps schemeId=\{s\.id\}/.test(page) && /\.filter\(\(p\) => inFinalRound\(s, p\)\)/.test(page) && /numberShown: reveal/.test(page));

console.log(`cert-steps.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
