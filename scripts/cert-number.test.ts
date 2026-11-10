// Certificate numbers come from the ptsbg.eu register, typed by PTS (plan part
// 0.15; PTS, 02.11.2026, condition 1): the scheme number, «-», five digits (К7).
// Stored as the scheme's own number + the digits, however the prefix was typed;
// a laboratory gets only a certificate PTS confirmed is in the register.
import { certNumberFor, certNumberProblem, sameCertNumber, labCertificate, numberedCertificate } from "../src/lib/cert-number.ts";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const S = "PTS 26/01-T-1";
const stored = (typed: string) => { const r = certNumberFor(typed, S, []); return "no" in r ? r.no : r.problem; };

// accepted, and stored in one spelling
for (const typed of ["PTS 26/01-T-1-48217", "PTS 26/01-Т-1-48217", "  PTS  26/01-T-1-48217 ", "pts 26/01-t-1-48217",
                     "26/01-T-1-48217", "PTS 26/01–T–1-48217", "PTS26/01-T-01-48217", "РТС 26/1-Т-1-48217"]) {
  t(`stored as «${S}-48217»: «${typed}»`, stored(typed) === `${S}-48217`, String(stored(typed)));
}
// refused
t("format: four digits", certNumberProblem("PTS 26/01-T-1-4821", S, []) === "format");
t("format: six digits", certNumberProblem("PTS 26/01-T-1-482170", S, []) === "format");
t("format: no suffix", certNumberProblem("PTS 26/01-T-1", S, []) === "format");
t("format: letters in the suffix", certNumberProblem("PTS 26/01-T-1-4821A", S, []) === "format");
t("format: an en dash before the digits", certNumberProblem("PTS 26/01-T-1–48217", S, []) === "format");
t("format: empty", certNumberProblem("", S, []) === "format");
t("scheme: another scheme's number", certNumberProblem("PTS 26/02-T-1-48217", S, []) === "scheme");
t("scheme: calibration letter on a testing scheme", certNumberProblem("PTS 26/01-C-1-48217", S, []) === "scheme");
t("scheme: a double dash", certNumberProblem("PTS 26/01-T-1--48217", S, []) === "scheme");
t("ok: a space before the last dash", certNumberProblem("PTS 26/01-T-1 -48217", S, []) === null);
t("taken: another participant has it", certNumberProblem("PTS 26/01-T-1-48217", S, ["PTS 26/01-T-1-11111", "PTS 26/01-T-1-48217"]) === "taken");
t("taken: the same number in the other alphabet", certNumberProblem("PTS 26/01-T-1-48217", S, ["PTS 26/01-Т-1-48217"]) === "taken");
t("a scheme number that ends in digits works", stored.call(null, "PTS 26/01-T-12345-48217") === "scheme"
  && "no" in certNumberFor("PTS 26/01-T-12345-48217", "PTS 26/01-T-12345", []));
t("same: Т and T", sameCertNumber("PTS 26/01-Т-1-48217", "PTS 26/01-T-1-48217"));
t("not same: other digits", !sameCertNumber("PTS 26/01-T-1-48217", "PTS 26/01-T-1-48218"));

// the lab side: only a registered certificate
const certs = {
  "261101": { no: `${S}-48217`, date: "02.11.2026", registeredBy: "m@ptsbg.eu", registeredAt: "2026-11-02T10:00:00Z" },
  "261102": { no: `${S}-99999`, date: "01.11.2026" }, // made up by the portal before 0.15
};
t("a registered number is on record; the laboratory gets nothing until a person releases it (7.7)", numberedCertificate(certs, "261101")?.no === `${S}-48217` && labCertificate(certs, "261101") === undefined);
const released = { "261101": { ...certs["261101"], released: { by: "head@ptsbg.eu", at: "2026-12-01T10:00:00Z", langs: ["bg" as const] } } };
t("lab: a registered AND released certificate is given", labCertificate(released, "261101")?.no === `${S}-48217`);
t("lab: on a report issued before 7.4, a registered number is the issue (0.15) — kept (7.7 review)", labCertificate(certs, "261101", true)?.no === `${S}-48217` && labCertificate(certs, "261102", true) === undefined);
t("lab: an old made-up number is not", labCertificate(certs, "261102") === undefined);
t("lab: no certificate, nothing", labCertificate(certs, "261103") === undefined && labCertificate(undefined, "261101") === undefined);
t("lab: «__proto__» is not a code", labCertificate(certs, "__proto__") === undefined);
const simCerts = { "261101": { no: "SIM 26/11-T-1-12345", date: "02.11.2026", simulation: true } };
t("lab: a simulation round's certificate, once released, is shown (it prints «not a certificate»)", labCertificate(simCerts, "261101") === undefined && labCertificate({ "261101": { ...simCerts["261101"], released: { by: "h", at: "a", langs: ["bg" as const] } } }, "261101")?.no === "SIM 26/11-T-1-12345");
t("a SIM scheme's number is stored in its own series", "no" in certNumberFor("sim 26/11-т-1-12345", "SIM 26/11-T-1", []) && (certNumberFor("sim 26/11-т-1-12345", "SIM 26/11-T-1", []) as { no: string }).no === "SIM 26/11-T-1-12345");
t("a PTS prefix is not a SIM scheme's", certNumberProblem("PTS 26/11-T-1-12345", "SIM 26/11-T-1", []) === "scheme");

// 3.1 review: the scheme part is compared as a scheme number, the digits as digits
t("taken whatever the scheme number's spelling («26/1-T-01» is «26/01-T-1»)", certNumberProblem("PTS 26/1-T-01-48217", "PTS 26/1-T-01", ["PTS 26/01-T-1-48217"]) === "taken");
t("…and the Cyrillic prefix «РТС 26/01-Т-1»", certNumberProblem("РТС 26/01-Т-1-48217", "РТС 26/01-Т-1", ["PTS 26/01-T-1-48217"]) === "taken");
t("same: an en dash before the digits", sameCertNumber("PTS 26/01-T-1–48217", "PTS 26/01-T-1-48217"));
t("not same: other digits", !sameCertNumber("PTS 26/01-T-1-48217", "PTS 26/01-T-1-48218"));
t("not same: another scheme", !sameCertNumber("PTS 26/01-T-2-48217", "PTS 26/01-T-1-48217"));
t("an ILC scheme's certificate", stored.length > 0 && (certNumberFor("ilc 26/10-na-т-1-12345", "ILC 26/10-NA-T-1", []) as { no: string }).no === "ILC 26/10-NA-T-1-12345");

// the portal no longer makes a number up anywhere
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
t("no randomInt left in the actions", !/randomInt/.test(actions));
const viewer = readFileSync(new URL("../src/components/DocViewer.tsx", import.meta.url), "utf8");
t("no auto-issue button", !/issueAuto|Издай № \(авт\.\)/.test(viewer));
t("the form is not reset on a refusal (onSubmit, not action=)", viewer.includes("onSubmit={async (e)") && !/<form\s+action=\{async/.test(viewer));

console.log(`cert-number.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
