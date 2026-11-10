import type { Scheme } from "./types";
import type { Level } from "./validation-model";
import { listCorrections } from "./submissions";
import { schemeTransferState, reportInForce } from "./transfer-check-model";
import { compareSent, compareReplay } from "./replay-import";
import { levelReady, isReference, sofiaDayOf, roundKind, levelOfKind, needs20, numberReading, type AutoEvidence, type RoundKind } from "./validation-test-model";

// A replay round's test state (plan parts 8.3, 8.4) — ONE place, read by the card and by the action, so
// what the card says is ready is what the action records (8.3 review). The round's kind decides: level 1
// (the reference PTS testing round) and level 2's calibration and ILC run the whole chain — the export
// in force, 2.0's report imported after it, the transfer check of that pair «the same», and THE FILE
// THAT WAS SENT compared with the source; level 2's sampling — the data model and the number only (А9):
// the re-export compared with its source, no 2.0. The earliest day a test can be dated; the evidence.

export interface LevelState { kind: RoundKind; level: Level; missing: string[]; earliest: string; auto: AutoEvidence }

/** A read error throws — the caller says it could not be read; never «ready». */
export async function levelState(s: Scheme): Promise<LevelState> {
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
