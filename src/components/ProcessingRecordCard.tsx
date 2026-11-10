import { recordTransferCheckAction } from "@/lib/actions";
import { CHECK_PROBLEM_TEXT, type RecordEvent, type transferState } from "@/lib/transfer-check-model";
import { IMPORT_LABEL, type AnalysisImport } from "@/lib/analysis-import-model";
import { fmtMoment } from "@/lib/scheme-dates";

// «Запис на обработката» and «Проверка на преноса» (plan part 7.3; Manual 7.5.2; D3; 2.5). On the
// scheme's page: every designation, the ticks of stages 14–16 and their withdrawals, what was sent to
// 2.0 and what came back; the transfer check — what the last final export sent beside the report in
// force (the imported file the issue act issues), and the person's answer: 2.0's report lists the
// same codes and characteristics, or not and what differs.

export default function ProcessingRecordCard({ schemeId, lang, record, ticksFromJournal, transfer, imports, canCheck, answer }: {
  schemeId: string; lang: "bg" | "en";
  record: readonly RecordEvent[];
  /** false — the journal could not give the ticks' history; the current ticks are shown */
  ticksFromJournal: boolean;
  /** null — the corrections could not be read: nothing is said in force */
  transfer: ReturnType<typeof transferState> | null;
  imports: readonly AnalysisImport[];
  canCheck: boolean; answer?: string;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const said = answer && answer !== "ok" ? (CHECK_PROBLEM_TEXT as Record<string, { bg: string; en: string }>)[answer] : null;
  const ex = transfer?.export;
  const im = transfer?.importId ? imports.find((x) => x.id === transfer.importId) : undefined;
  const inForce = transfer?.check ?? null;
  const why = transfer && (transfer.state === "preliminary" || transfer.state === "relocked" || transfer.state === "corrected" || transfer.state === "no-report") ? CHECK_PROBLEM_TEXT[transfer.state] : null;
  const mono = { fontFamily: "monospace" } as const;
  return (
    <section id="processing-record" className="card p-4 mt-4" data-processing-record={record.length}>
      <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15, margin: 0 }}>{L("Запис на обработката", "The processing record")}</h2>
      {record.length === 0 ? <p className="text-sm" style={{ color: "var(--muted)" }}>{L("Още няма записи.", "Nothing recorded yet.")}</p> : (
        <ol className="text-sm" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {record.map((e, i) => <li key={i} data-record-event={e.kind}>{fmtMoment(e.at)} — {e.text[lang]}{e.by ? <span style={{ color: "var(--muted)" }}> ({e.by})</span> : null}</li>)}
        </ol>
      )}
      {!ticksFromJournal && <p className="text-sm" data-record-ticks-current style={{ color: "#7a5416", margin: "4px 0 0" }}>{L("Историята на отметките не можа да се прочете от дневника — показани са отметките в сила.", "The ticks' history could not be read from the journal — the ticks in force are shown.")}</p>}

      <h3 className="font-bold" style={{ fontSize: 14, margin: "12px 0 4px" }}>{L("Проверка на преноса", "Transfer check")}</h3>
      {!transfer ? <p className="text-sm" role="alert" data-transfer-unread style={{ color: "#8f2f2f" }}>{L("Корекциите не можаха да се прочетат — не може да се каже дали проверката е в сила.", "The corrections could not be read — whether a check is in force cannot be said.")}</p>
        : !ex ? <p className="text-sm" style={{ color: "var(--muted)" }} data-transfer-waiting>{L("Чака изнасяне към 2.0 (след заключването) и внасяне на доклада му.", "Waits for an export to 2.0 (after the lock) and an import of its report.")}</p> : (
        <div className="text-sm" data-transfer-state={transfer.state} data-transfer-check={inForce ? (inForce.same ? "same" : "differs") : "none"}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            <div data-transfer-sent>
              <b>{L("Изпратено", "Sent")}</b> — {fmtMoment(ex.at)}{ex.preliminary ? L(" (предварително)", " (preliminary)") : ""} <span style={{ ...mono, fontSize: 11, color: "var(--muted)" }} title="SHA-256">{ex.sha256.slice(0, 12)}…</span>
              <div>{L("Кодове", "Codes")} ({ex.codes.length}): <span style={mono}>{ex.codes.join(", ")}</span></div>
              <div>{L("Характеристики / точки", "Characteristics / points")} ({ex.characteristics.length}): <span style={mono}>{ex.characteristics.join(", ")}</span></div>
              {!!ex.nrOnly?.length && <div data-transfer-nr-only>{L("Само N/R", "N/R only")} ({ex.nrOnly.length}): <span style={mono}>{ex.nrOnly.join(", ")}</span></div>}
              {!!ex.outside?.length && <div data-transfer-outside style={{ color: "#7a5416" }}>{L("Извън формата — резултатите им не са във файла, въвеждат се на ръка", "Outside the form — their results are not in the file, typed in by hand")} ({ex.outside.length}): <span style={mono}>{ex.outside.join(", ")}</span></div>}
            </div>
            <div data-transfer-received>
              {im ? (<>
                <b>{L("Докладът в сила — от", "The report in force — from")} PTS_Analysis {im.version}</b> — {fmtMoment(im.at)} <span style={{ ...mono, fontSize: 11, color: "var(--muted)" }} title="SHA-256">{transfer.reportSha?.slice(0, 12)}…</span>
                <ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>{im.files.map((f, i) => (f.kind === "report-bg" || f.kind === "report-en") ? <li key={i}><a href={`/schemes/${schemeId}/analysis-import/${im.id}/${i + 1}`} target="_blank" rel="noreferrer">{IMPORT_LABEL[f.kind][lang]}</a></li> : null)}</ul>
              </>) : <span style={{ color: "var(--muted)" }}>{L("Няма доклад от 2.0 в сила.", "No report from 2.0 in force.")}</span>}
            </div>
          </div>
          {why && <p data-transfer-why style={{ margin: "6px 0 0", color: "#7a5416" }}>{L(why.bg, why.en)}</p>}
          {inForce
            ? <p style={{ margin: "6px 0 0", color: inForce.same ? "var(--green-dark)" : "#8f2f2f" }}><b>{inForce.same ? L("Проверено: 2.0 изброява същите кодове и характеристики.", "Checked: 2.0 lists the same codes and characteristics.") : L(`Проверено: НЕ са същите — ${inForce.note}`, `Checked: NOT the same — ${inForce.note}`)}</b> <span style={{ color: "var(--muted)" }}>({inForce.by}, {fmtMoment(inForce.at)})</span></p>
            : !why && <p style={{ margin: "6px 0 0", color: "#7a5416" }}>{L("Не е проверено за това изнасяне и този доклад. Издаването на доклада (7.4) ще изисква «същите».", "Not checked for this export and this report. Issuing the report (7.4) will require «the same».")}</p>}
          {answer && <p role={answer === "ok" ? "status" : "alert"} data-transfer-answer={answer} style={{ margin: "4px 0 0", color: answer === "ok" ? "var(--green-dark)" : "#8f2f2f" }}>{answer === "ok" ? L("Записано.", "Recorded.") : said ? L(said.bg, said.en) : L("Не е записано.", "Not recorded.")}</p>}
          {canCheck && (transfer.state === "none" || transfer.state === "ok") && im && (
            <form action={recordTransferCheckAction} className="mt-2" data-transfer-form style={{ display: "grid", gap: 6, maxWidth: 640 }}>
              <input type="hidden" name="schemeId" value={schemeId} />
              <input type="hidden" name="exportId" value={ex.id} />
              <input type="hidden" name="importId" value={im.id} />
              <input type="hidden" name="reportSha" value={transfer.reportSha ?? ""} />
              <label style={{ display: "flex", gap: 6 }}><input type="radio" name="same" value="yes" required />{L(`Докладът на 2.0 изброява същите ${ex.codes.length} кода и ${ex.characteristics.length} характеристики/точки`, `2.0's report lists the same ${ex.codes.length} codes and ${ex.characteristics.length} characteristics/points`)}</label>
              <label style={{ display: "flex", gap: 6 }}><input type="radio" name="same" value="no" />{L("Не са същите", "They are not the same")}</label>
              <input name="note" maxLength={1000} placeholder={L("Какво се различава (задължително при «не»)", "What differs (required for «no»)")} aria-label={L("Какво се различава", "What differs")} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px" }} />
              <div><button type="submit" className="btn btn-sm" data-transfer-submit>{L("Запиши проверката", "Record the check")}</button></div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
