// Plan part 3.9 — the accreditation mark: the ILAC-MRA and SNAS marks with
// «Рег. № 752/T-008» on every scheme in scope, calibration included; NA → no mark and
// an explicit sentence; a status not stated → no mark and no claim either way.
import { readFileSync, readdirSync } from "node:fs";
import { markState, marksHtml, accreditationSentence, refreshAccreditation, NA_SENTENCE } from "../src/lib/accreditation-mark.ts";
import { docDefaultBody, docPrintHtml } from "../src/lib/doc-template.ts";
import { renderReport } from "../src/lib/docs/report.ts";
import { renderReportC } from "../src/lib/docs/report-c.ts";
import { renderCertificate } from "../src/lib/docs/certificate.ts";
import { renderCertificateC } from "../src/lib/docs/certificate-c.ts";
import { fingerprint } from "../src/lib/editions.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import { forceCalibration } from "../src/lib/seed-force.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── the status, from the number (or what PTS chose where it says nothing) ──
const st = (number: string, type: "T" | "C" = "T", accredited?: boolean) => markState({ number, type, accredited });
eq("in scope, NA, not stated", [st("PTS 26/06-T-1"), st("PTS 26/06-C-1", "C"), st("ILC 26/10-NA-T-1"), st("PTS 25/08-NA-1"), st("PTS 23/11-A")], ["mark", "mark", "na", "na", "unset"]);
eq("…an archive number: what PTS chose", [st("PTS 23/11-A", "T", true), st("PTS 23/11-A", "T", false)], ["mark", "na"]);
// review
eq("the number first, then the stored choice — a stored «in scope» never beats «-NA»", st("ILC 26/10-NA-T-1", "T", true), "na");
eq("an ILC is outside the accreditation by definition — even without «-NA»", st("ILC 26/10-T-1"), "na");
eq("a simulation round carries no mark", [st("SIM 26/03-T-1"), st("SIM 26/03-C-1", "C")], ["sim", "sim"]);
eq("in scope without a registration number: no mark", [markState({ number: "PTS 26/06-T-1", type: "T", regNo: "  " }), markState({ number: "PTS 26/06-T-1", type: "T", regNo: "752/T-008" })], ["unset", "mark"]);
t("…a simulation prints neither the mark nor a claim", marksHtml({ number: "SIM 26/03-T-1", type: "T", regNo: "752/T-008" }, "bg") === "" && accreditationSentence({ number: "SIM 26/03-T-1", type: "T", regNo: "752/T-008" }, "bg") === "");

// ── the documents ──────────────────────────────────────────────────────────
const T = structuredClone(pavingBlocks) as Scheme;
const C = structuredClone(forceCalibration) as Scheme;
const withNo = (s: Scheme, number: string, accredited?: boolean): Scheme => ({ ...s, number, kind: undefined, activity: undefined, accredited });
const docs: [string, (s: Scheme) => string, Scheme, string, string][] = [
  ["report", (s) => renderReport(s, "bg"), T, "PTS 26/01-T-1", "PTS 26/01-NA-T-1"],
  ["certificate", (s) => renderCertificate(s, "bg"), T, "PTS 26/01-T-1", "PTS 26/01-NA-T-1"],
  ["calibration report", (s) => renderReportC(s, "bg"), C, "PTS 25/06-C-1", "PTS 25/06-NA-C-1"],
  ["calibration certificate", (s) => renderCertificateC(s, "bg"), C, "PTS 25/06-C-1", "PTS 25/06-NA-C-1"],
];
for (const [name, render, s, inScope, na] of docs) {
  const a = render(withNo(s, inScope)), b = render(withNo(s, na)), c = render(withNo(s, "PTS 23/11-A"));
  t(`${name}, in scope: the ILAC-MRA and SNAS marks with the registration number`, a.includes("/brand/snas.png") && a.includes("/brand/ilac-mra.jpg") && a.includes(`Рег. № ${s.regNo}`));
  t(`${name}, NA: no mark — and the explicit sentence`, !b.includes("snas.png") && !b.includes("ilac-mra") && b.includes(NA_SENTENCE.bg.slice(0, 40)));
  t(`${name}, not stated: no mark and no claim either way`, !c.includes("snas.png") && !c.includes("ilac-mra") && !c.includes(NA_SENTENCE.bg.slice(0, 40)));
}
const rep = (n: string) => renderReport(withNo(T, n), "en");
t("the report's §5: «under accreditation» in scope only", rep("PTS 26/01-T-1").includes("operated under accreditation by SNAS") && !rep("PTS 26/01-NA-T-1").includes("under accreditation") && !rep("PTS 23/11-A").includes("under accreditation"));
t("…the calibration report's too", renderReportC(withNo(C, "PTS 25/06-C-1"), "en").includes("operated under accreditation by SNAS") && !renderReportC(withNo(C, "PTS 25/06-NA-C-1"), "en").includes("under accreditation"));
t("the sentence and the block are escaped", accreditationSentence({ number: "PTS 26/01-T-1", type: "T", regNo: "<b>" }, "en").includes("&lt;b&gt;") && marksHtml({ number: "PTS 26/01-T-1", type: "T", regNo: "<b>" }, "en").includes("&lt;b&gt;"));
t("a change of the status ALONE is a change of the documents (fingerprint; review)", fingerprint(withNo(T, "PTS 23/11-A", true), "plan") !== fingerprint(withNo(T, "PTS 23/11-A", false), "plan") && fingerprint(withNo(T, "PTS 23/11-A", true), "invitation") !== fingerprint(withNo(T, "PTS 23/11-A"), "invitation"));

// ── a saved body prints the status NOW (review) ────────────────────────────
for (const [name, key, s0, inScope, na] of [["report", "report", T, "PTS 26/01-T-1", "PTS 26/01-NA-T-1"], ["calibration report", "report", C, "PTS 25/06-C-1", "PTS 25/06-NA-C-1"], ["certificate", "certificate", T, "PTS 26/01-T-1", "PTS 26/01-NA-T-1"]] as const) {
  const savedIn = docDefaultBody(withNo(s0, inScope), key, "bg");
  const savedNa = docDefaultBody(withNo(s0, na), key, "bg");
  t(`${name}: a body saved in scope (with the marks) …`, savedIn.includes("snas.png") || docPrintHtml(withNo(s0, inScope), key, "bg", savedIn).includes("snas.png"));
  const printedNa = docPrintHtml(withNo(s0, na), key, "bg", savedIn);
  t(`…printed once the scheme is NA: no mark, no claim — the NA sentence`, !printedNa.includes("snas.png") && !printedNa.includes("ilac-mra") && !printedNa.includes("се провежда при акредитация") && printedNa.includes(NA_SENTENCE.bg));
  const printedIn = docPrintHtml(withNo(s0, inScope), key, "bg", savedNa);
  t(`…and a body saved NA, printed in scope: the marks`, printedIn.includes("snas.png") && !printedIn.includes(NA_SENTENCE.bg.slice(0, 30)) || !savedNa.includes(NA_SENTENCE.bg.slice(0, 30)));
  const printedUnset = docPrintHtml(withNo(s0, "PTS 23/11-A"), key, "bg", savedIn);
  t(`…and printed with the status not stated: neither`, !printedUnset.includes("snas.png") && !printedUnset.includes("се провежда при акредитация"));
}
t("the refresh keeps the rest of the body as it was", refreshAccreditation("<p>a</p><div class=\"marks\"><img class=\"ilac\"><div class=\"snasbox\"><div class=\"regno\">x</div></div></div><p>b</p>", { number: "PTS 26/01-NA-T-1", type: "T", regNo: "752/T-008" }, "bg").replace(/<div class="marks"[\s\S]*<\/div>\s*<\/div>/, "M") === "<p>a</p>M<p>b</p>");

// ── one place prints the mark ──────────────────────────────────────────────
const dir = new URL("../src/lib/docs/", import.meta.url);
const skinsDir = new URL("../src/skins/", import.meta.url);
const printing = [
  ...readdirSync(dir).map((f) => new URL(f, dir)),
  ...readdirSync(skinsDir).filter((f) => f.endsWith(".ts")).map((f) => new URL(f, skinsDir)),
  new URL("../src/lib/doc-shell.ts", import.meta.url), new URL("../src/lib/doc-css.ts", import.meta.url), new URL("../src/lib/blocks.ts", import.meta.url),
].filter((u) => /snas\.png|ilac-mra/.test(readFileSync(u, "utf8"))).map((u) => u.pathname.split("/").pop());
eq("no document, skin or shared shell prints the marks on its own — only through lib/accreditation-mark (review)", printing, []);
t("…nor claims the accreditation in its own words", readdirSync(dir).every((f) => !/operated under accreditation|се провежда при акредитация/.test(readFileSync(new URL(f, dir), "utf8"))));
const editor = readFileSync(new URL("../src/components/SchemeEditor.tsx", import.meta.url), "utf8");
t("the editor says what the documents will carry — following the form as it stands — and warns when the status is not stated (review)", /data-mark-state="unset"/.test(editor) && /markState\(\{ number, type: init\.type, kind: kindNow/.test(editor) && /value=\{accNow\}/.test(editor));
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
t("with certificates issued the status stays, as the number does — refused with its own notice (review)", /if \(hasCerts\(current\)\) \{[\s\S]{0,300}markersLockedRefused = true;[\s\S]{0,40}markers = kept;/.test(actions) && /mkl=1/.test(actions));
t("every saved body printed through the refresh (the print route, cohort documents, the round export)", /refreshAccreditation\(stripCoverMark\(editedBody\), s, lang\)/.test(readFileSync(new URL("../src/lib/doc-template.ts", import.meta.url), "utf8")));
t("outside the scope, a reminder where PTS uploads the report — the portal cannot read a file (review)", /data-mark-upload-note/.test(readFileSync(new URL("../src/app/schemes/[id]/page.tsx", import.meta.url), "utf8")));

console.log(`accreditation-mark.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
