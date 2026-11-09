// Plan part 5.9 — the declaration Ф 4.2-2 as a tick (Реш. 118) and «изисква потвърждение» on
// any document (Реш. 117): recorded with the account, the date and the edition; never a block.
import { readFileSync } from "node:fs";
import { codedScheme, identityScheme, SCHEME_FIELDS } from "../src/lib/round-export.ts";
import { actionsFor, actionOrder } from "../src/lib/participation-state-model.ts";
import type { Scheme } from "../src/lib/types.ts";
import { readdirSync } from "node:fs";
import { ackMoment, personalAcks } from "../src/lib/ack-model.ts";
import { ackRequiredFor, ackSettable, ackOf, pendingAcks, ackCounts, readAckForm, declarationWords, ackDone, kindOf, ACK_PROBLEM_TEXT, DECLARATION, type AckScheme } from "../src/lib/ack-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const s: AckScheme = {
  ackRequired: { instruction: { at: "2026-11-01T10:00:00Z", by: "manager@pts" } },
  acknowledgements: [
    { id: "a1", participantId: "P1", docKey: "instruction", kind: "ack", editionId: "E1", editionNo: 1, at: "2026-11-02T09:00:00Z", by: "lab:u1" },
    { id: "a2", participantId: "P1", docKey: DECLARATION, kind: "declaration", editionId: "D1", editionNo: 1, sha: "abc", lang: "bg", at: "2026-11-02T09:05:00Z", by: "lab:u1" },
  ],
};

t("the declaration always asks for its tick — no setting needed (Реш. 118)", ackRequiredFor({}, DECLARATION) && !ackSettable(DECLARATION));
t("any other document asks only when it is set (Реш. 117)", ackRequiredFor(s, "instruction") && !ackRequiredFor(s, "plan") && ackSettable("plan"));
eq("the kind: the declaration signed, the rest acknowledged", [kindOf(DECLARATION), kindOf("instruction")], ["declaration", "ack"]);

t("a record is for ONE edition: edition 1 acknowledged, edition 2 not", !!ackOf(s, "P1", "instruction", "E1") && !ackOf(s, "P1", "instruction", "E2"));
t("…and for ONE participation: P1's record is not P2's", !ackOf(s, "P2", "instruction", "E1"));
t("a release from before editions: its record matches none but itself", !ackOf(s, "P1", "instruction", undefined) && !!ackOf({ acknowledgements: [{ id: "x", participantId: "P1", docKey: "plan", kind: "ack", at: "", by: "" }] }, "P1", "plan", undefined));

const docs = [
  { key: "instruction", editionId: "E2", editionNo: 2 }, // a new edition — asks again
  { key: "plan", editionId: "PL1", editionNo: 1 },       // not set — asks nothing
  { key: DECLARATION, editionId: "D1", editionNo: 1 },   // signed already
];
eq("what «Начало» lists: a new edition of an asked document; never one not asked, never one done", pendingAcks(s, "P1", docs).map((d) => d.key), ["instruction"]);
eq("…another participation: the declaration and the instruction both wait", pendingAcks(s, "P2", docs).map((d) => d.key), ["instruction", DECLARATION]);

eq("the counts per document: of the participations it reaches, those that acknowledged the edition each holds", ackCounts(s, "instruction", [{ participantId: "P1", editionId: "E1" }, { participantId: "P2", editionId: "E1" }, { participantId: "P3", editionId: "E1" }]), { done: 1, of: 3 });

t("the declaration's tick must be on", !readAckForm(DECLARATION, null).ok && !readAckForm(DECLARATION, "").ok && readAckForm(DECLARATION, "on").ok);
t("…an acknowledgement needs only the press", readAckForm("instruction", null).ok);
t("every refusal has its words, both languages", Object.values(ACK_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));

t("the tick's words name the edition — the screen and the record agree", /редакция № 2 от 05\.11\.2026/.test(declarationWords("bg", 2, "05.11.2026")) && /edition No\. 2 of 05\.11\.2026/.test(declarationWords("en", 2, "05.11.2026")) && /Ф 4\.2-2/.test(declarationWords("bg", 2, "05.11.2026")));
t("…without an edition (released before editions): no number invented", !/№/.test(declarationWords("bg", undefined, undefined)));
eq("how a record names itself", [ackDone("bg", "declaration", "10.11.2026, 14:05"), ackDone("en", "ack", "10.11.2026, 14:05")], ["Подписана на 10.11.2026, 14:05", "Acknowledged on 10.11.2026, 14:05"]);

// ── the moment as read in Bulgaria — the day AND the hour on Sofia's clock (review) ──
eq("a record after Sofia's midnight, before UTC's: the next day, in winter (EET)", ackMoment("2026-11-10T22:30:00Z"), "11.11.2026, 00:30");
eq("…and in summer (EEST)", ackMoment("2026-07-01T21:30:00Z"), "02.07.2026, 00:30");
eq("…an afternoon", ackMoment("2026-11-10T12:05:00Z"), "10.11.2026, 14:05");

// ── a document sent to one user (5.4): its acknowledgements counted apart ──
const withPersonal = { ...s, releases: [{ docKey: "instruction", level: "user", editionId: "U2" }, { docKey: "instruction", level: "user", editionId: "U3", withdrawnAt: "x" }], acknowledgements: [...s.acknowledgements!, { id: "a3", participantId: "P4", docKey: "instruction", kind: "ack" as const, editionId: "U2", editionNo: 2, at: "", by: "entityuser:u9" }, { id: "a4", participantId: "P5", docKey: "instruction", kind: "ack" as const, editionId: "U3", editionNo: 3, at: "", by: "entityuser:u8" }] };
t("personal releases: counted apart — a withdrawn one not", personalAcks(withPersonal, "instruction") === 1 && personalAcks(withPersonal, "plan") === 0);

// ── «Начало»: what asks to be acknowledged or signed — listed, never a block ──
const acts = actionsFor({ participantId: "P2", state: "received", deadline: null, unopened: [{ key: "instruction", editionId: "E1", editionNo: 1 }, { key: "plan", editionId: "PL1", editionNo: 1 }], unacked: [{ key: "instruction", kind: "ack", editionId: "E1", editionNo: 1 }, { key: DECLARATION, kind: "declaration", editionId: "D1", editionNo: 1 }] });
eq("the home lists the declaration and the acknowledgement — and a document asked for is not listed twice as «not opened»", acts.map((a) => `${a.kind}:${a.what}:${a.docKey}`), ["acknowledge:ack:instruction", "acknowledge:declaration:declaration", "document:document:plan"]);
t("…after deadlines and deliveries, before documents not opened", actionOrder({ kind: "acknowledge", participantId: "x", what: "ack" }, { kind: "delivery", participantId: "x", what: "receipt" }) > 0 && actionOrder({ kind: "acknowledge", participantId: "x", what: "ack" }, { kind: "document", participantId: "x", what: "document" }) < 0);
t("…a finished participation asks for nothing", actionsFor({ participantId: "P2", state: "scored", deadline: null, unopened: [], unacked: [{ key: DECLARATION, kind: "declaration" }] }).length === 0);

// ── the round export: the account only in identity/ (an entity user's id is the same in every round) ──
const sch = { id: "S", number: "N", ...s } as unknown as Scheme;
const coded = codedScheme(sch) as { acknowledgements?: Record<string, unknown>[]; ackRequired?: unknown };
const ident = identityScheme(sch) as { acknowledgements?: Record<string, unknown>[] };
t("export: the settings coded; the records split — the coded part without the account", SCHEME_FIELDS.ackRequired === "coded" && SCHEME_FIELDS.acknowledgements === "split" && !!coded.ackRequired && coded.acknowledgements?.length === 2 && coded.acknowledgements.every((a) => !("by" in a) && !!a.participantId && !!a.at));
t("…the identity part keeps them whole", ident.acknowledgements?.length === 2 && ident.acknowledgements.every((a) => typeof a.by === "string"));
t("…the declaration's hash stays with the coded part — the text signed is no one's name", coded.acknowledgements?.some((a) => a.sha === "abc") === true);

// ── the wiring (source shape) ──
const act = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const ackFn = act.slice(act.indexOf("export async function acknowledgeDocAction"), act.indexOf("export async function setAckRequiredAction"));
t("acknowledge: only a participation's own, going on — the same gate as the receipt protocol", /const mine = await ownGoingOn\(schemeId, pid\);\s*if \(!mine\) redirect\("\/lab"\);/.test(ackFn));
t("…the edition that reaches THIS participation, and the one the form was drawn for", /releaseFor\(scheme, docKey, viewer\)/.test(ackFn) && /if \(reaching!\.editionId !== posted\) no\("edition"\);/.test(ackFn));
t("…always a frozen edition: a release from before editions is opened first (review)", /if \(!reaching!\.editionId\) no\("open-first"\);/.test(ackFn) && /editionId: reaching!\.editionId!/.test(ackFn));
t("…the declaration without its hash: nothing saved (review)", /if \(!sha\) no\("failed"\);/.test(ackFn));
t("…re-checked in the lock: still asked, still reaching (not withdrawn), the same edition, not given yet — a second press is no second record", /updateSchemeWith\(schemeId, \(s\) => \{[\s\S]*?if \(!ackRequiredFor\(s, docKey\)\)[\s\S]*?const now = releaseFor\(s, docKey, viewer\);\s*[\s\S]*?if \(!now\) \{ refused = "not-reaching"; return \{\}; \}\s*if \(now\.editionId !== reaching!\.editionId\) \{ refused = "edition"; return \{\}; \}[\s\S]*?if \(ackOf\(s, pid, docKey, reaching!\.editionId\)\) \{ refused = "twice"; return \{\}; \}/.test(ackFn));
t("…the declaration: the hash of the edition's frozen file — the text signed (Реш. 118)", /sha = ed \? \(ed\.source === "uploaded" \? ed\.sha\.file : ed\.sha\[lang\]/.test(ackFn));
t("…journalled with the code, the document and the edition — never the account's name in the words", /targetCode: part\.code/.test(ackFn) && /summary: record\.kind === "declaration" \? `\$\{part\.code\} signed the \$\{name\}/.test(ackFn) && !/summary:[^\n]*\bby\b[^\n]*\$\{by\}/.test(ackFn));
const outside = act.slice(0, act.indexOf("// ── The declaration and the acknowledgements"));
t("NEVER a block (Реш. 117): no other action reads the acknowledgements", !/acknowledgements|ackOf\(|pendingAcks\(/.test(outside));
// …nor any route, page or module outside those that SHOW them (the whole tree, not a list — review)
const tree = (dir: string, out: string[] = []): string[] => { for (const e of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) { if (e.isDirectory()) tree(`${dir}/${e.name}`, out); else if (/\.tsx?$/.test(e.name)) out.push(`${dir}/${e.name}`); } return out; };
const SHOWS = new Set(["src/lib/ack-model.ts", "src/lib/actions.ts", "src/lib/types.ts", "src/lib/round-export.ts", "src/lib/participation-view.ts", "src/lib/participation-state-model.ts", "src/components/ParticipationLists.tsx", "src/components/AckPanel.tsx", "src/app/lab/p/[id]/page.tsx", "src/app/schemes/[id]/page.tsx", "src/app/schemes/[id]/participants/[code]/page.tsx", "src/lib/i18n.ts"]);
const readers = tree("src").filter((f) => !SHOWS.has(f) && /\.acknowledgements\b|ackOf\(|pendingAcks\(|ackRequiredFor\(|acksOfParticipation\(|from "@\/lib\/ack-model"|from "\.\/ack-model"/.test(readFileSync(new URL(`../${f}`, import.meta.url), "utf8")));
t("…nor any other file in src/ — only what shows them reads them", readers.length === 0, readers.join(", "));
const setFn = act.slice(act.indexOf("export async function setAckRequiredAction"));
t("the setting: who edits the scheme; never the declaration's; journalled; clearing keeps the records", /await requireCap\("scheme\.edit", schemeId\);/.test(setFn) && /!ackSettable\(docKey\)/.test(setFn) && /logActivity\("scheme\.ack"/.test(setFn) && !/acknowledgements:/.test(setFn));

console.log(`acknowledgements.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
