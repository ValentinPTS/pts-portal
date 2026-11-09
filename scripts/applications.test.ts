// Plan part 5.1 — applications entered by PTS (Zadanie §7; Реш. 123, 14): the number of
// participations per characteristic → the objects computed; no approval act; PTS may
// only refuse — with a category and a reason; an application annulled or withdrawn
// with its source; each set once, the participation and its code kept, out of the round.
import { readFileSync } from "node:fs";
import { readSelections, selectionsOf, characteristicsOf, objectsNeeded, inRound, readRefusal, readSource, standingShapeOk, sameStanding, participationSets, REFUSAL_CATEGORIES, STANDING_PROBLEM_TEXT } from "../src/lib/application-model.ts";
import { addParticipant, listParticipants, updateParticipant } from "../src/lib/participants.ts";
import { PARTICIPANT_FIELDS, codedStanding } from "../src/lib/round-export.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const throws = async (f: () => Promise<unknown>, re: RegExp) => { try { await f(); return false; } catch (e) { return re.test(String((e as Error).message)); } };

// ── the model ──
eq("the application's participations per characteristic — 0 is «not taken»; only the scheme's characteristics", readSelections({ sel_0: "2", sel_1: "0", sel_2: "1", sel_9: "5" }, 3), { ok: true, selections: { "0": 2, "2": 1 } });
eq("…a whole number 0–10; at least one characteristic", [readSelections({ sel_0: "11" }, 2), readSelections({ sel_0: "1.5" }, 2), readSelections({ sel_0: "0", sel_1: "" }, 2)].map((r) => (r.ok ? "ok" : r.problem)), ["count", "count", "none"]);
eq("an older participation (before 5.1): one of each of its characteristics — or of every one", [selectionsOf({ characteristics: [1, 3] }, 4), selectionsOf({}, 2), selectionsOf({ selections: { "0": 3 } }, 2)], [{ "1": 1, "3": 1 }, { "0": 1, "1": 1 }, { "0": 3 }]);
eq("the characteristics follow from the counts", characteristicsOf({ "2": 1, "0": 3 }), [0, 2]);
eq("the objects (default, PTS to confirm): its largest count — one object serves a set; none for calibration", [objectsNeeded({ "0": 2, "1": 1 }, "T"), objectsNeeded({ "0": 1 }, "T"), objectsNeeded({ "0": 2 }, "C")], [2, 1, 0]);
eq("a refusal: a category of the list and a reason (3–300 characters)", [readRefusal("incomplete", "липсва ДДС номер"), readRefusal("bogus", "x".repeat(10)), readRefusal("other", "no")].map((r) => (r.ok ? r.category : r.problem)), ["incomplete", "category", "reason"]);
eq("an annulment's or a withdrawal's source: 3–300 characters", [readSource("писмо вх. № 12"), readSource("ab"), readSource("x".repeat(301))], ["писмо вх. № 12", null, null]);
eq("the participations follow from the counts (default, PTS to confirm): the largest — a calibration application's own", [participationSets({ "0": 2, "1": 1 }), participationSets({ "0": 1 }), participationSets({ cal: 3 }), participationSets({})], [2, 1, 3, 1]);
eq("a standing's shape — the database's (0039), for memory to refuse the same", [
  standingShapeOk(null), standingShapeOk({ state: "refused", at: "x", by: "m", category: "late", reason: "след срока" }),
  standingShapeOk({ at: "x", by: "m", source: "писмо" }), standingShapeOk({ state: "refused", at: "x", by: "m", category: "bogus", reason: "abc" }),
  standingShapeOk({ state: "withdrawn", at: "x", by: "m", source: "ab" }), standingShapeOk({ state: "annulled", at: "", by: "m", source: "грешка" }), standingShapeOk([1]),
], [true, true, false, false, false, false, false]);
t("…the same standing whatever the order of its keys (as jsonb compares)", sameStanding({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }) && !sameStanding({ a: 1 }, { a: 2 }));
t("every category and problem has its words", REFUSAL_CATEGORIES.every((c) => !!c.bg && !!c.en) && Object.values(STANDING_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));

// ── the store, in memory ──
const S = "26-05-T-1";
const p = await addParticipant({ schemeId: S, labName: "От PDF ООД", selections: { "0": 2, "1": 1 }, characteristics: [0, 1] }, "test");
const [row] = (await listParticipants(S)).filter((x) => x.id === p.id);
t("entered: a participant at once — no approval act (Реш. 123); its counts kept with it", inRound(row) && JSON.stringify(row.selections) === JSON.stringify({ "0": 2, "1": 1 }) && JSON.stringify(row.characteristics) === JSON.stringify([0, 1]));
await updateParticipant(p.id, { standing: { state: "refused", at: "2026-11-06T10:00:00Z", by: "m@ptsbg.eu", category: "incomplete", reason: "липсва ДДС номер" } }, "test");
const [after] = (await listParticipants(S)).filter((x) => x.id === p.id);
t("refused: out of the round; it and its code stay", !inRound(after) && after.code === p.code && after.standing?.state === "refused");
t("…never changed after — nor cleared", await throws(() => updateParticipant(p.id, { standing: { state: "withdrawn", at: "2026-11-06T11:00:00Z", by: "m@ptsbg.eu", source: "писмо" } }, "test"), /stays so/));
t("…the same standing again, its keys in another order, is no change", (await updateParticipant(p.id, { standing: { reason: "липсва ДДС номер", category: "incomplete", by: "m@ptsbg.eu", at: "2026-11-06T10:00:00Z", state: "refused" } }, "test")) !== null);
const q = await addParticipant({ schemeId: S, labName: "Друга ООД", selections: { "0": 1 }, characteristics: [0] }, "test");
t("memory refuses a standing the database refuses — a refusal without its reason", await throws(() => updateParticipant(q.id, { standing: { state: "refused", at: "2026-11-06T10:00:00Z", by: "m@ptsbg.eu", category: "late" } as never }, "test"), /participants_standing_shape/) && inRound((await listParticipants(S)).find((x) => x.id === q.id)!));

// ── the migration ──
const sql = readFileSync(new URL("../supabase/migrations/0039_applications.sql", import.meta.url), "utf8");
t("0039: the counts and the standing with each participation; a standing's shape — a refusal with its category (of the list) and reason, the others with their source", /add column if not exists selections jsonb/.test(sql) && /add column if not exists standing jsonb/.test(sql) && /coalesce\(standing->>'state', ''\) in \('refused', 'annulled', 'withdrawn'\)/.test(sql) && /coalesce\(standing->>'state', ''\) <> 'refused' or \(coalesce\(standing->>'category', ''\) in \('incomplete', 'conditions', 'capacity', 'late', 'other'\) and char_length\(btrim\(coalesce\(standing->>'reason', ''\)\)\) >= 3\)/.test(sql));
t("…a missing state never makes the check NULL (which would pass) — every test coalesced; an object only", /jsonb_typeof\(standing\) = 'object'/.test(sql) && !/[^(]standing->>'state' (in|<>|=)/.test(sql.slice(sql.indexOf("participants_standing_shape check"), sql.indexOf("-- out of the round once"))));
t("…set once, never changed or cleared — by every writer", /before update of standing on public\.participants/.test(sql) && /old\.standing is not null and new\.standing is distinct from old\.standing/.test(sql));
t("…the add and the update carry them; the update made again with its rights; only the server key may call", /insert into public\.participants \(id, scheme_id, code, participations, status, courier, sample_code, characteristics, selections\)/.test(sql) && /selections = case when p_coded \? 'selections'/.test(sql) && /standing = case when p_coded \? 'standing'/.test(sql) && /drop function if exists public\.identity_update_participant\(text, uuid, jsonb, jsonb\);/.test(sql) && (sql.match(/grant execute on function public\.identity_[a-z_]+\([^)]*\) to service_role;/g) ?? []).length === 2 && /'0039_applications'/.test(sql));

// ── the actions and the page ──
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const sa = actions.slice(actions.indexOf("export async function setParticipationStandingAction"));
t("refuse / annul / withdraw: participants.manage in ITS scheme; a participation of THIS scheme still in the round", /\{\n\s*const schemeId = String\(input\?\.schemeId \?\? ""\);\n\s*await requireCap\("participants\.manage", schemeId\);/.test(sa.slice(0, 400)) && /\(await listParticipants\(schemeId\)\)\.find/.test(sa) && /if \(!inRound\(own\)\) return say\(STANDING_PROBLEM_TEXT\.already\)/.test(sa));
t("…the journal: the state and a refusal's category — never its reason or a source", (sa.match(/logActivity\("participant\.(refused|annulled|withdrawn)", entry\)/g) ?? []).length === 3 && !/reason: standing|source: standing/.test(sa.slice(sa.indexOf("const entry ="), sa.indexOf("const entry =") + 400)));
t("…who to tell of a refusal found BEFORE anything is recorded (2.3) — a failed lookup refuses the act", sa.indexOf("const tell = standing.state === \"refused\" ? await labToTell(schemeId, own.code) : {};") > 0 && sa.indexOf("const tell =") < sa.indexOf("await updateParticipant(own.id") && /if \(!tell\) return \{ error: NOT_REACHED \};/.test(sa) && /notifyParticipationRefused\(tell\.labId,/.test(sa) && !/error: "\?"/.test(sa));
t("…a refusal told to the laboratory — its category and reason, held until a person releases it", /if \(standing\.state === "refused"\) \{[\s\S]{0,400}notifyParticipationRefused\(/.test(sa) && /kind: "participation\.refused"/.test(readFileSync(new URL("../src/lib/notify-events.ts", import.meta.url), "utf8")));
t("entered and corrected: the counts per characteristic read; the characteristics follow from them", (actions.match(/const sel = nChar \? readSelections\(Object\.fromEntries\(formData\.entries\(\)\), nChar\) : null;/g) ?? []).length === 2 && /\.\.\.\(sel\?\.ok \? \{ selections: sel\.selections, characteristics: characteristicsOf\(sel\.selections\) \} : \{\}\)/.test(actions) && /\.\.\.\(sel\?\.ok \? \{ characteristics: characteristicsOf\(sel\.selections\), selections: sel\.selections \} : \{\}\)/.test(actions));
t("…a scheme with no characteristics (calibration) has no counts to read — never refused for «none»", (actions.match(/const nChar = scheme\?\.parameters\.length \?\? 0;/g) ?? []).length === 2 && (actions.match(/if \(sel && !sel\.ok\) redirect/g) ?? []).length === 2);
t("a reorder of the standards moves the counts with them — never onto another standard", /const nextSel = remapSelections\(p\.selections, paramMap\);/.test(actions) && /if \(patch\.characteristics \|\| patch\.selections\) await updateParticipant\(p\.id, patch\);/.test(actions));
t("the 3.3 amendment notice — only to the participations in the round (checked here), their identities opened only", /parts = \(await listParticipants\(schemeId\)\)\.filter\(inRound\);\n\s*labOf = parts\.length \? await labIdsFor\(schemeId, parts, by\) : new Map\(\);[\s\S]{0,4000}for \(const p of parts\) await notifySchemeAmended/.test(actions));
t("…and a document released: only those in the round told (and opened)", /parts = \(await listParticipants\(schemeId\)\)\.filter\(inRound\);\n\s*labOf = await labIdsFor\(schemeId, parts, await actorNow\(\)\);/.test(actions));
t("…the acts: the not held / report notices and a calibration's processing — those in the round", /parts = \(await listParticipants\(schemeId\)\)\.filter\(inRound\);\n\s*labOf = parts\.length \? await labIdsFor\(schemeId, parts, by\) : labOf;/.test(actions) && /const codes = act === "process" && scheme\.type === "C" \? \(await listParticipants\(schemeId\)\)\.filter\(\(p\) => inFinalRound\(scheme, p\)\)\.map/.test(actions));
t("out of the round, the laboratory sends nothing more — no upload, no step of the device; no new stop for it", /if \(!inRound\(mine!\)\) redirect\("\/lab\?e=locked"\);/.test(actions) && /filter\(\(p\) => p\.schemeId === schemeId && inRound\(p\)\)/.test(actions) && /if \(d\.kind === "lab" && !d\.id && outOfRound\.has\(/.test(actions));
t("the online application's counts capped as PTS's are — one rule", /selections\[String\(i\)\] = Math\.min\(n, MAX_PER_CHARACTERISTIC\)/.test(actions) && !/selections\[String\(i\)\] = Math\.min\(n, 99\)/.test(actions));
t("the participations follow from the counts — entered, corrected and approved alike", (actions.match(/participations: sel\?\.ok \? participationSets\(sel\.selections\)/g) ?? []).length === 2 && /const total = participationSets\(app\.selections\);/.test(actions));
const R = (f: string) => readFileSync(new URL(`../src/app/schemes/[id]/${f}`, import.meta.url), "utf8");
t("the round's documents list only the participations in it; the applications page counts places so too", ["build/[doc]/page.tsx", "build/[doc]/print/route.ts", "doc/[doc]/print/route.ts"].every((f) => /const coded = \(await listParticipants\(id\)\)\.filter\(inRound\);/.test(R(f))) && /const taken = \(await listParticipants\(id\)\)\.filter\(inRound\)\.length \+ pending\.length;/.test(R("applications/page.tsx")));
t("…and the reminders: a participation out of the round owes nothing", /filter\(\(p\) => inFinalRound\(s, p\) && stillOwesResults\(p\)\)/.test(readFileSync(new URL("../src/lib/notify-reminders.ts", import.meta.url), "utf8")));
const page = readFileSync(new URL("../src/app/schemes/[id]/participants/page.tsx", import.meta.url), "utf8");
t("the page: the objects the round needs; places taken only by those in the round; counts per characteristic in the forms", /const inRoundParts = participants\.filter\(inRound\);/.test(page) && /const taken = inRoundParts\.length/.test(page) && /data-objects-total/.test(page) && (page.match(/name=\{`sel_\$\{i\}`\}/g) ?? []).length === 2 && !/name="characteristics"/.test(page));
t("…out of the round shown so, why and when; refuse / annul / withdraw offered to who manages the participants", /data-standing-detail/.test(page) && /<StandingForms /.test(page) && /\{reveal && \(out \|\| canManage\) && \(/.test(page));
t("the round export: the counts and the participations coded; the standing split — never its reason or source in coded/", PARTICIPANT_FIELDS.selections === "coded" && PARTICIPANT_FIELDS.participations === "coded" && PARTICIPANT_FIELDS.standing === "split"
  && JSON.stringify(codedStanding({ state: "refused", at: "a", by: "m", category: "late", reason: "писмо от Иван П." })) === JSON.stringify({ state: "refused", at: "a", by: "m", category: "late" })
  && JSON.stringify(codedStanding({ state: "withdrawn", at: "a", by: "m", source: "писмо от Иван П." })) === JSON.stringify({ state: "withdrawn", at: "a", by: "m" }));

console.log(`applications.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
