// Plan part 5.12 — the round export's round tables (Реш. 136; 1.10's split; 3.14's scheme tables):
// Phase 5's records as readable coded tables — by the codes as they are now, never a name, an
// account, a carrier, a receiver, remarks or a person's words.
import { readFileSync } from "node:fs";
import { codedScheme, roundTables, csv } from "../src/lib/round-export.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

// planted — each a word that must never reach a coded table
const NOTE2 = "PTS-STAMP-WORDS";
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
  // Phase 9 (9.6): the hand-closing, the waiting list kept by the list, the fixed prices, the carriers' offers
  applicationsClosed: { at: "2026-11-08T09:00:00Z", by: "manager@ptsbg.eu" },
  waitlistAdmitted: [{ participantId: "p2", at: "2026-11-20T09:00:00Z", by: "manager@ptsbg.eu", listAt: "2026-11-10T10:00:00Z" }],
  pricesFixed: { listAt: "2026-11-10T10:00:00Z", at: "2026-11-10T10:00:00Z", prices: { p1: { id: "p1", group: "", lines: [{ size: 2, kind: "full", cents: 14000 }], delivery: "addon", deliveryCents: 2550, totalCents: 16550, linked: true } } },
  carrierOffers: { p1: { offers: [{ id: "o1", carrier: CARRIER, cents: 8550, days: 4, note: NOTE, at: "2026-11-11T08:00:00Z", by: "manager@ptsbg.eu" }], sent: { noticeId: "n9", offerIds: ["o1"], at: "2026-11-11T08:10:00Z" }, choice: { offerId: "o1", at: "2026-11-11T09:00:00Z", by: ACCOUNT }, cancelled: [{ offerId: "o1", at: "x", by: ACCOUNT, cancelledAt: "2026-11-11T07:00:00Z", cancelledBy: "manager@ptsbg.eu", reason: REASON }] } },
} as unknown as Scheme;
const codeOf = (pid: string) => ({ p1: "26-01-T-1-07", p2: "26-01-T-1-03" } as Record<string, string>)[pid] ?? "—";
const tables = roundTables(s, codeOf);
const byFile = (f: string) => (tables.find(([x]) => x === f)?.[1] ?? []) as Record<string, unknown>[];
const by = Object.fromEntries(tables.map(([f, rows, cols]) => [f, { rows: rows as Record<string, unknown>[], cols }]));
const all = tables.map(([, rows, cols]) => csv(cols, rows)).join("\n");

t("twenty-three tables (6.6: the submission locks; 7.10: the transfer checks, the u(x_pt) confirmations, the R's, the access, the software record; 9.6: the hand-closing, the waiting list, the prices, the carriers' offers), each a coded/ CSV", tables.length === 23 && tables.every(([f]) => /^coded\/[a-z_]+\.csv$/.test(f)));
t("every row carries exactly its columns (none left out, none extra but empty)", tables.every(([, rows, cols]) => (rows as Record<string, unknown>[]).every((r) => Object.keys(r).every((k) => cols.includes(k)) && cols.every((c) => c in r))));
t("NOTHING planted reaches them: no name, account, user, carrier, remark, problem's words, message, reason, note", [NAME, ACCOUNT, USER, CARRIER, REMARK, PROBLEM, MESSAGE, REASON, NOTE].every((x) => !all.includes(x)), [NAME, ACCOUNT, USER, CARRIER, REMARK, PROBLEM, MESSAGE, REASON, NOTE].filter((x) => all.includes(x)).join(", "));
t("…nor a file's name (an invoice is named after its customer)", !all.includes("ЕкоЛаб"));
t("codes, never the participations' ids", !/(^|,)p[12](,|$)/m.test(all) && all.includes("26-01-T-1-07"));

const r = (f: string) => by[`coded/${f}.csv`].rows;
t("the coding act: the act, and each reference → its code and objects", r("coding_acts")[0].count === 2 && r("coding_map").some((x) => x.ref === "Z001" && x.code === "26-01-T-1-07" && x.objects === "O-01 O-02"));
t("releases: a participation's by its code; a user's — no user", r("releases")[0].code === "26-01-T-1-07" && r("releases")[1].level === "user" && r("releases")[1].code === "" && r("releases")[1].withdrawnAt === "2026-11-03T10:00:00Z");
t("shipments: the documents, the hand-over's hour — no carrier, no reason, no waybill (the security sweep, SC-3)", r("shipments")[0].waybill === undefined && r("shipments")[0].docs === "li-1 li-2" && r("shipments")[0].handoverTime === "10:30");
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

// ── Phase 9 (9.6) ──
t("9.6: the hand-closing — who, when", JSON.stringify(byFile("coded/applications_closed.csv")) === JSON.stringify([{ closedAt: "2026-11-08T09:00:00Z", closedBy: "manager@ptsbg.eu" }]));
t("9.6: the prices fixed — by code, the lines (amounts with a point), linked; never the delivery or the total (the delivery's kind says where the laboratory is — identity/prices.csv)", byFile("coded/prices.csv")[0]?.code === "26-01-T-1-07" && byFile("coded/prices.csv")[0]?.lines === "full 2 140.00" && byFile("coded/prices.csv")[0]?.linked === "yes" && !("totalEur" in (byFile("coded/prices.csv")[0] ?? {})) && !("delivery" in (byFile("coded/prices.csv")[0] ?? {})));
t("9.6 review: …and the fixing not in force (no current list — a step back) said so", byFile("coded/prices.csv")[0]?.inForce === "");
t("9.6: the carriers' offers — the amount, the days, sent, chosen (by the laboratory), cancelled — never the carrier, the note, the reason or who chose", byFile("coded/carrier_offers.csv")[0]?.eur === "85.50" && byFile("coded/carrier_offers.csv")[0]?.days === 4 && byFile("coded/carrier_offers.csv")[0]?.chosen === "yes" && byFile("coded/carrier_offers.csv")[0]?.chosenByPts === "" && byFile("coded/carrier_offers.csv")[0]?.sentAt === "2026-11-11T08:10:00Z" && byFile("coded/carrier_offers.csv")[0]?.cancelledAt === "2026-11-11T07:00:00Z" && ![CARRIER, NOTE, REASON, ACCOUNT].some((x) => JSON.stringify(byFile("coded/carrier_offers.csv")).includes(x)));
{
  const cs = JSON.stringify(codedScheme(s));
  t("9.6 review: the coded scheme — the carriers' offers and the fixed prices split: no carrier, note, reason, chooser; no delivery or total", ![CARRIER, NOTE, REASON, ACCOUNT].some((x) => cs.includes(x)) && !cs.includes("16550") && !cs.includes("addon") && cs.includes("14000"), [CARRIER, NOTE, REASON, ACCOUNT, "16550", "addon"].filter((x) => cs.includes(x)).join());
}
const acts2 = [{ act: "announce", at: "", by: "", day: "", from: "open", to: "running" }, { act: "announce2", at: "2026-11-01T10:00:00Z", by: "", day: "", from: "running", to: "running", final: { runs: [0], dropped: [], participants: ["p1"], waitlist: ["p9"] } }, { act: "back", at: "2026-11-05T10:00:00Z", by: "", day: "", from: "running", to: "open" }, { act: "announce", at: "", by: "", day: "", from: "open", to: "running" }, { act: "announce2", at: "2026-11-10T10:00:00Z", by: "", day: "", from: "running", to: "running", final: { runs: [0], dropped: [], participants: ["p1"], waitlist: ["p2", "p3"] } }];
const wl = roundTables({ id: "W", status: "running", lifecycle: { acts: acts2 }, waitlistAdmitted: [{ participantId: "p2", at: "2026-11-20T09:00:00Z", by: "manager@ptsbg.eu", listAt: "2026-11-10T10:00:00Z" }, { participantId: "p3", at: "x", by: "y", listAt: "an-earlier-list" }] } as unknown as Scheme, (pid) => ({ p2: "C02", p3: "C03", p9: "C09" } as Record<string, string>)[pid] ?? "—").find(([f]) => f === "coded/waitlist.csv")![1] as Record<string, unknown>[];
t("9.6 review: every list's waiting list, in order, each admission under ITS list; the one in force said", wl.length === 3 && wl[0].code === "C09" && wl[0].inForce === "" && wl[1].code === "C02" && wl[1].inForce === "yes" && wl[1].place === 1 && wl[1].admittedAt === "2026-11-20T09:00:00Z" && wl[2].code === "C03" && wl[2].admittedAt === "");
{
  const rex = readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8");
  t("9.6: a notice or an e-mail of carriers' offers — its words out of coded/ (the carriers are the participation's own)", /offersHidden\(n, \["bg", "en"\]\)/.test(rex) && /offersHidden\(m, \["body"\]\)/.test(rex) && /x\.kind === "carrier\.offers"/.test(rex));
  t("9.6: the registrations and the join letters — not a round, said why", /lab_applications: "the registrations of organisations and the requests to join them \(9\.1\)/.test(rex) && /"lab-docs": "the papers of registrations and account requests, and the signed letters of joins PTS decided/.test(rex));
}
console.log(`round-tables.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
