// Plan part 9.3 — the waiting list: by the order entered; beyond the maximum; a refusal moves the next up
// before the final list; the final list leaves the waiting list out and keeps it; admitted — the first
// only, a free reserve object (a testing scheme), the minimum days (Реш. 127) — then on the list;
// «Запълнена» a label, never a closure (Реш. 120); PTS closes the applications by hand; the laboratory
// sees its state, never its place or the maximum (3.7).
import { readFileSync } from "node:fs";
import { byEntry, waitingBeforeList, waitingNow, isFullNow, admitProblem, reserveCounts, waitingOf, schemeFull, waitingAtAnnouncement, needOf, admissionsNow } from "../src/lib/waitlist-model.ts";
import { finalListOf, currentFinalList, inFinalRound } from "../src/lib/announcement-model.ts";
import { participationState } from "../src/lib/participation-state-model.ts";
import { applyOpenProblem } from "../src/lib/lab-apply-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

const P = (id: string, at: string | undefined, code = id.toUpperCase(), standing: { state: "refused" | "annulled" | "withdrawn"; at: string; by: string } | null = null) => ({ id, code, createdAt: at, standing, selections: { 0: 1 } });
const a = P("a", "2026-11-01T09:00:00Z"), b = P("b", "2026-11-01T08:00:00Z"), c = P("c", "2026-11-02T10:00:00Z"), d = P("d", undefined, "Z009");
t("the order entered: the time, then the code — a row with no time last", byEntry([a, b, c, d]).map((p) => p.id).join() === "b,a,c,d" && byEntry([P("x", "2026-11-01T08:00:00Z", "Z002"), P("y", "2026-11-01T08:00:00Z", "Z001")]).map((p) => p.id).join() === "y,x");
t("beyond the maximum — the waiting list, in order; no maximum — none", waitingBeforeList([a, b, c, d], 2).join() === "c,d" && waitingBeforeList([a, b, c], undefined).length === 0 && waitingBeforeList([a, b], 2).length === 0 && waitingBeforeList([a, b, c], 0).join() === "b,a,c");
const bOut = P("b", "2026-11-01T08:00:00Z", "B", { state: "refused", at: "x", by: "y" });
t("before the final list, a refusal moves the next up by itself", waitingBeforeList([a, bOut, c, d], 2).join() === "d");
t("after the final list — those it kept as waiting, still in the round, not admitted, in its order", waitingNow({ parts: [a, b, c, d], max: 2, finalWaitlist: ["c", "d"], admitted: [{ participantId: "c", at: "", by: "" }] }).join() === "d" && waitingNow({ parts: [a, b, c, P("d", undefined, "Z009", { state: "withdrawn", at: "", by: "" })], max: 2, finalWaitlist: ["c", "d"], admitted: [] }).join() === "c" && waitingNow({ parts: [a, bOut, c, d], max: 2, finalWaitlist: ["c", "d"], admitted: [] }).join() === "c,d");
t("«Запълнена» — the maximum reached by the applications in the round (a label, never a closure)", isFullNow([a, b], 2) && !isFullNow([a, bOut], 2) && !isFullNow([a, b, c], undefined));

// ── the final list ──
const fl = finalListOf([a, b, c, d], [0], 1, ["c", "d"]);
t("the final list leaves the waiting list out — and keeps it, in order", fl.participants.join() === "a,b" && fl.waitlist?.join() === "c,d" && finalListOf([a, b], [0], 1).waitlist === undefined);
const LIST = "2026-11-20T10:00:00.000Z";
const announced = { status: "running", lifecycle: { acts: [{ act: "announce", from: "open", to: "running", at: "", by: "", day: "" }, { act: "announce2", from: "running", to: "running", at: LIST, by: "", day: "", final: fl }] } } as unknown as Parameters<typeof currentFinalList>[0];
t("admitted from the waiting list — on the final list from then on; one the list never kept, never", currentFinalList({ ...announced, waitlistAdmitted: [{ participantId: "c", listAt: LIST }, { participantId: "zz", listAt: LIST }] })?.participants?.join() === "a,b,c" && inFinalRound({ ...announced, waitlistAdmitted: [{ participantId: "c", listAt: LIST }] }, c) && !inFinalRound(announced, c) && currentFinalList(announced)?.waitlist?.join() === "c,d");
t("review: an admission made under an EARLIER list (a step back undid it) counts for nothing", !inFinalRound({ ...announced, waitlistAdmitted: [{ participantId: "c", listAt: "2026-11-01T00:00:00.000Z" }] }, c) && admissionsNow({ ...announced, waitlistAdmitted: [{ participantId: "c", at: "", by: "", listAt: "2026-11-01T00:00:00.000Z" }] }).length === 0);
const sch = { ...announced, commercial: { maxParticipants: 2 }, waitlistAdmitted: [{ participantId: "c", at: "", by: "", listAt: LIST }] };
t("the scheme's waiting list now — after the list and an admission; «Запълнена» a yes or a no", waitingOf(sch, [a, b, c, d]).join() === "d" && schemeFull({ status: "open", commercial: { maxParticipants: 2 } }, [a, b]) === true && schemeFull({ status: "open" }, [a, b]) === false);

// ── the state the laboratory sees ──
const base = { finalList: true, onList: false, coded: true };
t("the laboratory's state: on the waiting list — «В списъка на изчакващите», never «not on the final list»; admitted — on the list", participationState({ ...base, waitlisted: true }) === "waitlisted" && participationState(base) === "not-final" && participationState({ waitlisted: true }) === "waitlisted" && participationState({ finalList: true, onList: true, coded: true }) === "confirmed");

// ── who waits: only those with a characteristic that runs (review) ──
const xOnly = (id: string, at: string) => ({ ...P(id, at), selections: { 1: 1 } });
const A1 = P("a1", "2026-11-01T01:00:00Z"), B1 = xOnly("b1", "2026-11-01T02:00:00Z"), C1 = P("c1", "2026-11-01T03:00:00Z"), D1 = P("d1", "2026-11-01T04:00:00Z"), E1 = xOnly("e1", "2026-11-01T05:00:00Z");
t("review: the waiting list at the second announcement is cut among those with a characteristic that RUNS — one with none never waits (it is told it goes no further)", waitingAtAnnouncement([A1, B1, C1, D1, E1], [0], 2, 2).join() === "d1" && waitingAtAnnouncement([A1, B1, C1, D1, E1], [0, 1], 2, 2).join() === "c1,d1,e1" && waitingAtAnnouncement([A1, C1], [0], 2, undefined).length === 0 && waitingAtAnnouncement([A1, B1], [], 0, 1).join() === "b1");
t("…the objects it needs under the list — none when none of its characteristics runs", needOf({ ...P("q", "x"), selections: { 0: 2, 1: 1 } }, [0, 1], 2) === 2 && needOf(B1, [0], 2) === 0);

// ── the admission ──
const ok = { participantId: "c", waiting: ["c", "d"], status: "running", finalListMade: true, type: "T", uncoded: 0, awaitingReceipt: 0, runs: true, need: 1, freeReserves: 1, daysLeft: 12, minDays: 10 };
t("admitted: the FIRST in line, the final list made, the minimum days (Реш. 127)", admitProblem(ok) === null && admitProblem({ ...ok, participantId: "d" }) === "not-first" && admitProblem({ ...ok, participantId: "a" }) === "not-waiting" && admitProblem({ ...ok, finalListMade: false }) === "no-list" && admitProblem({ ...ok, daysLeft: 9 }) === "too-late" && admitProblem({ ...ok, daysLeft: 10 }) === null && admitProblem({ ...ok, daysLeft: null }) === "no-deadline");
t("review: only while the scheme runs; after the coding act; after every receipt protocol; a characteristic of it running; as many free reserve objects as it NEEDS", admitProblem({ ...ok, status: "processing" }) === "state" && admitProblem({ ...ok, uncoded: 1 }) === "uncoded" && admitProblem({ ...ok, awaitingReceipt: 2 }) === "receipts" && admitProblem({ ...ok, runs: false }) === "no-run" && admitProblem({ ...ok, need: 2, freeReserves: 1 }) === "no-reserve" && admitProblem({ ...ok, freeReserves: 0 }) === "no-reserve" && admitProblem({ ...ok, need: 2, freeReserves: 2 }) === null);
t("review: a calibration scheme has no reserve objects — it is never admitted here (the instrument's route)", admitProblem({ ...ok, type: "C" }) === "calibration");
const rc = reserveCounts({ batches: [{ objects: [{ code: "R1", role: "reserve" }, { code: "R2", role: "reserve" }, { code: "P1", role: "participant" }] }, { objects: [{ code: "R3", role: "reserve" }, { code: "R4", role: "reserve" }] }], deliveries: { x: { shipments: [{ kind: "dispatch" }, { kind: "replacement" }] } }, coding: [{ objects: { T01: ["P1"], T07: ["R2"] } }] }, 1);
t("review: the reserve objects free — less those the coding act gave admitted ones, the replacements sent, and what the admissions not yet coded will take", rc.reserves === 4 && rc.given === 1 && rc.replacements === 1 && rc.pending === 1 && rc.free === 1);

// ── closed by hand ──
t("PTS closes the applications by hand — none taken; «Запълнена» never closes them", applyOpenProblem({ status: "open", applicationsClosed: { at: "x", by: "y" } }, Date.now()) === "closed" && applyOpenProblem({ status: "open" }, Date.now()) === null);

// ── the wiring ──
const actions = src("lib/actions.ts");
const sa = actions.slice(actions.indexOf("export async function secondAnnouncementAction"), actions.indexOf("// ── The waiting list (plan part 9.3"));
t("the second announcement: the waiting list beyond the maximum among those that run, off the list and kept with it; told so", /const waiting = waitingAtAnnouncement\(parts, runs, n, scheme\.commercial\?\.maxParticipants\)/.test(sa) && /finalListOf\(parts, runs, n, waiting\)/.test(sa) && /waiting\.includes\(p\.id\)\);/.test(sa));
const coding = actions.slice(actions.indexOf("export async function codingAction"), actions.indexOf("export async function codingAction") + 6000);
t("review: the coding act draws an admitted participation's objects from the RESERVE, the list's from the participants' objects", /\["reserve", todo\.filter\(\(p\) => admitted\.has\(p\.id\)\)\]/.test(coding) && /b\.objects\.filter\(\(o\) => o\.role === role && !given\.has\(o\.code\)\)/.test(coding));
t("review: the second announcement's counts leave the waiting ones out — said", /countsPerCharacteristic\(inRoundNow\.filter\(\(p\) => !waitingPre\.has\(p\.id\)\)/.test(src("app/schemes/[id]/page.tsx")) && /data-counts-without-waiting/.test(src("app/schemes/[id]/page.tsx")));
t("review: a waiting participation reads as waiting everywhere — PTS's row, the laboratory's card", /waitPos !== undefined \? L\("в списъка на изчакващите"/.test(src("app/schemes/[id]/participants/page.tsx")) && /data-waiting style/.test(src("app/lab/page.tsx")));
const wl = actions.slice(actions.indexOf("export async function setApplicationsClosedAction"), actions.indexOf("// ── Carrier offers (plan part 9.5"));
t("closing by hand and admitting: who manages the participants; the admission checked again inside the scheme's lock (one reading with the page — admissionCheck), tied to its list; on record", (wl.match(/await requireCap\("participants\.manage", schemeId\)/g) ?? []).length === 2 && /updateSchemeWith\(scheme\.id, \(cur\) => \{\s*refused = admissionCheck\(cur, parts, id,/.test(wl) && /\{ participantId: id, at, by, listAt \}/.test(wl) && /logActivity\("participant\.admitted"/.test(wl) && /logActivity\("scheme\.applications"/.test(wl) && /admissionCheck\(s, participants, waiting\[0\]/.test(src("app/schemes/[id]/participants/page.tsx")));
t("review: the old wizard honours a closed scheme too", /scheme\.status !== "open" \|\| scheme\.applicationsClosed/.test(actions));
t("the laboratory's pages: «Запълнена» through the model — never the maximum read there (3.7); its state from the waiting list", /schemeFull\(/.test(src("app/lab/apply/page.tsx")) && /schemeFull\(/.test(src("app/lab/apply/[id]/page.tsx")) && !/maxParticipants|\.commercial\b/.test(src("app/lab/apply/page.tsx") + src("app/lab/apply/[id]/page.tsx")) && /waiting: waiting\.has\(part\.id\)/.test(src("lib/participation-view.ts")));
t("PTS's «Участници»: the panel — the switch, the waiting list in order, the reserves, the reason the first waits; each row its place", /<WaitlistPanel /.test(src("app/schemes/[id]/participants/page.tsx")) && /data-waitlisted=\{waitPos\}/.test(src("app/schemes/[id]/participants/page.tsx")) && /data-waitlist-admit/.test(src("components/WaitlistPanel.tsx")));

console.log(`waitlist.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
