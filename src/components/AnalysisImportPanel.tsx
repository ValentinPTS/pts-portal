import { IMPORT_LABEL, IMPORT_PROBLEM_TEXT, MAX_IMPORT_BYTES, importInForce, type AnalysisImport, type ImportedFile } from "@/lib/analysis-import-model";
import AnalysisImportForm from "./AnalysisImportForm";
import { fmtMoment } from "@/lib/scheme-dates";

// «Внеси от PTS_Analysis 2.0» (plan part 7.2) — on the scheme's page. The form while the scheme is
// in processing (the statistics expert or the scheme manager); the imports to who reads the results:
// the one in force (the latest), each file with its size and its link, and every earlier import.

export default function AnalysisImportPanel({ schemeId, lang, imports, canImport, answer }: {
  schemeId: string; lang: "bg" | "en"; imports: readonly AnalysisImport[]; canImport: boolean; answer?: string;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const now = importInForce(imports);
  const kb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
  const said = answer && answer !== "ok" ? (IMPORT_PROBLEM_TEXT as Record<string, { bg: string; en: string }>)[answer] : null;
  const input = { border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 13 } as const;
  // every import's files reachable — an addition never hides the earlier ones (review)
  const fileItem = (x: AnalysisImport, f: ImportedFile, i: number) => (
    <li key={i} data-import-file={f.kind}>{IMPORT_LABEL[f.kind][lang]} — <a href={`/schemes/${schemeId}/analysis-import/${x.id}/${i + 1}`} target="_blank" rel="noreferrer" aria-label={`${L("Отвори", "Open")}: ${IMPORT_LABEL[f.kind][lang]} (PTS_Analysis ${x.version}, ${i + 1})`}>{L("отвори", "open")}</a> · {kb(f.size)} · <span style={{ fontFamily: "monospace", fontSize: 11 }} title="SHA-256">{f.sha256.slice(0, 12)}…</span></li>
  );
  return (
    <section id="analysis-import" className="card p-4 mt-4" data-analysis-import={imports.length}>
      <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15, margin: 0 }}>{L("Внесено от PTS_Analysis 2.0", "Imported from PTS_Analysis 2.0")}</h2>
      <p className="text-sm" style={{ color: "var(--muted)", margin: "2px 0 8px" }}>{L("Документите от 2.0 се пазят като файлове, с версията на модула (Реш. 68) — порталът не ги преизчислява и не ги променя. Докладът на български става файлът на окончателния доклад, който актът «Издай» издава.", "2.0's documents are kept as files, with the module's version (Реш. 68) — the portal neither recomputes nor changes them. The Bulgarian report becomes the final report's file, which the «Issue» act issues.")}</p>
      {now ? (
        <div className="text-sm" data-import-in-force={now.version}>
          <b>PTS_Analysis {now.version}</b> · {fmtMoment(now.at)} · {now.by}
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {now.files.map((f, i) => fileItem(now, f, i))}
          </ul>
        </div>
      ) : <p className="text-sm" style={{ color: "var(--muted)" }} data-import-none>{L("Още нищо не е внесено.", "Nothing imported yet.")}</p>}
      {imports.length > 1 && (
        <details className="text-sm mt-2" data-import-earlier={imports.length - 1}>
          <summary>{L(`По-ранни внасяния (${imports.length - 1}) — пазят се`, `Earlier imports (${imports.length - 1}) — kept`)}</summary>
          <ul style={{ paddingLeft: 18, margin: "4px 0" }}>{imports.slice(0, -1).reverse().map((x) => <li key={x.id} data-import-earlier-item={x.version}>PTS_Analysis {x.version} · {fmtMoment(x.at)} · {x.by}<ul style={{ paddingLeft: 18 }}>{x.files.map((f, i) => fileItem(x, f, i))}</ul></li>)}</ul>
        </details>
      )}
      {answer && <p role={answer === "ok" ? "status" : "alert"} className="text-sm mt-2" data-import-answer={answer} style={{ color: answer === "ok" ? "var(--green-dark)" : "#8f2f2f" }}>{answer === "ok" ? L("Внесено.", "Imported.") : said ? L(said.bg, said.en) : L("Не е внесено.", "Not imported.")}</p>}
      {canImport && (
        <AnalysisImportForm max={MAX_IMPORT_BYTES} tooBig={L(IMPORT_PROBLEM_TEXT.size.bg, IMPORT_PROBLEM_TEXT.size.en)}>
          <input type="hidden" name="schemeId" value={schemeId} />
          <label className="text-sm" style={{ display: "grid", gap: 3 }}>{L("Версия на PTS_Analysis (както я отпечатва)", "PTS_Analysis's version (as it prints it)")}<input name="version" required placeholder="2.0.3" maxLength={40} style={input} /></label>
          <label className="text-sm" style={{ display: "grid", gap: 3 }}>{IMPORT_LABEL["report-bg"][lang]}{now ? "" : " *"}<input type="file" name="report-bg" required={!now} accept="application/pdf" style={input} /></label>
          <label className="text-sm" style={{ display: "grid", gap: 3 }}>{IMPORT_LABEL["report-en"][lang]}<input type="file" name="report-en" accept="application/pdf" style={input} /></label>
          <label className="text-sm" style={{ display: "grid", gap: 3 }}>{L("Графики (може няколко)", "Charts (several allowed)")}<input type="file" name="chart" multiple accept="application/pdf,image/png,image/jpeg" style={input} /></label>
          <label className="text-sm" style={{ display: "grid", gap: 3 }}>{IMPORT_LABEL.validation[lang]}<input type="file" name="validation" accept="application/pdf" style={input} /></label>
          <label className="text-sm" style={{ display: "grid", gap: 3 }}>{IMPORT_LABEL.dossier[lang]}<input type="file" name="dossier" accept="application/pdf" style={input} /></label>
          <div><button type="submit" className="btn btn-sm btn-primary" data-import-submit>{L("Внеси", "Import")}</button> <span className="text-sm" style={{ color: "var(--muted)" }}>{now ? L("До 15 MB общо. Без доклада — допълва внасянето в сила (напр. още графики); докладът остава.", "Up to 15 MB in all. Without the report — adds to the import in force (more charts, say); the report stays.") : L("До 15 MB общо.", "Up to 15 MB in all.")}</span></div>
        </AnalysisImportForm>
      )}
    </section>
  );
}
