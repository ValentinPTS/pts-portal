import { openReportByHandAction, issueReportCorrectionAction } from "@/lib/actions";
import { ISSUE_PROBLEM_TEXT, rLabel, type IssueProblem, type RecipientRow, type ReportIssue } from "@/lib/report-issue-model";
import { fmtMoment } from "@/lib/scheme-dates";
import { getDoc } from "@/lib/documents";

// «Издаване на доклада» (plan part 7.4; Реш. 68, 140; D7; ISO/IEC 17043 §7.4.3). On the scheme's
// page. In processing: what the act «Издай окончателния доклад» needs — the approval (16), 2.0's
// report in force, its transfer check «the same». Once issued: the R editions (R1 at the act, each
// correction with its reason and scope), the 2.0 version beside each, who received which, a hand
// opening (D7), a correction, and the scheme's software record (Zadanie §6).

export default function ReportIssueCard({ schemeId, lang, status, ready, issues, rows, canAct, correctable, answer, codesNotReached, showReasons }: {
  schemeId: string; lang: "bg" | "en"; status: string;
  /** before the act: the three conditions, each true or the reason it is not */
  ready: { approved: boolean; report: { version: string } | null; problem: IssueProblem | null };
  issues: readonly ReportIssue[];
  rows: readonly RecipientRow[] | null;
  canAct: boolean;
  /** a correction can be issued now: the report in force is another 2.0 file, its check «the same» */
  correctable: { version: string; problem: IssueProblem | null } | null;
  answer?: string;
  codesNotReached: readonly string[];
  /** a hand opening's reason may name the institution — shown only to who may see names (review) */
  showReasons: boolean;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const said = answer && answer !== "ok" && answer !== "opened" && answer !== "corrected" ? (ISSUE_PROBLEM_TEXT as Record<string, { bg: string; en: string }>)[answer] : null;
  const input = { border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 13 } as const;
  const mark = (ok: boolean) => <b style={{ color: ok ? "var(--green-dark)" : "#8f2f2f" }}>{ok ? "✓" : "✗"}</b>;
  const last = issues.at(-1);
  return (
    <section id="report-issue" className="card p-4 mt-4" data-report-issue={issues.length}>
      <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15, margin: 0 }}>{L("Издаване на доклада", "Issuing the report")}</h2>
      {status === "processing" && (
        <ul className="text-sm" data-issue-ready={ready.approved && !ready.problem ? "yes" : "no"} style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "grid", gap: 3 }}>
          <li data-ready-approved={ready.approved ? "1" : "0"}>{mark(ready.approved)} {L("Обработено, прегледано и одобрено (етапи 14–16, Реш. 140)", "Processed, reviewed and approved (stages 14–16, Реш. 140)")}</li>
          <li data-ready-report={ready.report ? "1" : "0"}>{mark(!!ready.report)} {ready.report ? L(`Докладът в сила е от PTS_Analysis ${ready.report.version}`, `The report in force is from PTS_Analysis ${ready.report.version}`) : L("Докладът в сила не е от PTS_Analysis 2.0", "The report in force is not from PTS_Analysis 2.0")}</li>
          <li data-ready-check={ready.problem ? ready.problem : "same"}>{mark(!ready.problem)} {ready.problem ? L(ISSUE_PROBLEM_TEXT[ready.problem].bg, ISSUE_PROBLEM_TEXT[ready.problem].en) : L("Проверката на преноса в сила: «същите кодове и характеристики»", "The transfer check in force: «the same codes and characteristics»")}</li>
          <li style={{ color: "var(--muted)" }}>{L("Актът «Издай окончателния доклад» е в «Етапи» по-горе. Докладът достига участията, отбелязани като платени (D7); останалите — когато плащането се отбележи, или когато PTS го отвори с основание.", "The act «Issue the final report» is under «Stages» above. The report reaches the participations marked paid (D7); the others when the payment is marked, or when PTS opens it with a reason.")}</li>
        </ul>
      )}
      {issues.length > 0 && (
        <ol className="text-sm" style={{ margin: "6px 0 0", paddingLeft: 18 }} data-issue-list>
          {issues.map((i) => (
            <li key={i.id} data-issue={rLabel(i.r)}>
              <b>{rLabel(i.r)}</b> · {L("ред.", "ed.")} № {i.editionNo} · {fmtMoment(i.at)} · {i.by} · <span data-issue-version>PTS_Analysis {i.analysisVersion}</span>
              {i.kind === "correction" && <div style={{ color: "#7a5416" }}>{L("Поправка", "Correction")} — {i.reason}. {L("Поправено", "Corrected")}: {i.scope}{i.codes.length ? ` · ${L("засяга", "concerns")} ${i.codes.join(", ")}` : ` · ${L("засяга всички", "concerns all")}`}</div>}
              <details style={{ marginTop: 2 }} data-software-record>
                <summary>{L("Софтуерен запис на схемата", "The scheme's software record")}</summary>
                <ul style={{ paddingLeft: 18, margin: "2px 0" }}>
                  <li>{L("Издания на портала в сила през кръга", "Portal releases in force during the round")}: {i.software.releases.length ? i.software.releases.map((r) => `${r.title}${r.ref ? ` (${r.ref.slice(0, 7)})` : ""} — ${fmtMoment(r.deployedAt)}`).join("; ") : L("няма записани в регистъра на промените", "none recorded in the change register")}</li>
                  <li>{L("Версия на конфигурацията (характеристиките)", "Configuration version (the characteristics)")}: {i.software.configVersion ?? "—"}</li>
                  <li>{L("Редакции на шаблоните", "Template editions")}: {i.software.templates.length ? i.software.templates.map((x) => `${(lang === "bg" ? getDoc(x.docKey)?.nameBg : getDoc(x.docKey)?.nameEn) ?? x.docKey} № ${x.no} (${x.issuedOn})`).join("; ") : "—"} · {L("текстове за Gate B", "Gate B texts")} {i.software.gateTexts}</li>
                  <li>PTS_Analysis: {i.software.analysisVersions.join(", ")}</li>
                </ul>
              </details>
            </li>
          ))}
        </ol>
      )}
      {answer && <p role={answer === "ok" || answer === "opened" || answer === "corrected" ? "status" : "alert"} className="text-sm mt-2" data-issue-answer={answer} style={{ color: answer === "ok" || answer === "opened" || answer === "corrected" ? "var(--green-dark)" : "#8f2f2f" }}>{answer === "opened" ? L("Докладът е отворен за участието — уведомено е.", "The report is opened for the participation — it is told.") : answer === "corrected" ? L("Поправката е издадена — засегнатите участия са уведомени.", "The correction is issued — the participations concerned are told.") : said ? L(said.bg, said.en) : L("Не е записано.", "Not recorded.")}</p>}
      {issues.length > 0 && rows && (
        <div className="mt-2" style={{ overflowX: "auto" }}>
          <h3 className="font-bold" style={{ fontSize: 14, margin: "8px 0 4px" }}>{L("Кой коя редакция получи", "Who received which edition")}</h3>
          <table className="text-sm" data-recipients style={{ borderCollapse: "collapse", minWidth: 480 }}>
            <thead><tr><th style={{ textAlign: "left", padding: "2px 8px" }}>{L("Код", "Code")}</th><th style={{ textAlign: "left", padding: "2px 8px" }}>{L("Достъп", "Access")}</th><th style={{ textAlign: "left", padding: "2px 8px" }}>{L("Получени R", "R received")}</th><th style={{ textAlign: "left", padding: "2px 8px" }}>{L("Уведомено", "Told")}</th><th style={{ textAlign: "left", padding: "2px 8px" }}>{L("Отворено", "Opened")}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} data-recipient={r.code} data-recipient-access={r.access?.via ?? "none"}>
                  <td style={{ padding: "2px 8px", fontFamily: "monospace" }}>{r.code}</td>
                  <td style={{ padding: "2px 8px" }}>{!r.access ? <span style={{ color: "#7a5416" }}>{L("чака плащане", "awaits payment")}</span> : r.access.via === "paid" ? L(`платено — ${fmtMoment(r.access.at)}`, `paid — ${fmtMoment(r.access.at)}`) : <span>{L(`отворен от PTS — ${fmtMoment(r.access.at)}`, `opened by PTS — ${fmtMoment(r.access.at)}`)}{showReasons && r.access.reason ? ` · ${r.access.reason}` : L(" · основанието е в записа", " · the reason is on record")}</span>}</td>
                  <td style={{ padding: "2px 8px" }} data-recipient-received={r.received.map((x) => rLabel(x.r)).join(",")}>{r.received.map((x) => `${rLabel(x.r)} ${fmtMoment(x.at)}`).join("; ") || "—"}</td>
                  <td style={{ padding: "2px 8px" }} data-recipient-told={r.told.map((x) => rLabel(x.r)).join(",")}>{r.told.map((x) => `${rLabel(x.r)} ${fmtMoment(x.at)}`).join("; ") || <span style={{ color: "var(--muted)" }}>{r.access ? L("— (няма на кого)", "— (nobody to tell)") : "—"}</span>}</td>
                  <td style={{ padding: "2px 8px" }} data-recipient-opened={r.opened.map((x) => rLabel(x.r)).join(",")}>{r.opened.map((x) => `${rLabel(x.r)} ${fmtMoment(x.at)}`).join("; ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {issues.length > 0 && !rows && <p className="text-sm" role="alert" data-recipients-unread style={{ color: "#8f2f2f" }}>{L("Кой какво получи не можа да се прочете — опитайте пак.", "Who received what could not be read — try again.")}</p>}
      {canAct && issues.length > 0 && (status === "report" || status === "closed") && codesNotReached.length > 0 && (
        <form action={openReportByHandAction} className="mt-2" data-hand-open style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "end" }}>
          <input type="hidden" name="schemeId" value={schemeId} />
          <label className="text-sm" style={{ display: "grid", gap: 3 }}>{L("Отвори доклада за", "Open the report for")}<select name="code" required style={input}>{codesNotReached.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          <label className="text-sm" style={{ display: "grid", gap: 3, flex: "1 1 260px" }}>{L("Основание (напр. държавна институция)", "Reason (e.g. a state institution)")}<input name="reason" required maxLength={1000} style={input} /></label>
          <button type="submit" className="btn btn-sm" data-hand-open-submit>{L("Отвори", "Open")}</button>
        </form>
      )}
      {canAct && last && status === "report" && (
        correctable && !correctable.problem ? (
          <form action={issueReportCorrectionAction} className="mt-3" data-correction-form style={{ display: "grid", gap: 6, maxWidth: 640 }}>
            <input type="hidden" name="schemeId" value={schemeId} />
            <b className="text-sm">{L(`Издай поправка ${rLabel(last.r + 1)} — докладът в сила от PTS_Analysis ${correctable.version}`, `Issue correction ${rLabel(last.r + 1)} — the report in force from PTS_Analysis ${correctable.version}`)}</b>
            <input name="reason" required maxLength={1000} placeholder={L("Причина за поправката", "The reason for the correction")} aria-label={L("Причина", "Reason")} style={input} />
            <input name="scope" required maxLength={1000} placeholder={L("Какво е поправено", "What is corrected")} aria-label={L("Какво е поправено", "What is corrected")} style={input} />
            <input name="codes" maxLength={4000} placeholder={L("Засегнати кодове (празно — всички)", "Codes concerned (empty — all)")} aria-label={L("Засегнати кодове", "Codes concerned")} style={input} />
            <div><button type="submit" className="btn btn-sm" data-correction-submit>{L("Издай поправката", "Issue the correction")}</button></div>
          </form>
        ) : <p className="text-sm" style={{ color: "var(--muted)", margin: "8px 0 0" }} data-correction-waiting={correctable?.problem ?? "none"}>{L("Поправка (R2…): внесете поправения доклад от 2.0 и проверете преноса — тогава формата е тук.", "A correction (R2…): import the corrected report from 2.0 and check the transfer — the form is here then.")}</p>
      )}
    </section>
  );
}
