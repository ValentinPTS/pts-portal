// Plan part 8.6 — the validation record: the D1 computation verified on a representative data set — the
// portal's computeError beside the self-check (another method), every row agreeing, the inputs the form
// refuses refused by both; a BROKEN computation caught (a sign, an exponent, the decimals); each value
// written plainly a third way for the checker's own tool; the CSV; the record's page and its gate.
import { readFileSync } from "node:fs";
import { d1Check, independentError, plainText, d1Csv, D1_SET } from "../src/lib/d1-check.ts";
import { computeError } from "../src/lib/results-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

const r = d1Check();
t("D1: every row of the representative set — the portal's error equals the self-check's; the refused ones refused by both", r.allAgree && r.rows.length === D1_SET.length, JSON.stringify(r.rows.filter((x) => !x.agree)));
t("…the set covers what the form takes: a negative, zero, a comma, an exponent (with «+»), a space grouping, «.5» and «5.», a leading «+», a large value, crossing zero — and what it refuses", D1_SET.some((p) => (computeError(p.ref, p.meas) ?? "").startsWith("-")) && D1_SET.some((p) => /^0(\.0+)?$/.test(computeError(p.ref, p.meas) ?? "x")) && D1_SET.some((p) => /^\d+,\d+$/.test(p.ref)) && D1_SET.some((p) => /E\+/.test(p.ref)) && D1_SET.some((p) => / /.test(p.meas)) && D1_SET.some((p) => p.ref === ".5" && p.meas === "5.") && D1_SET.some((p) => p.ref.startsWith("+")) && D1_SET.some((p) => Number(p.ref) > 1e5) && D1_SET.some((p) => Number(p.ref) < 0 && Number(p.meas) > 0) && D1_SET.filter((p) => p.refuse).length >= 3);
// a broken computation is caught — the check is no rubber stamp (8.6 review)
const broken: Record<string, (a: string, b: string) => string | null> = {
  "the sign flipped": (a, b) => computeError(b, a),
  "the exponent ignored": (a, b) => computeError(a.replace(/e.*$/i, ""), b.replace(/e.*$/i, "")),
  "the decimals cut to two": (a, b) => { const e = computeError(a, b); return e === null ? null : Number(e).toFixed(2); },
  "a refused input taken": (a, b) => computeError(a, b) ?? "0",
};
for (const [what, fn] of Object.entries(broken)) t(`review: a broken computation is caught — ${what}`, !d1Check(D1_SET, fn).allAgree);
t("the self-check: another method — floating point; it refuses what the form refuses, and never fails (beyond 100 decimals — nothing to say, not a 500)", independentError("abc", "1") === null && independentError("1,234.5", "1") === null && independentError("−5", "1") === null && independentError("5e-300", "1") === null && independentError("1 000", "1 000,5") === "0.5");
t("…a disagreement is said: a pair beyond floating point — the portal exact (0.2), the self-check not", (() => { const b = d1Check([{ ref: "12345678901234567.1", meas: "12345678901234567.3" }]); return b.rows[0].portal === "0.2" && !b.allAgree; })());
t("each value written plainly a third way — no grouping, a point, no exponent, no «+»", plainText("1 000,5") === "1000.5" && plainText("1.5e-3") === "0.0015" && plainText("1E+2") === "100" && plainText("+2.5") === "2.5" && plainText(".5") === "0.5" && plainText("5.") === "5" && plainText("-0.25") === "-0.25" && plainText("20,000") === "20.000" && plainText("abc") === null);
const body = d1Csv();
t("the CSV: the typed values as text, the plain ones, the portal's, the self-check's, the refused marked, an empty column for the checker", /reference_typed,measured_typed,reference_plain,measured_plain,portal_error,self_check,form_refuses,checker_result/.test(body) && body.includes('"20,000"') && body.includes(",20.000,19.998,") && body.split("\r\n").filter((l) => /,yes,$/.test(l)).length === D1_SET.filter((p) => p.refuse).length);
const page = readFileSync(new URL("../src/app/validation/record/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/validation/record/d1.csv/route.ts", import.meta.url), "utf8");
t("the record's page and the CSV: behind «Валидиране»'s gate; the CSV the same builder", /await requireSection\("validation"\);/.test(page) && /await requireSection\("validation"\);/.test(route) && /return new Response\(d1Csv\(\)/.test(route));
t("review: the record — the portal's self-check named as such, never the independent verification; the checker's tool, count, date and conclusion for D1; a voided test leads with it; scope and evidence said when absent; «recorded by» and a checker's signature per test", /Самопроверка на портала/.test(page) && /Това НЕ е проверката с независим инструмент/.test(page) && /Инструмент и версия/.test(page) && /Заключение за D1/.test(page) && /\{t\.voided && <div style=\{\{ color: "#8f2f2f", fontWeight: 800 \}\}>/.test(page) && /не е посочен/.test(page) && /без приложено доказателство/.test(page) && /Записано от/.test(page) && /Проверил \(име и подпис\)/.test(page));
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
t("review: printing — the page alone (no panel, header, controls), A4 — a rule for every record; @page at the top level (nested, the build drops the block)", /@media print \{\s*\.no-print, \.adminrail, \.adminmain > header/.test(css) && /^@page \{ size: A4/m.test(css) && !/@media print \{[^}]*\{[^}]*\}[^}]*@page/.test(css));
t("…no participant: no name, no identity read", !/listParticipants|openIdentities|labName/.test(page) && !/listParticipants|openIdentities/.test(route));

console.log(`validation-record.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
