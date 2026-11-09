// Plan part 5.6 — delivery and receipt: shipments (a dispatch with its waybill and documents,
// a replacement, a hand-over to the participant's own courier — Реш. 154), the online
// receipt protocol (Ф 7.3.4-1; «годен» = every listed check passed, Реш. 79), a problem
// signalled, and the minimum working days for a replacement (Реш. 127, А16).
import { readFileSync } from "node:fs";
import { codedDeliveries } from "../src/lib/round-export.ts";
import {
  readShipment, readReceipt, suitableFrom, openShipment, deliveryState, deliveryOf, replacementProblem, receiptReminderDue,
  receivedOtherwise, deliveryProgress, replacementCalledFor, otherReceipts,
  minDaysOf, readMinDays, DEFAULT_MIN_DAYS, DELIVERY_STATE_LABEL, SHIPMENT_PROBLEM_TEXT, RECEIPT_PROBLEM_TEXT, type ParticipationDelivery,
} from "../src/lib/delivery-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const DOCS = [{ id: "li-1", bg: "Товарителница", en: "Waybill" }, { id: "li-2", bg: "Декларация", en: "Declaration" }];
const CHECKS = [{ id: "li-3", bg: "Без видими повреди", en: "No visible damage" }, { id: "li-4", bg: "Етикетът се чете", en: "The label is legible" }];
const TODAY = "2026-05-04";

// ── a shipment ──
const ok = readShipment("dispatch", { day: "2026-05-04", waybill: " 4160221873 ", carrier: "Спиди", docs: ["li-1", "li-9", "li-1"] }, DOCS, TODAY);
eq("a dispatch: its day, waybill, carrier; only the scheme's own documents, once each", ok.ok ? ok.fields : null, { kind: "dispatch", day: "2026-05-04", waybill: "4160221873", docs: ["li-1"], carrier: "Спиди" });
eq("…refused: no day, a day ahead, no waybill", [readShipment("dispatch", { day: "", waybill: "1" }, DOCS, TODAY), readShipment("dispatch", { day: "2026-05-05", waybill: "1" }, DOCS, TODAY), readShipment("dispatch", { day: TODAY, waybill: " " }, DOCS, TODAY)].map((r) => (r.ok ? "ok" : r.problem)), ["day", "future", "waybill"]);
eq("a replacement says why", [readShipment("replacement", { day: TODAY, waybill: "W2" }, DOCS, TODAY), readShipment("replacement", { day: TODAY, waybill: "W2", reason: "негоден при получаване" }, DOCS, TODAY)].map((r) => (r.ok ? r.fields.kind : r.problem)), ["reason", "replacement"]);
const ho = readShipment("handover", { day: TODAY, time: "14:30", carrier: "DHL", receiver: "Иван Иванов" }, DOCS, TODAY);
eq("a hand-over to the participant's own courier (Реш. 154): the day, the hour, the carrier, who took it — no waybill needed", ho.ok ? ho.fields : null, { kind: "handover", day: TODAY, docs: [], carrier: "DHL", handover: { time: "14:30", carrier: "DHL", receiver: "Иван Иванов" } });
eq("…refused without the hour, the carrier, who took it", [readShipment("handover", { day: TODAY, time: "25:00", carrier: "DHL", receiver: "Иван" }, DOCS, TODAY), readShipment("handover", { day: TODAY, time: "14:30", carrier: "", receiver: "Иван" }, DOCS, TODAY), readShipment("handover", { day: TODAY, time: "14:30", carrier: "DHL", receiver: "" }, DOCS, TODAY)].map((r) => (r.ok ? "ok" : r.problem)), ["time", "carrier", "receiver"]);

// ── the receipt protocol ──
const rec = (over: Record<string, unknown> = {}) => readReceipt({ day: TODAY, time: "11:24", checks: { "li-3": "yes", "li-4": "yes" }, undamaged: "yes", remarks: "", receivedBy: "Мария Петрова", ...over } as never, CHECKS, TODAY);
const r1 = rec();
t("the protocol: every check yes and undamaged — «годен» (Реш. 79)", r1.ok && r1.fields.suitable === true && r1.fields.checks["li-3"] === true);
const r2 = rec({ checks: { "li-3": "yes", "li-4": "no" } });
t("…one check no — «негоден», whatever else", r2.ok && r2.fields.suitable === false);
const r3 = rec({ undamaged: "no" });
t("…damaged packaging — «негоден»", r3.ok && r3.fields.suitable === false);
eq("…every check answered, the hour and who received it required; never a day ahead", [rec({ checks: { "li-3": "yes" } }), rec({ time: "" }), rec({ receivedBy: " " }), rec({ day: "2026-05-05" }), rec({ undamaged: "" })].map((r) => (r.ok ? "ok" : r.problem)), ["checks", "time", "receiver", "future", "undamaged"]);
const r4 = readReceipt({ day: TODAY, time: "09:00", checks: { "li-99": "no" }, undamaged: "yes", receivedBy: "Мария" } as never, [], TODAY);
t("…an empty list asks only the packaging; an answer to no listed check is ignored", r4.ok && r4.fields.suitable === true && Object.keys(r4.fields.checks).length === 0);
t("«годен» is computed, never typed", suitableFrom({ "li-3": true, "li-4": true }, CHECKS, true) && !suitableFrom({ "li-3": true }, CHECKS, true));

// ── where it stands ──
const sh = (id: string, day = TODAY) => ({ id, kind: "dispatch" as const, at: `${day}T08:00:00Z`, by: "x", day, waybill: id, docs: [] });
const rc = (shipmentId: string, suitable: boolean) => ({ id: `r-${shipmentId}`, shipmentId, at: "x", by: "lab:1", day: TODAY, time: "10:00", checks: {}, undamaged: suitable, suitable, remarks: "", receivedBy: "M" });
const D = (shipments: ReturnType<typeof sh>[], receipts: ReturnType<typeof rc>[] = []): ParticipationDelivery => ({ shipments, receipts, problems: [] });
eq("states: to send → sent (awaiting the protocol) → fit / unfit", [deliveryState(D([])), deliveryState(D([sh("s1")])), deliveryState(D([sh("s1")], [rc("s1", true)])), deliveryState(D([sh("s1")], [rc("s1", false)]))], ["to-send", "sent", "fit", "unfit"]);
eq("…a replacement after an unfit receipt awaits its own protocol", [openShipment(D([sh("s1"), sh("s2")], [rc("s1", false)]))?.id, deliveryState(D([sh("s1"), sh("s2")], [rc("s1", false)]))], ["s2", "sent"]);
t("every state has its words", Object.values(DELIVERY_STATE_LABEL).every((v) => !!v.bg && !!v.en) && Object.values(SHIPMENT_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en) && Object.values(RECEIPT_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));
eq("deliveryOf: by the participation's id — never a key up the prototype chain", [deliveryOf({ deliveries: { p1: D([sh("s1")]) } }, "p1").shipments.length, deliveryOf({ deliveries: {} }, "constructor").shipments.length, deliveryOf({}, "p1").receipts.length], [1, 0, 0]);

// ── review: received otherwise; the state after a replacement; a replacement called for ──
const shR = (id: string, at: string, day = TODAY) => ({ ...sh(id, day), at, recordedAt: at });
const withRec = (d: ParticipationDelivery) => d;
eq("a protocol dated before the object left: refused", (() => { const r = readReceipt({ day: "2026-05-03", time: "10:00", checks: { "li-3": "yes", "li-4": "yes" }, undamaged: "yes", receivedBy: "Мария" } as never, CHECKS, TODAY, "2026-05-04"); return r.ok ? "ok" : r.problem; })(), "before");
const dOpen = withRec(D([shR("s1", "2026-05-04T08:00:00Z")]));
eq("received otherwise after the latest shipment: a signed scan, or PTS's own step — never one from before it", [
  receivedOtherwise(dOpen, { scanAt: "2026-05-05T09:00:00Z", stepsAt: [] }), receivedOtherwise(dOpen, { scanAt: "2026-05-03T09:00:00Z", stepsAt: [] }),
  receivedOtherwise(dOpen, { stepsAt: ["2026-05-05T10:00:00Z"] }), receivedOtherwise(D([]), { scanAt: "2026-05-05T09:00:00Z", stepsAt: [] }),
], [true, false, true, false]);
eq("…read from the record: the scan's upload, PTS's own steps (a voided one never)", otherReceipts({ labUploads: { C1: { protocol: { uploadedAt: "X" } } } }, "C1", [{ kind: "receipt_confirmed", source: "manual", recordedAt: "A" }, { kind: "receipt_confirmed", source: "manual", recordedAt: "B", voidedAt: "V" }, { kind: "receipt_confirmed", source: "auto", recordedAt: "C" }]), { scanAt: "X", stepsAt: ["A"] });
const afterRepl = D([shR("s1", "2026-05-04T08:00:00Z"), shR("s2", "2026-05-06T08:00:00Z", "2026-05-06")], [rc("s1", false)]);
eq("the state after a replacement: sent again — received only with the LATEST shipment's protocol", [deliveryProgress(afterRepl, false), deliveryProgress(D([shR("s1", "2026-05-04T08:00:00Z")], [rc("s1", false)]), false), deliveryProgress(D([]), false)], [{ dispatched: true, received: false }, { dispatched: true, received: true }, null]);
eq("…the scan state: «получено» without online checks", deliveryState(dOpen, true), "received");
const prob = (at: string, resolved = false) => ({ id: `x${at}`, at, by: "lab:1", text: "t", ...(resolved ? { resolved: { at, by: "h", note: "n" } } : {}) });
eq("a replacement is called for: the latest unfit — or a problem since the latest shipment, still open; never twice for one reason", [
  replacementCalledFor(D([shR("s1", "2026-05-04T08:00:00Z")], [rc("s1", false)])),
  replacementCalledFor(afterRepl),
  replacementCalledFor({ ...D([shR("s1", "2026-05-04T08:00:00Z")]), problems: [prob("2026-05-05T08:00:00Z")] }),
  replacementCalledFor({ ...D([shR("s1", "2026-05-04T08:00:00Z"), shR("s2", "2026-05-06T08:00:00Z")]), problems: [prob("2026-05-05T08:00:00Z")] }),
  replacementCalledFor({ ...D([shR("s1", "2026-05-04T08:00:00Z")]), problems: [prob("2026-05-05T08:00:00Z", true)] }),
], [true, false, true, false, false]);

// ── Реш. 127: the minimum working days for a replacement ──
const off = new Set<string>();
eq("the minimum: 10 working days by default; a scheme's own between 1 and 60", [minDaysOf({}), minDaysOf({ deliveryMinDays: 15 }), minDaysOf({ deliveryMinDays: 0 }), minDaysOf({ deliveryMinDays: 2.5 }), DEFAULT_MIN_DAYS], [10, 15, 10, 10, 10]);
eq("…as typed", ["12", "0", "61", "x", " 7 "].map(readMinDays), [12, null, null, null, 7]);
eq("a replacement: allowed with the minimum working days left to the participant's own deadline; refused below, saying how many", [
  replacementProblem("T", "2026-05-29T17:00", "2026-05-04", 10, off), replacementProblem("T", "2026-05-12", "2026-05-04", 10, off), replacementProblem("T", undefined, TODAY, 10, off), replacementProblem("C", "2026-05-29", TODAY, 10, off),
], [null, { problem: "too-late", left: 6 }, { problem: "no-deadline" }, { problem: "calibration" }]);
eq("…official holidays do not count (6 May 2026)", replacementProblem("T", "2026-05-15", "2026-05-04", 9, new Set(["2026-05-06"])), { problem: "too-late", left: 8 });

// ── the receipt reminder ──
eq("the receipt reminder: 3 working days after the dispatch, while no protocol is in", [receiptReminderDue(D([sh("s1", "2026-05-04")]), "2026-05-06", off)?.id ?? null, receiptReminderDue(D([sh("s1", "2026-05-04")]), "2026-05-07", off)?.id ?? null, receiptReminderDue(D([sh("s1", "2026-05-04")], [rc("s1", true)]), "2026-05-20", off)], [null, "s1", null]);

// ── the round export: the coded part keeps no person ──
const full = { p1: { shipments: [{ id: "s1", kind: "handover" as const, at: "a", by: "head@ptsbg.eu", day: TODAY, docs: [], carrier: "DHL", handover: { time: "14:30", carrier: "DHL", receiver: "Иван Иванов" } }], receipts: [{ id: "r1", shipmentId: "s1", at: "a", by: "entityuser:u-9", day: TODAY, time: "10:00", checks: { "li-3": true }, undamaged: true, suitable: true, remarks: "получи Мария", receivedBy: "Мария Петрова" }], problems: [{ id: "x1", at: "a", by: "lab:7", text: "Позвънете на Петров", resolved: { at: "b", by: "head@ptsbg.eu", note: "ok" } }] } };
const codedText = JSON.stringify(codedDeliveries(full));
t("export: the coded part keeps what went and arrived, fit or not — never who received it, the courier's receiver, remarks, a problem's words, or the account", ["Иван Иванов", "Мария", "Петров", "entityuser:", "lab:7"].every((x) => !codedText.includes(x)) && codedText.includes("\"suitable\":true") && codedText.includes("14:30"));

// ── the wiring (source shape) ──
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const act = src("lib/actions.ts");
const dispatch = act.slice(act.indexOf("export async function dispatchAction"), act.indexOf("export async function resolveDeliveryProblemAction"));
t("dispatch: the capability «dispatch» in THIS scheme (D18); testing only; while running; on the final list; coded", /await requireCap\("dispatch", schemeId\)/.test(dispatch) && /scheme\.type === "C"/.test(dispatch) && /status !== "running"/.test(dispatch) && /inFinalRound\(scheme!, part\)/.test(dispatch) && /isProvisional\(part!\.code\)\) redirect\(back\("err=uncoded"\)\)/.test(dispatch));
t("…one object — a second only as a replacement, after an unfit protocol or a problem, with the minimum working days (Реш. 127)", /kind !== "replacement" && d\.shipments\.length\) redirect\(back\("err=twice"\)\)/.test(dispatch) && /if \(!replacementCalledFor\(d\)\) redirect\(back\("err=fit"\)\)/.test(dispatch) && /replacementProblem\(scheme!\.type, resultsDeadline\(scheme!, part!\.code\)\.at, today, minDaysOf\(scheme!\)/.test(dispatch));
t("…who to tell looked up BEFORE it is recorded (2.3); re-checked in the lock; the participation told; journalled", dispatch.indexOf("labToTell(schemeId, part!.code)") < dispatch.indexOf("updateSchemeWith(") && /if \(s\.status !== "running"\)/.test(dispatch) && /notifyItemsDispatched\(tell!\.labId/.test(dispatch) && /logActivity\("delivery\.dispatched"/.test(dispatch));
const receipt = act.slice(act.indexOf("export async function submitReceiptAction"), act.indexOf("export async function reportDeliveryProblemAction"));
t("the protocol: only its own participation, going on — a laboratory's account or a user of its entity", /async function ownGoingOn[\s\S]{0,1200}listVisibleParticipations\(ls\.lab\.id\)[\s\S]{0,300}participationsOf\(ps!\)[\s\S]{0,400}inFinalRound\(scheme, part\)/.test(act) && /const mine = await ownGoingOn\(schemeId, pid\)/.test(receipt));
t("…for the shipment awaiting it, the form naming that shipment; once — re-checked in the lock", /d0\.receipts\.some\(\(r\) => r\.shipmentId === posted\)\) redirect\(ownBack\(pid, "e=receipt-twice"\)\)/.test(receipt) && /posted !== open\.id/.test(receipt) && /if \(openShipment\(d\)\?\.id !== open!\.id\) \{ refused = true/.test(receipt));
t("…«годен» computed from the scheme's checks (Реш. 79); the receipt on the case file; PTS told", /readReceipt\(\{[\s\S]*?\}, scheme\.lists\?\.receiptChecks/.test(receipt) && /kind: "receipt_confirmed"/.test(receipt) && /notifyReceiptProtocol\(schemeId, scheme\.number, part\.code, fields\.suitable\)/.test(receipt));
t("…the person who received it never in the journal's words (§4.2, N4)", !/summary: `[^`]*receivedBy/.test(receipt) && !/summary: `[^`]*fields\.remarks/.test(receipt));
const page = src("app/deliveries/page.tsx");
t("«Доставки»: the schemes the person may dispatch in; addresses only with names in that scheme, as one opening for dispatch", /schemesFor\(await getViewer\(\), "dispatch"\)/.test(page) && /const names = await mayNow\("names\.view", s\.id\)/.test(page) && /purpose: "dispatch"/.test(page));
t("the case file's «back» — only to the scheme's own pages (an open redirect closed)", /returnTo\.startsWith\(`\/schemes\/\$\{schemeId\}\/`\)/.test(act));
const resolve = act.slice(act.indexOf("export async function resolveDeliveryProblemAction"), act.indexOf("export async function setDeliveryMinDaysAction"));
t("the resolution's note: in the record, never in the journal's words (N4, review)", /resolved: \{ at, by: actor, note \}/.test(resolve) && !/summary: `[^`]*\$\{note\}/.test(resolve) && !/after: \{[^}]*note/.test(resolve));
t("a replacement: the latest shipment as seen, re-checked in the lock with the call for it (review)", /const seen = String\(formData\.get\("after"\)/.test(dispatch) && /fresh\.shipments\[fresh\.shipments\.length - 1\]\?\.id !== seen \|\| !replacementCalledFor\(fresh\)/.test(dispatch));
t("…the carrier never in the case file's note nor the journal (a participant's courier is identity — review)", !/note: `[^`]*fields\.carrier/.test(dispatch) && !/summary: `[^`]*fields\.carrier/.test(dispatch) && !/after: \{[^}]*carrier/.test(dispatch));
t("the participant: only while the round runs; a handful of open problems at once", /scheme\.status !== "running"\) redirect\(ownBack\(pid, "e=receipt-state"\)\)/.test(receipt) && /openProblems\(deliveryOf\(scheme, pid\)\)\.length >= MAX_OPEN_PROBLEMS/.test(act));
t("a testing scheme's dispatch only through «Доставки» — the case file's step refused", /kind === "items_dispatched" && \(await getScheme\(schemeId\)\)\?\.type === "T"\) redirect/.test(act));
t("a template releases only a reminder of its own kind — at raising and at delivery (review)", /isReminderKind\(rest\.kind\) && releasedByTemplate\.startsWith\(`template:\$\{rest\.kind\}@`\)/.test(src("lib/notifications.ts")) && /isReminderKind\(n\.kind\) && n\.releasedBy\.startsWith\(`template:\$\{n\.kind\}@`\)/.test(src("lib/notify-deliver.ts")));
const rem = src("lib/notify-reminders.ts");
t("the receipt reminder: from PTS's template «receipt.due», once per shipment; received read from the record, not the status (a replacement is awaited again — review)", /getReminderTemplate\("receipt\.due"\)/.test(rem) && /receiptDue@\$\{p\.id\}:\$\{sh\.id\}/.test(rem) && /if \(receivedOtherwise\(d, otherReceipts\(s, p\.code/.test(rem) && !/includes\(p\.status\)/.test(rem));

console.log(`delivery.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
