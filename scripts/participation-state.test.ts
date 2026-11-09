// Plan part 5.5 — the participation's state, read from the record; a FIXED state → stage
// map (К26); payment beside the bar, never a stage (К18; Реш. 96); «изчаква избор на
// доставчик» outside the EU and the Balkans (Реш. 128); the next deadline with its hour;
// what asks for action now.
import {
  participationState, stateFacts, STATE_STAGE, STAGES, STATE_LABEL, stageLabel, paymentMark, paymentOf, PAYMENT_LABEL,
  needsCarrierChoice, finished, nextDeadline, actionsFor, actionOrder, ACTION_LABEL, DEADLINE_LABEL, type PState, type StateInput,
} from "../src/lib/participation-state-model.ts";
import { deadlineZone } from "../src/lib/scheme-dates.ts";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── the state from the facts ──
const on = { finalList: true, onList: true, coded: true };
eq("from the record, in order: applied → confirmed → dispatched → received → submitted → scored", [
  participationState({}), participationState(on), participationState({ ...on, dispatched: true }), participationState({ ...on, dispatched: true, received: true }),
  participationState({ ...on, received: true, submitted: true }), participationState({ ...on, submitted: true, reported: true }),
], ["applied", "confirmed", "dispatched", "received", "submitted", "scored"]);
eq("…outside the EU and the Balkans, the carrier not chosen: «изчаква избор на доставчик» (Реш. 128) — until it is dispatched", [participationState({ ...on, carrierPending: true }), participationState({ ...on, carrierPending: true, dispatched: true })], ["carrier", "dispatched"]);
eq("…only on the final list: before the second announcement it is still «заявено»", participationState({ coded: true, carrierPending: true }), "applied");
eq("…the report issued without its result: N/R (Реш. 19) — when it RECEIVED an object", participationState({ ...on, received: true, reported: true }), "nr");
eq("…never N/R without a received object (design §3, review): «без получен обект», ended", [participationState({ ...on, reported: true }), participationState({ ...on, dispatched: true, reported: true })], ["no-object", "no-object"]);
t("…and it is finished, with no stage", finished("no-object") && STATE_STAGE["no-object"] === null);
eq("…ends: refused, annulled, withdrawn; not on the final list; the scheme not held", [participationState({ standing: "withdrawn", ...on }), participationState({ standing: "refused" }), participationState({ finalList: true, onList: false }), participationState({ notHeld: true })], ["withdrawn", "refused", "not-final", "not-held"]);
eq("the three states of later parts are in the map already: waiting list (9.3), results draft (phase 6), excluded (7.2)", [participationState({ waitlisted: true }), participationState({ ...on, received: true, draft: true }), participationState({ ...on, excluded: true, received: true })], ["waitlisted", "draft", "excluded"]);

// ── К26, К18 ──
t("К26: every state has its stage (or none — it ended), and every stage its words", (Object.keys(STATE_STAGE) as PState[]).every((s) => STATE_STAGE[s] === null || STAGES.includes(STATE_STAGE[s]!)) && STAGES.every((s) => !!stageLabel(s, "T").bg && !!stageLabel(s, "C").en) && Object.values(STATE_LABEL).every((v) => !!v.bg && !!v.en));
eq("К26: the stage it is IN — confirmed waits for dispatch; dispatched waits for its receipt; received is at work", (["applied", "carrier", "confirmed", "dispatched", "received", "submitted", "scored", "nr"] as PState[]).map((s) => STATE_STAGE[s]), ["application", "application", "dispatch", "receipt", "work", "results", "report", "report"]);
eq("…the work stage is named by the scheme: testing or calibration", [stageLabel("work", "T").bg, stageLabel("work", "C").bg], ["Изпитване", "Калибриране"]);
eq("…the design's stages, payment taken out (К18)", STAGES.map((s) => stageLabel(s, "T").bg), ["Заявка", "Изпращане", "Получаване", "Изпитване", "Резултати", "Окончателен доклад"]);
t("К18: payment is no stage — a mark beside the bar", !STAGES.includes("payment" as never) && paymentMark(false, false) === "none" && paymentMark(true, false) === "invoiced" && paymentMark(true, true) === "paid" && Object.values(PAYMENT_LABEL).every((v) => !!v.bg && !!v.en));
eq("…read from the record: the proforma put there, the payment noted (by code), or an older status", [
  paymentOf({}, "C1", "dispatched"),
  paymentOf({ labDocs: { C1: { proforma: { path: "x", name: "p.pdf", mime: "application/pdf", size: 1, uploadedAt: "2026-05-01T10:00:00Z" } } } } as never, "C1", "dispatched"),
  paymentOf({ paidAt: { C1: "2026-05-02T10:00:00Z" } }, "C1", "received"),
  paymentOf({ paidAt: { C2: "2026-05-02T10:00:00Z" } }, "C1", "received"),
  paymentOf({}, "C1", "invoiced"),
], ["none", "invoiced", "paid", "none", "invoiced"]);

// ── Реш. 128 ──
eq("the carrier is chosen outside the EU and the Balkans only", ["BG", "de", "RS", "XK", "EL", "TR", "US", "UA", undefined].map((c) => needsCarrierChoice(c)), [false, false, false, false, false, true, true, true, false]);
eq("…a country typed as a name is not read as outside (an unknown is never presumed)", ["Turkey", "България", "", "  "].map((c) => needsCarrierChoice(c)), [false, false, false, false]);

eq("finished — in the archive: scored, N/R, or ended", (["applied", "received", "scored", "nr", "withdrawn", "not-held"] as PState[]).map(finished), [false, false, true, true, true, true]);

// ── the facts, from the record ──
const scheme = (over: Partial<StateInput["scheme"]> = {}): StateInput["scheme"] => ({ status: "running", type: "T", ...over });
const part = (over: Partial<StateInput["part"]> = {}): StateInput["part"] => ({ id: "p1", code: "26-01-T-1-07", status: "approved", ...over });
const st = (i: Partial<StateInput>) => participationState(stateFacts({ scheme: scheme(), part: part(), events: [], ...i }));
eq("facts: an older scheme without a final list — coded, in the round: «заявено» until something happens", st({}), "applied");
eq("…a case event counts even if the status write failed (the event wins)", [st({ events: [{ kind: "items_dispatched" }] }), st({ events: [{ kind: "receipt_confirmed" }] }), st({ events: [{ kind: "results_returned" }] })], ["dispatched", "received", "submitted"]);
eq("…and the status, as before", [st({ part: part({ status: "dispatched" }) }), st({ part: part({ status: "received" }) }), st({ part: part({ status: "submitted" }) })], ["dispatched", "received", "submitted"]);
eq("…the results sheet uploaded counts as submitted", st({ scheme: scheme({ labUploads: { "26-01-T-1-07": { results: { path: "x", name: "r.pdf", mime: "application/pdf", size: 1, uploadedAt: "2026-05-10T10:00:00Z" } } } } as never) }), "submitted");
eq("…the scheme: not held; its report out (scored with results, N/R without)", [st({ scheme: scheme({ status: "not_held" }) }), st({ scheme: scheme({ status: "report" }), part: part({ status: "submitted" }) }), st({ scheme: scheme({ status: "closed" }), part: part({ status: "received" }) })], ["not-held", "scored", "nr"]);
eq("…its standing ends it, whatever else (5.1)", st({ part: part({ status: "received", standing: { state: "withdrawn", at: "2026-05-01", by: "x" } }) }), "withdrawn");
const announced = { status: "running", type: "T" as const, lifecycle: { acts: [{ id: "a1", act: "announce2", at: "2026-04-01T10:00:00Z", by: "head@ptsbg.eu", final: { participants: ["p1"], runs: [0] } }] } } as unknown as StateInput["scheme"];
const announcedWithout = { ...announced, lifecycle: { acts: [{ id: "a1", act: "announce2", at: "2026-04-01T10:00:00Z", by: "head@ptsbg.eu", final: { participants: ["p2"], runs: [0] } }] } } as unknown as StateInput["scheme"];
eq("…on the final list and coded: «потвърдено»; outside the EU and the Balkans without a carrier: «изчаква избор на доставчик»; with one chosen: «потвърдено»", [
  st({ scheme: announced }), st({ scheme: announced, country: "TR" }), st({ scheme: announced, country: "TR", part: part({ courier: "DHL Express" }) }), st({ scheme: announced, country: "RS" }),
], ["confirmed", "carrier", "confirmed", "confirmed"]);
eq("…not on the list: «не е в окончателния списък»", st({ scheme: announcedWithout }), "not-final");
eq("…not coded yet (a provisional reference): on the list, still «заявено» — the code comes at the act", st({ scheme: announced, part: part({ code: "Z001" }) }), "applied");
const chainScheme = (stops: object[], dispatchedAt?: string) => ({ status: "running", type: "C", chain: { stops, dispatchedAt } }) as unknown as StateInput["scheme"];
eq("…a calibration scheme reads the chain: on its way to it, in its hands, passed on", [
  st({ scheme: chainScheme([{ id: "s1", kind: "lab", code: "26-01-T-1-07" }], "2026-05-01T08:00:00Z") }),
  st({ scheme: chainScheme([{ id: "s1", kind: "lab", code: "26-01-T-1-07", receivedAt: "2026-05-02T08:00:00Z" }], "2026-05-01T08:00:00Z") }),
  st({ scheme: chainScheme([{ id: "s1", kind: "lab", code: "26-01-T-1-07", receivedAt: "2026-05-02T08:00:00Z", sentAt: "2026-05-04T08:00:00Z" }], "2026-05-01T08:00:00Z") }),
  st({ scheme: chainScheme([{ id: "s0", kind: "lab", code: "OTHER" }, { id: "s1", kind: "lab", code: "26-01-T-1-07" }], "2026-05-01T08:00:00Z") }),
], ["dispatched", "received", "received", "applied"]);

// ── the next deadline ──
const dated = { type: "T" as const, dates: { applicationsDue: "2026-04-10", dispatch: "2026-04-20", resultsDue: "2026-05-29T17:00", reportDue: "2026-06-30" } };
const APRIL = Date.UTC(2026, 3, 1, 9); // 1 April 2026, before every date
eq("the next deadline by the state: applications → dispatch → results (with its hour) → report", (["applied", "confirmed", "dispatched", "received", "submitted", "scored", "withdrawn"] as PState[]).map((s) => nextDeadline(dated, "C1", s, undefined, APRIL)?.at ?? null), ["2026-04-10", "2026-04-20", "2026-05-29T17:00", "2026-05-29T17:00", "2026-06-30", null, null]);
eq("…a date of PTS's that passed is not «ahead»: applications closed → the dispatch; the dispatch passed → the results", [
  nextDeadline(dated, "C1", "applied", undefined, Date.UTC(2026, 3, 15)), nextDeadline(dated, "C1", "confirmed", undefined, Date.UTC(2026, 3, 25)), nextDeadline(dated, "C1", "submitted", undefined, Date.UTC(2026, 6, 1)),
].map((d) => d?.kind ?? null), ["dispatch", "results", null]);
eq("…«изчаква избор на доставчик» starts at the dispatch — the applications are closed for one on the final list (review)", nextDeadline(dated, "C1", "carrier", undefined, APRIL)?.kind, "dispatch");
eq("…the participant's own results deadline is shown even passed — overdue is said, never hidden", nextDeadline(dated, "C1", "received", undefined, Date.UTC(2026, 5, 10))?.at, "2026-05-29T17:00");
eq("…its own extension, with the Order (3.4)", nextDeadline({ ...dated, extensions: [{ id: "e1", code: "C1", key: "resultsDue", until: "2026-06-05T12:00", orderNo: "9", orderDate: "2026-05-20", reason: "r", at: "2026-05-20T10:00:00Z", by: "head@ptsbg.eu" }] } as never, "C1", "received", undefined, APRIL), { kind: "results", at: "2026-06-05T12:00", orderNo: "9" });
eq("…a calibration scheme: its own window while it holds the instrument; none before (it starts at its receipt)", [nextDeadline({ ...dated, type: "C" }, "C1", "received", { at: "2026-05-06", orderNo: undefined }, APRIL), nextDeadline({ ...dated, type: "C" }, "C1", "dispatched", undefined, APRIL)], [{ kind: "chain", at: "2026-05-06" }, null]);
t("every deadline kind has its words", Object.values(DEADLINE_LABEL).every((v) => !!v.bg && !!v.en) && Object.values(ACTION_LABEL).every((v) => !!v.bg && !!v.en));
eq("the zone at the instant a deadline passes — summer, winter; a day alone has none", [deadlineZone("2026-05-29T17:00"), deadlineZone("2026-12-10T17:00"), deadlineZone("2026-05-29"), deadlineZone(undefined)], ["EEST", "EET", null, null]);
eq("…on the day the clocks go back (25.10.2026): 02:30 is still summer time, 05:00 is winter time", [deadlineZone("2026-10-25T02:30"), deadlineZone("2026-10-25T05:00")], ["EEST", "EET"]);

// ── what asks for action ──
const results = { kind: "results" as const, at: "2026-05-29T17:00" };
eq("actions: results due once the object is on its way or in hand; the receipt to confirm once dispatched; each document not opened", actionsFor({ participantId: "p1", state: "dispatched", deadline: results, dispatchedAt: "2026-05-04", unopened: [{ key: "instruction", editionNo: 2, editionId: "e2" }] }).map((a) => `${a.kind}:${a.what}`), ["deadline:results", "delivery:receipt", "document:document"]);
eq("…received: only the results (and documents)", actionsFor({ participantId: "p1", state: "received", deadline: results, unopened: [] }).map((a) => a.what), ["results"]);
eq("…submitted: nothing — the report is PTS's", actionsFor({ participantId: "p1", state: "submitted", deadline: { kind: "report", at: "2026-06-30" }, unopened: [] }), []);
eq("…holding the instrument: hand it on by its window", actionsFor({ participantId: "p1", state: "received", deadline: { kind: "chain", at: "2026-05-06" }, unopened: [] }).map((a) => a.what), ["chain"]);
eq("…a finished one asks for nothing — not even an unopened document", actionsFor({ participantId: "p1", state: "scored", deadline: null, unopened: [{ key: "report" }] }), []);
eq("…a day alone runs to its end: «29.05» comes after «29.05, 17:00» (review)", [
  { kind: "deadline", participantId: "day", what: "results", at: "2026-05-29" }, { kind: "deadline", participantId: "hour", what: "results", at: "2026-05-29T17:00" },
].sort(actionOrder as never).map((a) => a.participantId), ["hour", "day"]);
eq("…the order: deadlines first, the nearest first; then deliveries; then documents", [
  { kind: "document", participantId: "a", what: "document" }, { kind: "deadline", participantId: "b", what: "results", at: "2026-06-01" }, { kind: "delivery", participantId: "c", what: "receipt", at: "2026-05-01" }, { kind: "deadline", participantId: "d", what: "chain", at: "2026-05-10" },
].sort(actionOrder as never).map((a) => a.participantId), ["d", "b", "c", "a"]);

// ── the wiring (source shape) ──
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const view = src("lib/participation-view.ts");
t("the views: a laboratory's account first, then a user of its entity — never both merged: the account returns before the user's session is read", /const ls = await getLabSession\(\);\s*if \(ls\) \{[\s\S]*?return \{ kind: "lab"[^\n]*\n\s*\}\s*const ps = await getParticipantSession\(\)/.test(view));
t("…each list of its own participations is its own opening, on record (2.3)", /listVisibleParticipations\(ls\.lab\.id\)/.test(view) && /purpose: "lab\.own"/.test(view));
t("…opened = a download of THAT edition by THIS participation's code (or its reference before the coding act) — read for exactly those editions and codes", /action: "file\.downloaded", actorRole: "lab", subjects, targetCodes: codes/.test(view) && /mineCodes\.some\(\(c\) => opened\.has\(`\$\{d\.editionId\}\|\$\{c\}`\)\)/.test(view) && /\.coding \?\? \[\]\)\.flatMap/.test(view));
t("…documents only while it goes on in the round — as the document route gives them", /inFinalRound\(scheme, part\) \? docsFor\(scheme/.test(view));
const page = src("app/lab/p/[id]/page.tsx");
t("the participation's page: only one of the viewer's own, else not found", /viewer\.rows\.find\(\(r\) => r\.participantId === id\)/.test(page) && /if \(!row\) notFound\(\)/.test(page));
t("…its upload names the participation and comes back to it", /name="participantId" value=\{v\.participantId\}/.test(page) && /name="back" value=\{self\}/.test(page));
const act = src("lib/actions.ts");
t("the lab upload: the participation it names (a laboratory in a scheme twice), back only to one of its pages", /p\.schemeId === schemeId && \(!pid \|\| p\.id === pid\)/.test(act) && /\^\\\/lab\\\/p\\\/\[0-9A-Za-z-\]\{8,64\}\$/.test(act));
const parts = src("app/schemes/[id]/participants/page.tsx");
t("PTS: «изчаква избор на доставчик» only to who sees the country (§4.2) — the frozen copy's entity's country first, as its users read it", /reveal && !out && listed === true && !p\.courier\?\.trim\(\) && needsCarrierChoice\(snapshot\?\.entity\.country \|\| p\.country\)/.test(parts));
t("…the carrier's name only to who sees names; a coded viewer reads «избран»", /reveal \? \(p\.courier \|\| /.test(parts) && /L\("избран", "chosen"\)/.test(parts));
const labdoc = src("app/lab/labdoc/[scheme]/[slot]/route.ts");
t("the proforma: to a laboratory's account and to every user of its entity — each its own participation, journalled by its account (review)", /const ps = ls \? null : await getParticipantSession\(\)/.test(labdoc) && /participationsOf\(ps!\)/.test(labdoc) && /logAs\(\{ kind: "lab", userId: log\.actor \}/.test(labdoc));
t("…the certificate row only where the route serves it (a laboratory's account, until phase 7)", /const hasCert = viewer\.kind === "lab" && !!labCertificate/.test(page));
t("…the uploaded file opened by the participation it belongs to", /\/lab\/upload\/\$\{s\.id\}\/\$\{slot\}\?p=/.test(page) && /ours\.find\(\(p\) => p\.id === wanted\)/.test(src("app/lab/upload/[scheme]/[slot]/route.ts")));
t("the chain's buttons: a user of the entity may press them too — its own participation, in the round, journalled as itself (review)", /const ps = ls \? null : await getParticipantSession\(\)[\s\S]{0,800}own\.has\(p\.id\) && inRound\(p\)/.test(act) && /await mine\.log\("chain\.received"/.test(act) && /await mine\.log\("chain\.handed_over"/.test(act));

console.log(`participation-state.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
