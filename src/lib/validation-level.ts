import type { Scheme } from "./types";
import type { Level } from "./validation-model";
import { listCorrections } from "./submissions";
import { schemeTransferState, reportInForce } from "./transfer-check-model";
import { compareSent, compareReplay } from "./replay-import";
import { listSentForScheme } from "./sent-messages";
import { listNoticesForScheme, isOut } from "./notifications";
import { listActivityForScheme } from "./activity-store";
import { getDb } from "./supabase";
import { isDryRunRound, scenarioHappened, type ScenarioRecords } from "./dry-run-model";
import { levelReady, isReference, sofiaDayOf, roundKind, levelOfKind, needs20, numberReading, type AutoEvidence, type RoundKind } from "./validation-test-model";

// A replay round's test state (plan parts 8.3, 8.4) — ONE place, read by the card and by the action, so
// what the card says is ready is what the action records (8.3 review). The round's kind decides: level 1
// (the reference PTS testing round) and level 2's calibration and ILC run the whole chain — the export
// in force, 2.0's report imported after it, the transfer check of that pair «the same», and THE FILE
// THAT WAS SENT compared with the source; level 2's sampling — the data model and the number only (А9):
// the re-export compared with its source, no 2.0. The earliest day a test can be dated; the evidence.

export interface LevelState { kind: RoundKind; level: Level; missing: string[]; earliest: string; auto: AutoEvidence }

/** May a level's test be run on this round at all — a replay (levels 1–2), or a dry run's simulation
 *  round (level 3; in the local build with no database, any round that is not a replay). */
export const testableRound = (s: Scheme) => (!!s.replay && !s.replay.failed) || isDryRunRound(s) || (!s.replay && !getDb());

/** A read error throws — the caller says it could not be read; never «ready». */
export async function levelState(s: Scheme): Promise<LevelState> {
  if (!s.replay) return dryRunState(s);
  const kind = roundKind(s), level = levelOfKind(kind);
  // level 2: the original number as the portal reads it — frozen with the test (8.4 review)
  const reading = s.replay ? numberReading(s.replay.of) : null;
  const numberRead = level === 2 ? !!reading && !reading.simulation : undefined;
  if (!needs20(kind)) {
    const diffs = await compareReplay(s);
    return {
      kind, level, missing: levelReady(kind, { reference: false, exported: false, reportIn: false, reportAfterExport: false, checkedSame: false, compared: diffs !== null, numberRead }),
      earliest: s.replay?.importedAt ? sofiaDayOf(s.replay.importedAt) : "2026-01-01",
      auto: { unexpected: diffs === null ? null : diffs.filter((d) => !d.expected).length, ...(numberRead !== undefined ? { numberRead } : {}) },
    };
  }
  const corrections = await listCorrections(s.id);
  const st = schemeTransferState(s, corrections);
  const rep = reportInForce({ report: s.uploads?.report, active: s.docActive?.report ?? null, imports: s.analysisImports });
  const imp = rep ? s.analysisImports?.find((x) => x.id === rep.importId) : undefined;
  // the export in force: final, under the lock in force, no correction after it
  const ex = st.export && !["no-export", "preliminary", "relocked", "corrected"].includes(st.state) ? st.export : undefined;
  const diffs = ex ? await compareSent(s, ex.path) : null;
  const missing = levelReady(kind, {
    reference: isReference(s.replay?.of) && !s.replay?.failed,
    exported: !!ex,
    reportIn: !!rep && !!imp,
    reportAfterExport: !!ex && !!imp && Date.parse(imp.at) > Date.parse(ex.at),
    checkedSame: st.state === "ok" && st.check?.same === true,
    compared: diffs !== null,
    numberRead,
  });
  const stamps = [s.replay?.importedAt, ex?.at, imp?.at].filter((x): x is string => !!x).sort();
  const earliest = stamps.length ? sofiaDayOf(stamps[stamps.length - 1]) : "2026-01-01";
  const auto: AutoEvidence = {
    unexpected: diffs === null ? null : diffs.filter((d) => !d.expected).length,
    ...(ex ? { exportId: ex.id, exportSha: ex.sha256 } : {}),
    ...(rep && imp ? { importId: rep.importId, analysisVersion: imp.version, reportSha: rep.sha } : {}),
    ...(st.state === "ok" && st.check ? { transferSame: st.check.same } : {}),
    ...(numberRead !== undefined ? { numberRead } : {}),
  };
  return { kind, level, missing, earliest, auto };
}

/** Level 1's state — the PTS testing kind (8.3's name, kept for its readers). */
export const levelOneState = levelState;
export type LevelOneState = LevelState;

/** Level 3 — the dry run (8.5): a simulation round, not a replay. What its own records PROVE, scenario by
 *  scenario — frozen with the test, each with its latest record's reference (8.5 review). */
async function dryRunState(s: Scheme): Promise<LevelState> {
  // Реш. 131's three: PT testing, calibration (sequential), ILC testing — sampling (an ILC's too) is not
  // a dry run's kind (8.5 review)
  const kind: RoundKind = s.activity === "S" ? "sampling" : roundKind(s);
  const missing = kind === "sampling" ? ["kind"] : [];
  const [sent, notices, journal] = await Promise.all([listSentForScheme(s.id), listNoticesForScheme(s.id), listActivityForScheme(s.id)]);
  const latest = <T,>(xs: readonly T[], at: (x: T) => string) => [...xs].sort((a, b) => at(b).localeCompare(at(a)))[0];
  // mail: by the latest outcome per address — a failure retried and delivered is no failure
  const lastByAddress = new Map<string, (typeof sent)[number]>();
  for (const m of [...sent].sort((a, b) => a.sentAt.localeCompare(b.sentAt))) lastByAddress.set(m.to.trim().toLowerCase(), m);
  const delivered = sent.filter((m) => m.outcome === "sent");
  const reminders = [...notices.filter((n) => (n.kind === "results.due" || n.kind === "receipt.due") && isOut(n)), ...sent.filter((m) => m.class === "reminder" && m.outcome === "sent")] as { id: string }[];
  const clockMoves = journal.filter((e) => e.action === "testclock.set" && /^Test clock moved to/.test(e.summary ?? ""));
  const unlocks = s.resultUnlocks ?? [], extensions = s.extensions ?? [];
  const corrections = (s.reportIssues ?? []).filter((i) => i.kind === "correction");
  // a WHOLE export: both parts, nothing missing (8.5 review)
  const exports = journal.filter((e) => e.action === "round.exported" && e.subject === "export:all" && !/recorded files missing/.test(e.summary ?? ""));
  const times = [...delivered.map((m) => m.sentAt), ...clockMoves.map((e) => e.at), ...unlocks.map((u) => u.at), ...corrections.map((i) => i.at), ...exports.map((e) => e.at)].filter(Boolean).sort();
  const lastSent = latest(delivered, (m) => m.sentAt), lastUnlock = latest(unlocks, (u) => u.at), lastCorr = latest(corrections, (i) => i.at), lastExport = latest(exports, (e) => e.at), lastMove = latest(clockMoves, (e) => e.at);
  const records: ScenarioRecords = {
    mail: { sent: delivered.length, pending: sent.filter((m) => m.outcome === "pending").length, failedAddresses: [...lastByAddress.values()].filter((m) => m.outcome === "failed").length },
    clockMoves: clockMoves.length,
    reminders: reminders.length,
    unlocks: unlocks.length,
    extensions: extensions.length,
    corrections: corrections.length,
    exports: exports.length,
    refs: {
      ...(lastSent ? { mail: `message:${lastSent.id}` } : {}), ...(lastMove ? { deadlines: `journal:${lastMove.id}` } : {}),
      ...(reminders[0] ? { reminder: `notice:${reminders[0].id}` } : {}), ...(lastUnlock ? { late: `unlock:${lastUnlock.id}` } : {}),
      ...(extensions.length ? { extension: `extension:${(extensions[extensions.length - 1] as { id?: string }).id ?? extensions.length}` } : {}),
      ...(lastCorr ? { reissued: `report:R${lastCorr.r}` } : {}), ...(lastExport ? { export: `journal:${lastExport.id}` } : {}),
    },
    latestAt: times.length ? times[times.length - 1] : null,
  };
  // a test is never dated before what it rests on (8.5 review, as 8.3's day rule)
  const earliest = records.latestAt ? sofiaDayOf(records.latestAt) : "2026-01-01";
  return { kind, level: 3, missing, earliest, auto: { unexpected: null, scenarios: { records, happened: scenarioHappened(records) } } };
}
