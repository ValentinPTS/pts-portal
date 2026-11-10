// Plan part 9.2 — the online application by the laboratory: open for applications (started and taking
// them, the deadline on the round's day, never a draft); the form read (the entity's active
// laboratory, 5.1's counts per characteristic, a calibration scheme's number, the delivery); the
// accreditation warning (Реш. 108 — never a block); the participation «from the portal» (0050); the
// wiring (an approved organisation, one per laboratory, the copy at once, PTS told).
import { readFileSync } from "node:fs";
import { applyOpenProblem, readLabApply, labAccreditationWarning, earlierProblem, OWN_COURIER, APPLY_PROBLEM_TEXT } from "../src/lib/lab-apply-model.ts";
import { addParticipant, listParticipants } from "../src/lib/participants.ts";
import { PARTICIPANT_FIELDS } from "../src/lib/round-export.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

// ── open for applications ──
// Sofia is UTC+2 in November: 20.11 23:59:59 Sofia = 21:59:59Z
const open = { status: "open" as const, dates: { applicationsDue: "2026-11-20" } };
t("open: a started scheme taking applications, its deadline a day — open to its very end (Sofia)", applyOpenProblem(open, Date.parse("2026-11-19T10:00:00Z")) === null && applyOpenProblem(open, Date.parse("2026-11-20T21:59:00Z")) === null && applyOpenProblem(open, Date.parse("2026-11-20T22:00:01Z")) === "deadline");
const hour = { status: "open" as const, dates: { applicationsDue: "2026-11-20T09:00" } };
t("review: a deadline with its hour — closed from that minute, never at midnight", applyOpenProblem(hour, Date.parse("2026-11-20T06:59:00Z")) === null && applyOpenProblem(hour, Date.parse("2026-11-20T07:01:00Z")) === "deadline");
t("…a deadline that does not read is no open door", applyOpenProblem({ status: "open", dates: { applicationsDue: "20.11.2026" } }, Date.parse("2026-01-01T00:00:00Z")) === "deadline");
t("…no deadline set — open", applyOpenProblem({ status: "open" }, Date.parse("2030-01-01T00:00:00Z")) === null);
t("…a draft, a running, a closed or a not-held scheme — not open (Реш. 147: a draft never)", (["draft", "running", "processing", "report", "closed", "not_held"] as const).every((st) => applyOpenProblem({ status: st }, Date.parse("2026-11-01T00:00:00Z")) === "not-open"));

// ── the form ──
const L1 = "00000000-0000-4000-8000-0000000000a1", L2 = "00000000-0000-4000-8000-0000000000a2";
const o = { characteristicCount: 3, laboratoryIds: [L1, L2] };
const ok = readLabApply({ laboratoryId: L2, delivery: "own", sel_0: "2", sel_1: "", sel_2: "1" }, o);
t("the counts per characteristic — 5.1's reader; the participations follow from the largest; the own courier", ok.ok && JSON.stringify(ok.value.selections) === JSON.stringify({ 0: 2, 2: 1 }) && ok.value.participations === 2 && ok.value.ownCourier && ok.value.laboratoryId === L2, JSON.stringify(ok));
const bad = (i: Record<string, unknown>, oo = o) => { const r = readLabApply(i, oo); return r.ok ? "ok" : r.problem; };
t("…the laboratory: one of the entity's ACTIVE ones only (another's, an inactive one, none — refused)", bad({ laboratoryId: "00000000-0000-4000-8000-0000000000ff", sel_0: "1" }) === "laboratory" && bad({ sel_0: "1" }) === "laboratory");
t("…a count 1–10, at least one characteristic; the delivery PTS's or own", bad({ laboratoryId: L1, sel_0: "11" }) === "count" && bad({ laboratoryId: L1, sel_0: "x" }) === "count" && bad({ laboratoryId: L1, sel_0: "0" }) === "none" && bad({ laboratoryId: L1, sel_0: "1", delivery: "drone" }) === "delivery" && bad({ laboratoryId: L1, sel_0: "1" }) === "ok");
const cal = { characteristicCount: 0, laboratoryIds: [L1] };
const c = readLabApply({ laboratoryId: L1, participations: "3", delivery: "pts" }, cal);
t("a calibration scheme (no characteristics): the number of participations, 1–10 — no selections", c.ok && c.value.selections === null && c.value.participations === 3 && !c.value.ownCourier && bad({ laboratoryId: L1, participations: "0" }, cal) === "count" && bad({ laboratoryId: L1, participations: "11" }, cal) === "count" && bad({ laboratoryId: L1 }, cal) === "count");
t("review: the characteristics' signature posted with the form — another (changed meanwhile) refused; none expected, none asked", bad({ laboratoryId: L1, sel_0: "1", paramSig: "old" }, { ...o, signature: "new" }) === "changed" && bad({ laboratoryId: L1, sel_0: "1", paramSig: "new" }, { ...o, signature: "new" }) === "ok");
t("review: the laboratory's earlier participations — one in the round «already»; refused or withdrawn — through PTS; only an annulled one leaves the way open", earlierProblem([{ standing: null }]) === "already" && earlierProblem([{ standing: { state: "refused" } }]) === "refused" && earlierProblem([{ standing: { state: "withdrawn" } }]) === "refused" && earlierProblem([{ standing: { state: "annulled" } }]) === null && earlierProblem([{ standing: { state: "annulled" } }, { standing: null }]) === "already" && earlierProblem([]) === null);
t("Реш. 108: the warning when the scheme asks for accreditation and the laboratory has none — only then", labAccreditationWarning({ accreditationRequired: true }, "") && labAccreditationWarning({ accreditationRequired: true }, "няма") && !labAccreditationWarning({ accreditationRequired: true }, "123 ЛИ") && !labAccreditationWarning({ accreditationRequired: false }, "") && !labAccreditationWarning(undefined, ""));
t("every refusal has words, both languages", Object.values(APPLY_PROBLEM_TEXT).every((x) => x.bg.length > 5 && x.en.length > 5));

// ── «from the portal» (0050) ──
const S = "lab-apply-test-scheme";
const a = await addParticipant({ schemeId: S, labName: "Лаб А", source: "portal", courier: OWN_COURIER, selections: { 0: 1 }, characteristics: [0] }, "test");
await addParticipant({ schemeId: S, labName: "Лаб Б" }, "test");
const rows = await listParticipants(S);
t("a participation applied online is «portal»; entered by PTS «pts» (the default)", rows.find((r) => r.id === a.id)?.source === "portal" && rows.find((r) => r.id !== a.id)?.source === "pts" && rows.find((r) => r.id === a.id)?.courier === OWN_COURIER);
t("…coded data — exported with the codes (1.10), never who applied", PARTICIPANT_FIELDS.source === "coded");

// ── the wiring ──
const actions = src("lib/actions.ts");
const act = actions.slice(actions.indexOf("export async function labApplyAction"), actions.indexOf("// ── A frozen copy per participation"));
t("the action: a participant's user; an approved organisation (Реш. 12); never a draft; open on the round's own clock", /const ps = await requireParticipant\(\)/.test(act) && /if \(entity\.state !== "active"\) return say\("entity"\)/.test(act) && /if \(!scheme \|\| !isStarted\(scheme\)\) return say\("not-open"\)/.test(act) && /applyOpenProblem\(scheme, schemeNowMs\(scheme\)\)/.test(act));
t("…the entity's ACTIVE laboratories, opened as its own; the earlier participations decide (earlierProblem); the signature checked", /openLaboratories\(\{ actor, purpose: "lab\.own" \}, \{ entityId: entity\.id \}\)\)\.filter\(\(l\) => l\.state === "active"\)/.test(act) && /earlierProblem\(/.test(act) && /signature: paramsSignature\(scheme\.parameters\)/.test(act));
t("review: with a database — the participant and its copy in ONE transaction, one at a time per laboratory and scheme (never two, never one without its copy)", /addParticipant\(input, actor, \(row, identity\) => applyOnlineWithIdentity\(row, identity, lab\.id, user\.id, actor\)\)/.test(act) && /applied for the scheme already/.test(act));
t("…in memory — the same steps one at a time; a copy not taken — annulled at once, journalled only when it is", /applyQueue\.get\(key\)/.test(act) && /freezeParticipation\(made\.id, lab\.id, user\.id, actor\)/.test(act) && /if \(annulled\) await logAs/.test(act));
t("…a participant as PTS enters one (5.1): the counts, the sets, from the portal", /source: "portal" as const/.test(act) && /participationSets\(sel\)/.test(act));
t("…PTS told (the scheme's number only) and taken to «Участници»; on record as the laboratory's act — never a name; a provisional reference never given back", /notifyApplicationReceived\(scheme\.id, scheme\.number, "participants"\)/.test(act) && /logAs\(\{ kind: "lab", userId: whoId \}, "participant\.applied_online"/.test(act) && !/lab\.name\}|user\.name\}/.test(act.slice(act.indexOf("participant.applied_online"))) && /isProvisional\(p\.code\) \? \{\} : \{ code: p\.code \}/.test(act));
const mig0 = readFileSync(new URL("../supabase/migrations/0050_online_applications.sql", import.meta.url), "utf8");
t("review: 0050's one transaction — the lock per scheme and laboratory, the refusal of a second (the latest copy, not annulled), the add and the copy together; the server only", /pg_advisory_xact_lock\(hashtextextended\('apply-online:'/.test(mig0) && /coalesce\(p\.standing->>'state', ''\) <> 'annulled'/.test(mig0) && /perform public\.identity_add_participant\(p_actor, p_row, p_fields\);\s*v := public\.identity_participation_freeze\(/.test(mig0) && /grant execute on function public\.identity_apply_online\(text, jsonb, jsonb, uuid, uuid\) to service_role/.test(mig0));
t("review: PTS's «Участници» warns from the copy's laboratory (an online application has no account)", /const accWarnFor = /.test(src("app/schemes/[id]/participants/page.tsx")) && /sn\.laboratory\.accreditationNo/.test(src("app/schemes/[id]/participants/page.tsx")));
t("the portal: «Заявяване» for every user of the entity; the form shows the warning, never blocks on it", /tab\("\/lab\/apply"/.test(src("components/ParticipantNav.tsx")) && /data-apply-warning/.test(src("components/LabApplyForm.tsx")) && !/disabled=\{[^}]*warning/.test(src("components/LabApplyForm.tsx")));
t("PTS's «Участници»: «от портала» and when", /p\.source === "portal" && <span data-source-portal/.test(src("app/schemes/[id]/participants/page.tsx")));
t("the old public wizard stays closed — it points to the portal (sign-in, registration) and to the PDF (Реш. 146)", /href="\/lab\/login"/.test(src("app/apply/page.tsx")) && /href="\/register"/.test(src("app/apply/[id]/page.tsx")) && /export const ONLINE_APPLICATIONS_OPEN = false;/.test(src("lib/online-applications.ts")));
const mig = readFileSync(new URL("../supabase/migrations/0050_online_applications.sql", import.meta.url), "utf8");
t("migration 0050: the source column (pts | portal), the add function writing it, for the server only; listed", /add column if not exists source text not null default 'pts'/.test(mig) && /check \(source in \('pts', 'portal'\)\)/.test(mig) && /coalesce\(p_row->>'source', 'pts'\)/.test(mig) && /grant execute on function public\.identity_add_participant\(text, jsonb, jsonb\) to service_role/.test(mig) && /"0050_online_applications"/.test(src("lib/migrations-list.ts")));

console.log(`lab-apply.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
