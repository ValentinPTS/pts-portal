import { type ReplayDiff } from "@/lib/replay-model";
import { compareReplay } from "@/lib/replay-import";
import { fmtMoment } from "@/lib/scheme-dates";
import type { Scheme } from "@/lib/types";

// «Възпроизвеждане» (plan part 8.2): a replay round's own card — the closed round it was loaded
// from, the source file's hash, what was carried and what was said; and the portal's re-export of
// the round compared with the source file, cell by cell. A difference not expected is the import's
// fault, or the export's — level 1 (8.3) is not run on a round that does not match its file.

export default async function ReplayCard({ s, lang }: { s: Scheme; lang: "bg" | "en" }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const r = s.replay!;
  let diffs: ReplayDiff[] | null = null;
  let unreadable = false;
  // a load that did not finish is never compared as a replay
  // the export as it is WRITTEN, read back with the same reader as the source (8.2 review)
  if (!r.failed) try {
    diffs = await compareReplay(s);
    if (diffs === null) unreadable = true;
  } catch {
    unreadable = true;
  }
  const unexpected = diffs?.filter((d) => !d.expected) ?? [];
  const expected = diffs?.filter((d) => d.expected) ?? [];
  const row = (d: ReplayDiff, i: number) => (
    <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
      <td style={{ padding: "3px 6px" }}>{d.sheet}</td>
      <td style={{ padding: "3px 6px", fontFamily: "monospace" }}>{d.column}</td>
      <td style={{ padding: "3px 6px" }}>{d.source}</td>
      <td style={{ padding: "3px 6px" }}>{d.exported}</td>
      {d.expected && <td style={{ padding: "3px 6px", color: "var(--muted)" }}>{d.expected}</td>}
    </tr>
  );
  return (
    <section className="card p-4 mt-4" id="replay" data-replay={r.of} data-replay-unexpected={diffs ? unexpected.length : "unread"}>
      <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15, margin: 0 }}>{L(`Възпроизвеждане на ${r.of}`, `Replay of ${r.of}`)}</h2>
      <p className="text-sm" style={{ color: "var(--muted)", margin: "2px 0 8px" }}>
        {L("Приключил кръг, внесен от входния файл за 2.0 — само кодове, в тестовата среда (част 8.2). Номерът е от симулационната поредица (Реш. 130).", "A closed round loaded from its 2.0 input file — codes only, in the test environment (part 8.2). Its number is from the simulation series (Реш. 130).")}
      </p>
      <div className="text-sm" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <span>{L("внесен", "loaded")} {fmtMoment(r.importedAt)} · {r.by}</span>
        <span style={{ fontFamily: "monospace" }} title={r.fileSha256}>SHA-256 {r.fileSha256.slice(0, 12)}…</span>
        <span>{L(`${r.counts.participants} участия · ${r.counts.characteristics} характеристики · ${r.counts.results} резултата · ${r.counts.nr} N/R`, `${r.counts.participants} participations · ${r.counts.characteristics} characteristics · ${r.counts.results} results · ${r.counts.nr} N/R`)}</span>
      </div>
      {r.failed && <p className="text-sm" role="alert" style={{ color: "#8f2f2f" }} data-replay-failed>{L("Внасянето не завърши — този кръг не е възпроизвеждане и не се сравнява; внесете файла отново: ", "The load did not finish — this round is not a replay and is not compared; load the file again: ")}{r.failed}</p>}
      {(r.said.excluded.length > 0 || r.said.nrNotes.length > 0) && (
        <ul className="text-sm" style={{ margin: "6px 0 0", paddingLeft: 18 }} data-replay-said>
          {r.said.excluded.length > 0 && <li>{L("«excluded» във файла (решение на 2.0 — порталът ги изпраща като докладвани): ", "«excluded» in the file (2.0's decision — the portal sends them as reported): ")}{r.said.excluded.join(", ")}</li>}
          {r.said.nrNotes.length > 0 && <li>{L("бележки към N/R във файла (порталът пише свои): ", "notes on N/R rows in the file (the portal writes its own): ")}{r.said.nrNotes.join(", ")}</li>}
        </ul>
      )}
      <h3 className="font-bold" style={{ fontSize: 14, margin: "10px 0 4px" }}>{L("Изнасянето на портала срещу изходния файл", "The portal's export against the source file")}</h3>
      {r.failed ? null : unreadable ? <p className="text-sm" role="alert" style={{ color: "#8f2f2f" }} data-replay-unread>{L("Изходният файл или кръгът не можаха да се прочетат — сравнението не е направено.", "The source file or the round could not be read — not compared.")}</p>
        : unexpected.length === 0
          ? <p className="text-sm" style={{ color: "var(--green-dark)", fontWeight: 700 }} data-replay-match>{L(`Съвпада клетка по клетка${expected.length ? ` — освен ${expected.length} очаквани разлики` : ""}.`, `Matches cell by cell${expected.length ? ` — but for ${expected.length} expected differences` : ""}.`)}</p>
          : (
            <div style={{ overflowX: "auto" }}>
              <p className="text-sm" role="alert" style={{ color: "#8f2f2f", fontWeight: 700 }}>{L(`${unexpected.length} неочаквани разлики — внасянето или изнасянето не пренася данните както са.`, `${unexpected.length} unexpected differences — the load or the export does not carry the data as it is.`)}</p>
              <table className="text-sm" style={{ borderCollapse: "collapse" }} data-replay-diffs>
                <thead><tr><th style={{ textAlign: "left", padding: "3px 6px" }}>{L("Лист", "Sheet")}</th><th style={{ textAlign: "left", padding: "3px 6px" }}>{L("Клетка", "Cell")}</th><th style={{ textAlign: "left", padding: "3px 6px" }}>{L("Във файла", "In the file")}</th><th style={{ textAlign: "left", padding: "3px 6px" }}>{L("В изнасянето", "In the export")}</th></tr></thead>
                <tbody>{unexpected.slice(0, 200).map(row)}</tbody>
              </table>
            </div>
          )}
      {expected.length > 0 && (
        <details style={{ marginTop: 6 }} data-replay-expected={expected.length}>
          <summary className="text-sm">{L(`Очаквани разлики (${expected.length})`, `Expected differences (${expected.length})`)}</summary>
          <div style={{ overflowX: "auto" }}><table className="text-sm" style={{ borderCollapse: "collapse" }}><tbody>{expected.slice(0, 200).map(row)}</tbody></table></div>
        </details>
      )}
    </section>
  );
}
