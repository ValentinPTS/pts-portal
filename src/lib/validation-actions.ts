"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapAnywhere } from "./access";
import { getRoleContext } from "./roles";
import { logActivity } from "./activity";
import { sofiaDay } from "./chain";
import { readCriteriaForm, sniffMime } from "./validation-model";
import { recordCriteria, voidCriteria } from "./validation-criteria";
import { importReplay, replayAllowedHere } from "./replay-import";
import { getScheme } from "./store";
import type { ReplayImportState } from "./replay-model";
import { listCriteria } from "./validation-criteria";
import { readTestForm, testResult, criteriaOf, restsOn, isReference, editionUnderTests } from "./validation-test-model";
import { levelState, testableRound, type LevelState } from "./validation-level";
import { recordTest, voidTest, listTests } from "./validation-tests";

// «Валидиране» (plan part 8.1; Реш. 134): record a signed edition of the acceptance criteria, or
// void one recorded by mistake. The head and the quality manager (validation.record) — never the
// software administrator, whose work is what is validated (П 7.4.1 т. 3). The journal names the
// edition, the day signed and the levels — never the file.

const back = (answer: string) => redirect(`/validation?v=${encodeURIComponent(answer)}#criteria`);

export async function recordCriteriaAction(formData: FormData): Promise<void> {
  await requireCapAnywhere("validation.record");
  const by = (await getRoleContext()).email ?? "build";
  const read = readCriteriaForm({ edition: formData.get("edition"), signedOn: formData.get("signedOn"), signedBy: formData.get("signedBy"), levels: formData.getAll("level"), note: formData.get("note") }, sofiaDay(new Date().toISOString()));
  if (!read.ok) back(read.problem);
  const v = read as Extract<typeof read, { ok: true }>;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back("file");
  const f = file as File;
  // an edition signed on or before a recorded test's day would change what that test rests on (8.3 review)
  let under = false;
  try { under = editionUnderTests(await listTests(), v.signedOn); } catch { back("failed"); }
  if (under) back("under-tests");
  const bytes = new Uint8Array(await f.arrayBuffer());
  // the type the file IS, by its bytes — not the one the browser named (8.1 review)
  const r = await recordCriteria({ edition: v.edition, signedOn: v.signedOn, signedBy: v.signedBy, levels: v.levels, note: v.note, file: { bytes, mime: sniffMime(bytes) ?? f.type, name: f.name }, by });
  if (!r.ok) back(r.error);
  const e = (r as Extract<typeof r, { ok: true }>).entry;
  // a journal line that cannot be written: the edition stays (it is PTS's signed paper, on
  // record), and the page says the line is missing — never a record silently unjournalled
  const logged = await logActivity("validation.criteria_recorded", {
    subject: `validation_criteria:${e.id}`,
    after: { edition: e.edition, signedOn: e.signedOn, levels: e.levels, sha256: e.fileSha256, size: e.fileSize, mime: e.fileMime },
    summary: `Acceptance criteria edition ${e.edition}, signed ${e.signedOn}, levels ${e.levels.join(", ")} — recorded with the signed document`,
  });
  revalidatePath("/validation");
  back(logged ? "recorded" : "recorded-unlogged");
}

export async function voidCriteriaAction(formData: FormData): Promise<void> {
  await requireCapAnywhere("validation.record");
  const by = (await getRoleContext()).email ?? "build";
  const id = String(formData.get("id") ?? "");
  // an edition a recorded test rests on is not voided (8.1 review; the database holds it too, 0046)
  let rests = false;
  try { rests = restsOn(await listTests(), id); } catch { back("failed"); }
  if (rests) back("rests");
  const r = await voidCriteria({ id, reason: String(formData.get("reason") ?? ""), by });
  if (!r.ok) back(r.error);
  const e = (r as Extract<typeof r, { ok: true }>).entry;
  const logged = await logActivity("validation.criteria_voided", {
    subject: `validation_criteria:${e.id}`,
    before: { edition: e.edition, signedOn: e.signedOn, levels: e.levels },
    after: { voided: true, reason: e.voided?.reason },
    summary: `Acceptance criteria edition ${e.edition} (signed ${e.signedOn}) voided: ${e.voided?.reason}`,
  });
  revalidatePath("/validation");
  back(logged ? "voided" : "voided-unlogged");
}

/** «Внеси приключил кръг» (plan part 8.2): a closed round's coded 2.0 input file → a replay round,
 *  in the test environment only. The head and the software administrator (system.technical) —
 *  loading data is technical; recording a test is not (8.1). Journalled: the original number, the
 *  counts, the file's hash — never a value. */
export async function importReplayAction(_prev: ReplayImportState, formData: FormData): Promise<ReplayImportState> {
  await requireCapAnywhere("system.technical");
  if (!replayAllowedHere()) return { problem: "environment" };
  const by = (await getRoleContext()).email ?? "build";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 16_000_000) return { problem: "file" };
  const hint = String(formData.get("kind") ?? "");
  const r = await importReplay({ bytes: new Uint8Array(await file.arrayBuffer()), by, kindHint: hint === "T" || hint === "S" || hint === "ILC" ? hint : "" });
  if (!r.ok) {
    // a round made half-way stays, marked failed — and is journalled (8.2 review)
    if (r.schemeId) await logActivity("validation.replay_failed", { schemeId: r.schemeId, subject: `scheme:${r.schemeId}`, summary: `Replay load not finished — ${r.number}, kept and marked failed: ${r.detail ?? ""}` });
    return { problem: r.problem, ...(r.problems ? { problems: r.problems.slice(0, 60) } : {}), ...(r.detail ? { detail: r.detail.slice(0, 200) } : {}), ...(r.schemeId ? { schemeId: r.schemeId, number: r.number } : {}) };
  }
  const s = await getScheme(r.schemeId);
  const logged = await logActivity("validation.replay_imported", {
    schemeId: r.schemeId, subject: `scheme:${r.schemeId}`,
    after: { of: r.round.number, sha256: s?.replay?.fileSha256, counts: s?.replay?.counts, kind: s?.replay?.kind, kindGiven: s?.replay?.kindGiven ?? null },
    summary: `Replay of ${r.round.number} loaded as ${r.number} — ${r.round.participants.length} participations by code, ${r.round.results.length} result rows; the submission locked, in processing`,
  });
  revalidatePath("/validation");
  return { ok: true, schemeId: r.schemeId, number: r.number, ...(logged ? {} : { unlogged: true }) };
}

const backTo = (schemeId: string, answer: string) => redirect(`/schemes/${encodeURIComponent(schemeId)}?vt=${encodeURIComponent(answer)}#level-test`);

/** «Запиши изпитването» (plan part 8.3; Реш. 134): a level's test on a round — judged against the
 *  criteria edition in force that day for that level (none: refused); the items a person compared;
 *  what the portal checked by itself, frozen now; the result by the rule, never by the word. The head
 *  or the quality manager (validation.record) — never the software administrator. */
export async function recordTestAction(formData: FormData): Promise<void> {
  await requireCapAnywhere("validation.record");
  const by = (await getRoleContext()).email ?? "build";
  const schemeId = String(formData.get("schemeId") ?? "");
  const s = await getScheme(schemeId);
  // a replay that finished (levels 1–2), or a dry run's simulation round (level 3)
  if (!s || !testableRound(s)) redirect("/validation?vt=scheme#tests");
  const sc = s!;
  // the chain and what the portal checks by itself — computed NOW, the same as the card shows (8.3
  // review); the level and the kind are the ROUND's, never the form's (8.4)
  let state: LevelState;
  try { state = await levelState(sc); } catch { backTo(schemeId, "failed"); }
  const st = state!;
  const level = st.level;
  if (level === 1 && !isReference(sc.replay?.of)) backTo(schemeId, "reference");
  if (st.missing.length) backTo(schemeId, "not-ready");
  const read = readTestForm(st.kind, { testedOn: formData.get("testedOn"), scope: formData.get("scope"), conclusion: formData.get("conclusion"), item: (k) => ({ result: formData.get(`item_${k}`), note: formData.get(`note_${k}`) }) }, sofiaDay(new Date().toISOString()), st.earliest, level);
  if (!read.ok) backTo(schemeId, read.problem);
  const v = read as Extract<typeof read, { ok: true }>;
  let criteria;
  try { criteria = criteriaOf(await listCriteria(), level, v.testedOn); } catch { backTo(schemeId, "failed"); }
  if (!criteria) backTo(schemeId, "criteria");
  const c = criteria!;
  const file = formData.get("file");
  const f = file instanceof File && file.size > 0 ? file : null;
  const bytes = f ? new Uint8Array(await f.arrayBuffer()) : null;
  const r = await recordTest({
    level, kind: st.kind, testedOn: v.testedOn, schemeId, schemeNumber: sc.number, ...(sc.replay ? { replayOf: sc.replay.of } : {}),
    criteriaId: c.edition.id, criteriaEdition: c.edition.edition, criteriaRecordedAfter: c.recordedAfter,
    scope: v.scope, items: v.items, auto: st.auto, result: testResult(v.items, st.auto, st.kind, level), conclusion: v.conclusion, recordedBy: by,
  }, f && bytes ? { bytes, mime: sniffMime(bytes) ?? f.type, name: f.name } : null);
  if (!r.ok) backTo(schemeId, r.error);
  const e = (r as Extract<typeof r, { ok: true }>).entry;
  const logged = await logActivity("validation.test_recorded", {
    schemeId, subject: `validation_test:${e.id}`,
    after: { level: e.level, testedOn: e.testedOn, result: e.result, criteriaEdition: e.criteriaEdition, unexpected: e.auto.unexpected, importId: e.auto.importId ?? null },
    summary: `Level ${e.level} test (${e.kind}) on ${sc.number}${sc.replay ? ` (replay of ${sc.replay.of})` : " (dry run)"}, ${e.testedOn} — ${e.result === "pass" ? "PASSES" : "FAILS"}, against acceptance criteria edition ${e.criteriaEdition}`,
  });
  revalidatePath("/validation");
  backTo(schemeId, logged ? `recorded-${e.result}` : "recorded-unlogged");
}

/** One recorded by mistake is voided with the reason, never deleted. */
export async function voidTestAction(formData: FormData): Promise<void> {
  await requireCapAnywhere("validation.record");
  const by = (await getRoleContext()).email ?? "build";
  const r = await voidTest({ id: String(formData.get("id") ?? ""), reason: String(formData.get("reason") ?? ""), by });
  if (!r.ok) redirect(`/validation?vt=${r.error}#tests`);
  const e = (r as Extract<typeof r, { ok: true }>).entry;
  // the reason is on the voiding's own record — the journal line carries no words typed (8.3 review)
  const logged = await logActivity("validation.test_voided", { subject: `validation_test:${e.id}`, before: { level: e.level, testedOn: e.testedOn, result: e.result }, after: { voided: true }, summary: `Level ${e.level} test of ${e.testedOn} on ${e.schemeNumber} voided` });
  revalidatePath("/validation");
  redirect(`/validation?vt=${logged ? "voided" : "voided-unlogged"}#tests`);
}
