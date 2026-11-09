// The two coded lists follow PTS's real forms, not their titles (assignment of
// 31.10.2026, §4; plan part 0.2): F 7.2.1-5 «Кодиран списък на участниците» holds
// codes and results with NO names — it goes to the statistics expert — and
// F 7.2.1-6 «Кодиран списък на резултатите» is the name↔code mapping, a manager's
// alone. A body or template customised before the swap must not be used.
import { getDoc, isRestrictedDoc, savedDocBody, markCodedList, usableForDoc, CODED_LIST_MARK, hasDocContent } from "../src/lib/documents.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import type { Scheme, DocOptions } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

const NAME = "Изпитвателна лаборатория Пример ООД";
const MAIL = "office@primer-lab.bg";
const s: Scheme = structuredClone(pavingBlocks);
const firstMetric = "0";
s.scoring = {
  ...(s.scoring ?? { assigned: {}, results: {} }),
  results: { "261101": { [firstMetric]: { value: 7.25, u: 0.12, determinations: [7.2, 7.3] } } },
} as Scheme["scoring"];
const opts = (reveal: boolean): DocOptions => ({
  revealNames: reveal,
  participants: [{ code: "261101", labName: NAME, email: MAIL, contact: "Иван Петров", sampleCode: "S-17", participations: 1 }],
});

for (const lang of ["bg", "en"] as const) {
  // F 7.2.1-5 — codes and results, never a name, whatever the viewer
  const five = getDoc("registered-coded")!;
  t(`${lang}: -5 form number`, five.formNumber === "F 7.2.1-5");
  const h5 = five.render!(s, lang, opts(true));
  t(`${lang}: -5 has no name even for a manager`, !h5.includes(NAME) && !h5.includes(MAIL));
  t(`${lang}: -5 has the code and the result`, h5.includes("261101") && h5.includes("7.25"));
  t(`${lang}: -5 prints F 7.2.1-5`, h5.includes("F 7.2.1-5") && !h5.includes("F 7.2.1-6"));
  t(`${lang}: -5 title is «participants»`, lang === "bg" ? h5.includes("КОДИРАН СПИСЪК НА УЧАСТНИЦИТЕ") : h5.includes("ENCRYPTED LIST OF PARTICIPANTS"));

  // F 7.2.1-6 — the name↔code mapping
  const six = getDoc("results-coded")!;
  t(`${lang}: -6 form number`, six.formNumber === "F 7.2.1-6");
  const h6m = six.render!(s, lang, opts(true));
  t(`${lang}: -6 shows the name to a manager`, h6m.includes(NAME) && h6m.includes("261101"));
  t(`${lang}: -6 prints F 7.2.1-6`, h6m.includes("F 7.2.1-6") && !h6m.includes("F 7.2.1-5"));
  t(`${lang}: -6 title is «results»`, lang === "bg" ? h6m.includes("КОДИРАН СПИСЪК НА РЕЗУЛТАТИТЕ") : h6m.includes("ENCRYPTED LIST OF RESULTS"));
  const h6s = six.render!(s, lang, opts(false));
  t(`${lang}: -6 masks the name if ever rendered for a non-manager`, !h6s.includes(NAME));
}

t("-6 is restricted", isRestrictedDoc("results-coded"));
t("-5 is not restricted", !isRestrictedDoc("registered-coded"));
t("-4 is not restricted (masked instead)", !isRestrictedDoc("registered"));

// a body customised before the swap is not used; one saved after it is
const old: Scheme = { ...s, docs: { "registered-coded": { bg: `<p>${NAME}</p>`, en: `<p>${NAME}</p>` } } };
t("pre-swap -5 body ignored", savedDocBody(old, "registered-coded") === undefined);
t("pre-swap body does not count as started", !hasDocContent(old, "registered-coded"));
const marked = markCodedList("registered-coded", "<p>x</p>");
const fresh: Scheme = { ...s, docs: { "registered-coded": { bg: marked, en: "" } } };
t("a save marks a coded list", marked === CODED_LIST_MARK + "<p>x</p>");
t("marking twice is a no-op", markCodedList("registered-coded", marked) === marked);
t("an empty save stays empty (reset to auto)", markCodedList("results-coded", "") === "");
t("post-swap -5 body used", savedDocBody(fresh, "registered-coded")?.bg === marked);
const other: Scheme = { ...s, docs: { report: { bg: "<p>r</p>", en: "<p>r</p>" } } };
t("other documents are never marked", markCodedList("report", "<p>r</p>") === "<p>r</p>");
t("other documents unaffected", savedDocBody(other, "report")?.bg === "<p>r</p>");
// revisions and templates follow the same rule
t("unmarked (pre-swap) revision unusable", !usableForDoc("results-coded", { bg: `<p>${NAME}</p>`, en: "" }));
t("marked revision usable", usableForDoc("results-coded", { bg: "", en: markCodedList("results-coded", "<p>y</p>") }));
t("a mark copied into another doc means nothing there", usableForDoc("report", { bg: "<p>z</p>" }));

console.log(`coded-lists.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
