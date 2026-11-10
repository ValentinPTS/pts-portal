import { randomUUID } from "crypto";
import type { Scheme } from "./types";
import { getDb } from "./supabase";
import { isTestEnvironment } from "./environment";
import { sha256 } from "./editions";
import { readXlsx, XlsxReadError } from "./xlsx-read";
import { readReplay, replayParameters, replayCalibration, replayProviders, replayResults, type ReplayRound, type ReplayProblem } from "./replay-model";
import { blankScheme } from "./new-scheme";
import { nextProject } from "./folders";
import { listSchemeSummaries, addScheme, updateSchemeWith, schemeIdTaken } from "./store";
import { readSchemeNumber, schemeIdFromNumber } from "./scheme-number";
import { sofiaYearMonth } from "./scheme-number";
import { addReplayParticipant } from "./participants";
import { addSubmission, addCorrection } from "./submissions";
import { lockEntries, type SubmissionLock } from "./submission-lock-model";
import { sofiaDay } from "./chain";
import { schemeNowMs } from "./clock";
import { VALIDATION_BUCKET, ensureValidationBucket } from "./validation-criteria";
import type { HomogeneityValue, Batch } from "./batches-model";
import type { ReferenceRow } from "./reference-values-model";

// The closed-round import (plan part 8.2; Реш. 119, 130, 134; D8): a closed round's 2.0 input file
// made into a REPLAY round — in the TEST ENVIRONMENT only (or the local build with no database),
// never on the real portal. A SIM number (never the active series); the characteristics or points
// with their ids; the participations by code only; each one's results as one submitted version; the
// submission locked and the round in processing — an act on record. The source file is kept with
// the validation documents (private), so its re-export can be compared with it (8.3).

export type ImportProblem = "environment" | "file" | "read" | "failed";
export interface ImportOutcome { ok: true; schemeId: string; number: string; round: ReplayRound }
export interface ImportRefusal { ok: false; problem: ImportProblem; problems?: ReplayProblem[]; detail?: string; /** a round made half-way: kept, marked failed, said */ schemeId?: string; number?: string }

/** The real portal never takes a replay — the test environment does, and the local build. */
export const replayAllowedHere = () => isTestEnvironment() || !getDb();

async function keepSource(importId: string, bytes: Uint8Array): Promise<string> {
  const db = getDb();
  const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (!db) return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  // the bucket made by 8.1 takes scans only: taught the XLSX type here (8.2 review)
  await ensureValidationBucket(db);
  const path = `replays/${importId}.xlsx`;
  const { error } = await db.storage.from(VALIDATION_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw error;
  return path;
}

async function dropSource(path: string): Promise<void> {
  const db = getDb();
  if (!db || path.startsWith("data:")) return;
  const { error } = await db.storage.from(VALIDATION_BUCKET).remove([path]).catch((x) => ({ error: x as Error }));
  if (error) console.error(`[replay] a source file without its round could not be removed (${path}):`, error.message);
}

/** The kept source file's bytes — the CALLER decides who may have them. */
export async function replaySource(path: string): Promise<Uint8Array | null> {
  if (path.startsWith("data:")) { const m = path.match(/^data:[^;]+;base64,(.*)$/); return m ? new Uint8Array(Buffer.from(m[1], "base64")) : null; }
  const db = getDb();
  if (!db) return null;
  const { data, error } = await db.storage.from(VALIDATION_BUCKET).download(path);
  if (error) throw new Error(`storage (${VALIDATION_BUCKET}): ${error.message}`);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

/** Read, check and load. Nothing is made unless the whole file reads and checks. */
export async function importReplay(p: { bytes: Uint8Array; by: string }): Promise<ImportOutcome | ImportRefusal> {
  if (!replayAllowedHere()) return { ok: false, problem: "environment" };
  if (!p.bytes.byteLength || p.bytes.byteLength > 16_000_000) return { ok: false, problem: "file" };
  let sheets;
  try { sheets = readXlsx(p.bytes); } catch (e) { return { ok: false, problem: "file", detail: e instanceof XlsxReadError ? e.message : "not a readable XLSX" }; }
  const read = readReplay(sheets);
  if (!read.ok) return { ok: false, problem: "read", problems: read.problems };
  const round = read.round;

  // the number: SIM, in a series of its own (Реш. 130) — of the original's kind and activity
  const orig = readSchemeNumber(round.number);
  const kind = orig?.kind === "ILC" ? "ILC" : "PTS";
  const activity = round.type === "C" ? "C" : orig?.activity === "S" ? "S" : "T";
  const today = sofiaYearMonth();
  const auto = nextProject(await listSchemeSummaries({ includeArchived: true }), { kind, activity, na: orig?.na ?? false, simulation: true }, today.year, today.month);
  const baseId = schemeIdFromNumber(auto.number) || auto.id;
  let id = baseId, n = 2;
  while (await schemeIdTaken(id)) id = `${baseId}-${n++}`;

  const importId = randomUUID();
  const at = new Date().toISOString();
  let sourcePath: string;
  try { sourcePath = await keepSource(importId, p.bytes); } catch (e) { return { ok: false, problem: "failed", detail: (e as Error)?.message }; }

  const scheme = blankScheme({
    id, number: auto.number, type: round.type,
    titleEn: `Replay of ${round.number}`, titleBg: `Възпроизвеждане на ${round.number}`,
    objectEn: round.meta.object_title_en ?? "", objectBg: round.meta.object_title ?? "",
    distribution: round.type === "C" ? "sequential" : "simultaneous", minParticipants: 1,
  });
  scheme.name = `Възпроизвеждане на ${round.number}`;
  scheme.status = "running";
  if (kind === "ILC") scheme.kind = "ILC";
  scheme.activity = activity;
  if (round.meta.period) scheme.period = round.meta.period.slice(0, 200);
  const ids = round.characteristics.map((r) => String(r.characteristic_id ?? "").trim());
  if (round.type === "T") {
    scheme.parameters = replayParameters(round);
    scheme.characteristicSeq = scheme.parameters.length;
  } else {
    scheme.parameters = [];
    scheme.calibration = replayCalibration(round);
    // the calibration's reference values, per point (5.7)
    const rows: Record<string, ReferenceRow> = {};
    for (const c of round.calibration) rows[c.key] = { ...(c.xBefore !== undefined ? { xBefore: c.xBefore } : {}), ...(c.xAfter !== undefined ? { xAfter: c.xAfter } : {}), ...(c.uCal !== undefined ? { uCal: c.uCal } : {}), ...(c.uOther !== undefined ? { uOther: c.uOther } : {}), ...(c.k !== undefined ? { k: c.k } : {}) };
    if (Object.keys(rows).length) scheme.referenceValues = { versions: [{ at, by: p.by, rows }] };
  }
  const providers = replayProviders(round);
  if (providers.length) scheme.externalProviders = providers.map((x) => ({ id: randomUUID(), ...x }));
  // homogeneity: one batch, its values by the characteristic's id
  if (round.type === "T" && round.homogeneity.length) {
    const homogeneity: HomogeneityValue[] = round.homogeneity.map((h) => ({ series: h.series, sampleCode: h.sampleCode, characteristic: ids.indexOf(h.key), characteristicName: String(round.characteristics[ids.indexOf(h.key)]?.name ?? ""), characteristicId: h.key, replicate: h.replicate, value: h.value, at, by: p.by }));
    const batch: Batch = { id: randomUUID(), label: "Възпроизвеждане", material: "", preparedOn: "", storage: "", prefix: "R", objects: [], homogeneity, createdAt: at, createdBy: p.by };
    scheme.batches = [batch];
  }
  const nr = round.results.filter((r) => r.status === "N/R").length;
  scheme.replay = { of: round.number, importId, fileSha256: sha256(p.bytes), sourcePath, importedAt: at, by: p.by, counts: { participants: round.participants.length, characteristics: round.characteristics.length, results: round.results.length - nr, nr }, said: round.said };

  // a round that could not be made leaves no source file behind (8.2 review)
  if (!(await addScheme(scheme).catch(() => false))) { await dropSource(sourcePath); return { ok: false, problem: "failed", detail: "the scheme could not be made" }; }
  try {
    const parts: { id: string; code: string }[] = [];
    for (const rp of round.participants) {
      // its selections by the characteristic's place in the list — calibration: every point
      const selections = round.type === "T" ? Object.fromEntries(ids.map((k, i) => [String(i), rp.takes[k] ? 1 : 0]).filter(([, v]) => v)) : undefined;
      const made = await addReplayParticipant({ schemeId: id, code: rp.code, selections }, p.by);
      parts.push({ id: made.id, code: made.code });
    }
    const versions: { participantId: string; version: number }[] = [];
    const roundAt = new Date(schemeNowMs(scheme)).toISOString();
    for (const part of parts) {
      const built = replayResults(round, part.code, importId);
      if (!built) continue;
      await addSubmission({ id: randomUUID(), participantId: part.id, schemeId: id, version: 1, data: built.data, roundAt, submittedBy: `replay:${p.by}` });
      versions.push({ participantId: part.id, version: 1 });
      // a used value the file holds that differs from the reported one: the round's correction (6.5)
      for (const c of built.corrections) {
        const r = await addCorrection({ id: randomUUID(), participantId: part.id, schemeId: id, version: 1, key: c.key, field: c.field, reported: c.reported, used: c.used, reason: "Възпроизвеждане: използваната стойност от входния файл за 2.0 (част 8.2)", by: p.by });
        if (typeof r === "string") throw new Error(`the used value of ${part.code} / ${c.key} could not be recorded (${r})`);
      }
    }
    // the submission locked and the round in processing — an act on record (6.6)
    const lock: SubmissionLock = { id: randomUUID(), kind: "lock", at: new Date().toISOString(), roundAt, by: p.by, entries: lockEntries(parts, versions) };
    await updateSchemeWith(id, (cur: Scheme) => ({
      status: "processing",
      submissionLocks: [...(cur.submissionLocks ?? []), lock],
      lifecycle: { ...(cur.lifecycle ?? {}), acts: [...(cur.lifecycle?.acts ?? []), { act: "process", from: "running", to: "processing", at: lock.at, by: p.by, day: sofiaDay(lock.at), note: `Възпроизвеждане — внесен приключил кръг ${round.number} (част 8.2)` }] },
    }));
  } catch (e) {
    // half made: KEPT, marked failed and said — on the list and its page, never compared as a
    // replay; the caller journals it (8.2 review: an archived one was out of sight)
    const why = (e as Error)?.message ?? String(e);
    await updateSchemeWith(id, (cur: Scheme) => ({ replay: { ...cur.replay!, failed: why.slice(0, 300) } })).catch(() => undefined);
    return { ok: false, problem: "failed", detail: why.slice(0, 200), schemeId: id, number: auto.number };
  }
  return { ok: true, schemeId: id, number: auto.number, round };
}
