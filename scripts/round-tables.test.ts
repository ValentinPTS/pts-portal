// Plan part 5.12 — the round export's round tables (Реш. 136; 1.10's split; 3.14's scheme tables):
// Phase 5's records as readable coded tables — by the codes as they are now, never a name, an
// account, a carrier, a receiver, remarks or a person's words.
import { readFileSync } from "node:fs";
import { roundTables, csv } from "../src/lib/round-export.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

// planted — each a word that must never reach a coded table
const NOTE2 = "PTS-NOTE-PLANT";
const NAME = "Иван Петров-ПЛАНТ", ACCOUNT = "entityuser:U-PLANT", USER = "USER-PLANT", CARRIER = "CARRIER-PLANT", REMARK = "REMARK-PLANT", PROBLEM = "PROBLEM-PLANT", MESSAGE = "MESSAGE-PLANT", REASON = "REASON-PLANT", NOTE = "NOTE-PLANT";
const s = {
  id: "S", number: "26-01-T-1", type: "C", status: "running", parameters: [],
  calibration: { points: ["10 N", "20 N"], pointIds: ["pt-1", "pt-2"] },
  coding: [{ id: "act1", at: "2026-11-01T10:00:00Z", by: "coder@ptsbg.eu", day: "2026-11-01", codes: { Z001: "26-01-T-1-07", Z002: "26-01-T-1-03" }, ids: { Z001: "p1", Z002: "p2" }, objects: { "26-01-T-1-07": ["O-01", "O-02"] } }],
  releases: [
    { id: "r1", docKey: "instruction", level: "participation", participantId: "p1", editionId: "e1", editionNo: 2, at: "2026-11-02T10:00:00Z", by: "manager@ptsbg.eu" },
    { id: "r2", docKey: "plan", level: "user", userId: USER, editionId: "e2", editionNo: 1, at: "2026-11-02T11:00:00Z", by: "manager@ptsbg.eu", withdrawnAt: "2026-11-03T10:00:00Z", withdrawnBy: "manager@ptsbg.eu" },
  ],
  deliveries: {
    p1: {
      shipments: [{ id: "sh1", kind: "replacement", at: "2026-11-04T10:00:00Z", by: "dispatch@ptsbg.eu", day: "2026-11-04", waybill: "WB-1", carrier: CARRIER, docs: ["li-1", "li-2"], reason: REASON, handover: { time: "10:30", carrier: CARRIER, receiver: NAME } }],
      receipts: [
        { id: "rc1", shipmentId: "sh1", at: "2026-11-05T10:00:00Z", by: ACCOUNT, day: "2026-11-05", time: "09:00", checks: { "li-1": true, "li-2": false }, undamaged: true, suitable: false, remarks: REMARK, receivedBy: NAME },
        { id: "rc2", shipmentId: "chain:stop-9", at: "2026-11-06T10:00:00Z", by: ACCOUNT, day: "2026-11-06", time: "08:15", checks: {}, undamaged: true, suitable: true, remarks: "", receivedBy: NAME },
      ],
      problems: [{ id: "pr1", at: "2026-11-05T11:00:00Z", by: ACCOUNT, text: PROBLEM, resolved: { at: "2026-11-05T12:00:00Z", by: "dispatch@ptsbg.eu", note: NOTE } }],
    },
  },
  referenceValues: { versions: [{ at: "2026-11-01T09:00:00Z", by: "ref@ptsbg.eu", rows: { "pt-1": { xBefore: -0.12, xAfter: -0.1, uCal: 0.05, k: 2 } } }, { at: "2026-11-07T09:00:00Z", by: "ref@ptsbg.eu", kReason: "по сертификат", rows: { "pt-1": { xBefore: -0.12, xAfter: -0.11, uCal: 0.05, uOther: 0.01, k: 2.1 } } }] },
  labDocs: { "26-01-T-1-07": { proforma: { path: "x", name: "Проформа-ЕкоЛаб.pdf", mime: "application/pdf", size: 1, uploadedAt: "2026-11-02T08:00:00Z", uploadedBy: "a", number: "ПФ-1" }, invoice: { path: "y", name: "Фактура-ЕкоЛаб.pdf", mime: "application/pdf", size: 1, uploadedAt: "2026-11-09T08:00:00Z", uploadedBy: "a", number: "Ф-9" } } },
  paidAt: { "26-01-T-1-07": "2026-11-08", "26-01-T-1-03": "2026-11-09" },
  acknowledgements: [{ id: "a1", participantId: "p1", docKey: "declaration", kind: "declaration", editionId: "e9", editionNo: 1, sha: "abc123", lang: "bg", at: "2026-11-06T10:00:00Z", by: ACCOUNT }],
  chain: { windowWorkDays: 4, stops: [{ id: "ref-a", kind: "ref", receivedAt: "2026-10-30T08:00:00Z" }, { id: "stop-9", kind: "lab", code: "26-01-T-1-07", receivedAt: "2026-11-06T07:00:00Z", received: { by: "pts", recordedAt: "2026-11-06T09:00:00Z", recordedBy: "coder@ptsbg.eu", source: "phone", note: NOTE2 } }] },
  ackRequired: { instruction: { at: "2026-11-01T08:00:00Z", by: "manager@ptsbg.eu" } },
  deliveryMinDays: 12,
  messages: [
    { id: "m1", nonce: "n", at: "2026-11-07T10:00:00Z", by: "manager@ptsbg.eu", to: { kind: "participation", participantId: "p1" }, bg: MESSAGE, en: MESSAGE },
    { id: "m2", nonce: "n2", at: "2026-11-07T11:00:00Z", by: "manager@ptsbg.eu", to: { kind: "all", count: 1, participantIds: ["p1", "p2"], missed: ["p2"] }, bg: MESSAGE, en: MESSAGE },
  ],
} as unknown as Scheme;
const codeOf = (pid: string) => ({ p1: "26-01-T-1-07", p2: "26-01-T-1-03" } as Record<string, string>)[pid] ?? "—";
const tables = roundTables(s, codeOf);
const by = Object.fromEntries(tables.map(([f, rows, cols]) => [f, { rows: rows as Record<string, unknown>[], cols }]));
const all = tables.map(([, rows, cols]) => csv(cols, rows)).join("\n");

t("thirteen tables, each a coded/ CSV", tables.length === 13 && tables.every(([f]) => /^coded\/[a-z_]+\.csv$/.test(f)));
t("every row carries exactly its columns (none left out, none extra but empty)", tables.every(([, rows, cols]) => (rows as Record<string, unknown>[]).every((r) => Object.keys(r).every((k) => cols.includes(k)) && cols.every((c) => c in r))));
t("NOTHING planted reaches them: no name, account, user, carrier, remark, problem's words, message, reason, note", [NAME, ACCOUNT, USER, CARRIER, REMARK, PROBLEM, MESSAGE, REASON, NOTE].every((x) => !all.includes(x)), [NAME, ACCOUNT, USER, CARRIER, REMARK, PROBLEM, MESSAGE, REASON, NOTE].filter((x) => all.includes(x)).join(", "));
t("…nor a file's name (an invoice is named after its customer)", !all.includes("ЕкоЛаб"));
t("codes, never the participations' ids", !/(^|,)p[12](,|$)/m.test(all) && all.includes("26-01-T-1-07"));

const r = (f: string) => by[`coded/${f}.csv`].rows;
t("the coding act: the act, and each reference → its code and objects", r("coding_acts")[0].count === 2 && r("coding_map").some((x) => x.ref === "Z001" && x.code === "26-01-T-1-07" && x.objects === "O-01 O-02"));
t("releases: a participation's by its code; a user's — no user", r("releases")[0].code === "26-01-T-1-07" && r("releases")[1].level === "user" && r("releases")[1].code === "" && r("releases")[1].withdrawnAt === "2026-11-03T10:00:00Z");
t("shipments: the waybill, the documents, the hand-over's hour — no carrier, no reason", r("shipments")[0].waybill === "WB-1" && r("shipments")[0].docs === "li-1 li-2" && r("shipments")[0].handoverTime === "10:30");
t("receipts: the object's and the calibration device's at its stop (5.11) — fit or not, the checks failed", r("receipts").length === 2 && r("receipts")[0].suitable === "no" && r("receipts")[0].failed === "li-2" && r("receipts")[1].ofKind === "chain stop" && r("receipts")[1].ofId === "stop-9" && r("receipts")[0].ofKind === "shipment" && r("receipts")[0].ofId === "sh1");
t("problems: when, and when resolved — never the words", r("delivery_problems")[0].resolvedAt === "2026-11-05T12:00:00Z");
t("reference values: every version × point, with its nominal and the k's reason", r("reference_values").length === 2 && r("reference_values")[1].nominal === "10 N" && r("reference_values")[1].k === 2.1 && r("reference_values")[1].kReason === "по сертификат");
t("billing: per code — both numbers and dates, the payment; a payment without documents too", r("billing").length === 2 && r("billing").some((x) => x.code === "26-01-T-1-07" && x.proformaNo === "ПФ-1" && x.invoiceNo === "Ф-9" && x.paidAt === "2026-11-08" && x.proformaUploadedAt === "2026-11-02T08:00:00Z") && r("billing").some((x) => x.code === "26-01-T-1-03" && x.proformaNo === ""));
t("acknowledgements: the code, the document, the edition and its hash — no account", r("acknowledgements")[0].code === "26-01-T-1-07" && r("acknowledgements")[0].sha256 === "abc123");
t("messages: to a code or to all, with the missed by code — no text", r("scheme_messages")[0].to === "26-01-T-1-07" && r("scheme_messages")[1].to === "all" && r("scheme_messages")[1].missed === "26-01-T-1-03");
t("the chain: each stop in order, by code, who stamped it and how — never a PTS note (a person's words)", r("chain_stops").length === 2 && r("chain_stops")[1].code === "26-01-T-1-07" && r("chain_stops")[1].receivedBy === "pts" && r("chain_stops")[1].receivedSource === "phone" && !all.includes(NOTE2));
t("which documents ask for an acknowledgement — who set it, when; the round's settings", r("ack_required")[0].docKey === "instruction" && r("ack_required")[0].by === "manager@ptsbg.eu" && r("round_settings").some((x) => x.key === "deliveryMinDays" && x.value === "12") && r("round_settings").some((x) => x.key === "chainWindowWorkDays" && x.value === "4"));
t("a participation no longer listed: «—», never its id", roundTables({ ...s, acknowledgements: [{ ...s.acknowledgements![0], participantId: "gone" }] } as Scheme, codeOf).find(([f]) => f === "coded/acknowledgements.csv")![1].every((x) => (x as Record<string, unknown>).code === "—"));
t("an empty scheme: every table there, empty — never a crash", roundTables({ id: "E", number: "N", parameters: [] } as unknown as Scheme, codeOf).every(([, rows]) => (rows as unknown[]).length === 0));

const exp = readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8");
t("written into coded/ and scrubbed like every coded table — by the codes as they are now", /for \(const \[file, rows, cols\] of roundTables\(s, \(pid\) => codeById\.get\(pid\) \?\? "—"\)\) addCoded\(file, rows, cols\);/.test(exp));

console.log(`round-tables.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
