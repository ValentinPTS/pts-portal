import type { Scheme } from "./types";
import { listCorrections } from "./submissions";
import { schemeTransferState, reportInForce } from "./transfer-check-model";
import { compareSent } from "./replay-import";
import { levelOneReady, isReference, sofiaDayOf, type AutoEvidence } from "./validation-test-model";

// Level 1's state on a replay round (plan part 8.3) — ONE place, read by the card and by the action, so
// what the card says is ready is what the action records (8.3 review): one chain — the export in force,
// 2.0's report imported after it, the transfer check of that pair «the same», and THE FILE THAT WAS
// SENT compared with the source; the earliest day a test can be dated; the evidence frozen with it.

export interface LevelOneState { missing: string[]; earliest: string; auto: AutoEvidence }

/** A read error throws — the caller says it could not be read; never «ready». */
export async function levelOneState(s: Scheme): Promise<LevelOneState> {
  const corrections = await listCorrections(s.id);
  const st = schemeTransferState(s, corrections);
  const rep = reportInForce({ report: s.uploads?.report, active: s.docActive?.report ?? null, imports: s.analysisImports });
  const imp = rep ? s.analysisImports?.find((x) => x.id === rep.importId) : undefined;
  // the export in force: final, under the lock in force, no correction after it
  const ex = st.export && !["no-export", "preliminary", "relocked", "corrected"].includes(st.state) ? st.export : undefined;
  const diffs = ex ? await compareSent(s, ex.path) : null;
  const missing = levelOneReady({
    reference: isReference(s.replay?.of) && !s.replay?.failed,
    exported: !!ex,
    reportIn: !!rep && !!imp,
    reportAfterExport: !!ex && !!imp && Date.parse(imp.at) > Date.parse(ex.at),
    checkedSame: st.state === "ok" && st.check?.same === true,
    compared: diffs !== null,
  });
  const stamps = [s.replay?.importedAt, ex?.at, imp?.at].filter((x): x is string => !!x).sort();
  const earliest = stamps.length ? sofiaDayOf(stamps[stamps.length - 1]) : "2026-01-01";
  const auto: AutoEvidence = {
    unexpected: diffs === null ? null : diffs.filter((d) => !d.expected).length,
    ...(ex ? { exportId: ex.id, exportSha: ex.sha256 } : {}),
    ...(rep && imp ? { importId: rep.importId, analysisVersion: imp.version, reportSha: rep.sha } : {}),
    ...(st.state === "ok" && st.check ? { transferSame: st.check.same } : {}),
  };
  return { missing, earliest, auto };
}
