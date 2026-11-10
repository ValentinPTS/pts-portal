import { openReportByHandAction, issueReportCorrectionAction, recordUxptAction } from "@/lib/actions";
import { UXPT_ANSWER_TEXT, answersFor, type UxptCheck } from "@/lib/uxpt-model";
import { ISSUE_PROBLEM_TEXT, rLabel, type IssueProblem, type RecipientRow, type ReportIssue } from "@/lib/report-issue-model";
import { fmtMoment } from "@/lib/scheme-dates";
import { getDoc } from "@/lib/documents";

// «Издаване на доклада» (plan part 7.4; Реш. 68, 140; D7; ISO/IEC 17043 §7.4.3). On the scheme's
// page. In processing: what the act «Издай окончателния доклад» needs — the approval (16), 2.0's
// report in force, its transfer check «the same». Once issued: the R editions (R1 at the act, each
// correction with its reason and scope), the 2.0 version beside each, who received which, a hand
// opening (D7), a correction, and the scheme's software record (Zadanie §6).

export default function ReportIssueCard({ schemeId, lang, status, ready, issues, rows, canAct, correctable, answer, codesNotReached, showReasons, uxpt, certs, ilc }: {
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
  /** 7.6: the u(x_pt) ≤ 0.3·σ_pt confirmation for the report in force; whether it may be recorded now */
  uxpt: { reportSha: string | null; inForce: UxptCheck | null; canRecord: boolean; type: string; version: string; notes: Record<string, string> };
  /** 7.7: the certificates waiting for a person */
  certs?: { ready: number; unchecked: number; released: number } | null;
  /** 7.9: an ILC — its report is the comparison report; one uploaded by hand needs no check nor u(x_pt) */
  ilc?: { hand: boolean; afterApproval: boolean } | null;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const okAnswer = answer === "ok" || answer === "opened" || answer === "corrected" || answer === "uxpt";
  const said = answer && !okAnswer ? (ISSUE_PROBLEM_TEXT as Record<string, { bg: string; en: string }>)[answer] : null;
  const input = { border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 13 } as const;
  const mark = (ok: boolean) => <b style={{ color: ok ? "var(--green-dark)" : "#8f2f2f" }}>{ok ? "✓" : "✗"}</b>;
  const last = issues.at(-1);
  return (
    <section id="report-issue" className="card p-4 mt-4" data-report-issue={issues.length}>
      <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15, margin: 0 }}>{ilc ? L("Издаване на доклада от междулабораторното сравнение", "Issuing the ILC comparison report") : L("Издаване на доклада", "Issuing the report")}</h2>
      {status === "processing" && (
        <ul className="text-sm" data-issue-ready={ilc?.hand ? (ready.approved && !ilc.afterApproval ? "yes" : "no") : ready.approved && !ready.problem && uxpt.inForce ? "yes" : "no"} style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "grid", gap: 3 }}>
          <li data-ready-approved={ready.approved ? "1" : "0"}>{mark(ready.approved)} {L("Обработено, прегледано и одобрено (етапи 14–16, Реш. 140)", "Processed, reviewed and approved (stages 14–16, Реш. 140)")}</li>
          {ilc?.hand ? (<>
            <li data-ready-report="hand">{mark(!ilc.afterApproval)} {L("Докладът от междулабораторното сравнение — качен на ръка (ILC: не от 2.0 — без проверка на преноса и без u(x_pt), 7.9)", "The ILC comparison report — uploaded by hand (an ILC: not from 2.0 — no transfer check, no u(x_pt), 7.9)")}</li>
            {ilc.afterApproval && <li data-ready-check="after-approval">{mark(false)} {L(ISSUE_PROBLEM_TEXT["after-approval"].bg, ISSUE_PROBLEM_TEXT["after-approval"].en)}</li>}
          </>) : (<>
          <li data-ready-report={ready.report ? "1" : "0"}>{mark(!!ready.report)} {ready.report ? L(`Докладът в сила е от PTS_Analysis ${ready.report.version}`, `The report in force is from PTS_Analysis ${ready.report.version}`) : L("Докладът в сила не е от PTS_Analysis 2.0", "The report in force is not from PTS_Analysis 2.0")}</li>
          <li data-ready-check={ready.problem ? ready.problem : "same"}>{mark(!ready.problem)} {ready.problem ? L(ISSUE_PROBLEM_TEXT[ready.problem].bg, ISSUE_PROBLEM_TEXT[ready.problem].en) : L("Проверката на преноса в сила: «същите кодове и характеристики»", "The transfer check in force: «the same codes and characteristics»")}</li>
          <li data-ready-uxpt={uxpt.inForce ? uxpt.inForce.answer : "none"}>{mark(!!uxpt.inForce)} {uxpt.inForce ? `${L(UXPT_ANSWER_TEXT[uxpt.inForce.answer].bg, UXPT_ANSWER_TEXT[uxpt.inForce.answer].en)}${uxpt.inForce.note ? ` — ${uxpt.inForce.note}` : ""}` : L(ISSUE_PROBLEM_TEXT["no-uxpt"].bg, ISSUE_PROBLEM_TEXT["no-uxpt"].en)}</li>
          </>)}
          <li style={{ color: "var(--muted)" }}>{L("Актът «Издай окончателния доклад» е в «Етапи» по-горе. Докладът достига участията, отбелязани като платени (D7); останалите — когато плащането се отбележи, или когато PTS го отвори с основание.", "The act «Issue the final report» is under «Stages» above. The report reaches the participations marked paid (D7); the others when the payment is marked, or when PTS opens it with a reason.")}</li>
        </ul>
      )}
      {issues.length > 0 && (
        <ol className="text-sm" style={{ margin: "6px 0 0", paddingLeft: 18 }} data-issue-list>
          {issues.map((i) => (
            <li key={i.id} data-issue={rLabel(i.r)}>
              <b>{rLabel(i.r)}</b> · {L("ред.", "ed.")} № {i.editionNo} · {fmtMoment(i.at)} · {i.by} · <span data-issue-version>{i.source === "uploaded" ? L("качен на ръка — без версия на модул (ILC)", "uploaded by hand — no module version (ILC)") : `PTS_Analysis ${i.analysisVersion}`}</span>
              {i.uxpt && <div data-issue-uxpt={i.uxpt.answer} style={{ color: "var(--muted)" }}>{L(UXPT_ANSWER_TEXT[i.uxpt.answer].bg, UXPT_ANSWER_TEXT[i.uxpt.answer].en)}{uxpt.notes[i.uxpt.id] ? ` — ${uxpt.notes[i.uxpt.id]}` : ""}</div>}
              {i.kind === "correction" && <div style={{ color: "#7a5416" }}>{L("Поправка", "Correction")} — {i.reason}. {L("Поправено", "Corrected")}: {i.scope}{i.codes.length ? ` · ${L("засяга", "concerns")} ${i.codes.join(", ")}` : ` · ${L("засяга всички", "concerns all")}`}</div>}
              <details style={{ marginTop: 2 }} data-software-record>
                <summary>{L("Софтуерен запис на схемата", "The scheme's software record")}</summary>
                <ul style={{ paddingLeft: 18, margin: "2px 0" }}>
                  <li>{L("Издания на портала в сила през кръга", "Portal releases in force during the round")}: {i.software.releases.length ? i.software.releases.map((r) => `${r.title}${r.ref ? ` (${r.ref.slice(0, 7)})` : ""} — ${fmtMoment(r.deployedAt)}`).join("; ") : L("няма записани в регистъра на промените", "none recorded in the change register")}</li>
                  <li>{L("Версия на конфигурацията (характеристиките)", "Configuration version (the characteristics)")}: {i.software.configVersion ?? "—"}</li>
                  <li>{L("Редакции на шаблоните", "Template editions")}: {i.software.templates.length ? i.software.templates.map((x) => `${(lang === "bg" ? getDoc(x.docKey)?.nameBg : getDoc(x.docKey)?.nameEn) ?? x.docKey} № ${x.no} (${x.issuedOn})`).join("; ") : "—"} · {L("текстове за Gate B", "Gate B texts")} {i.software.gateTexts}</li>
                  {i.software.reportSource === "uploaded"
                    ? <li data-software-report="uploaded">{L("Докладът: качен на ръка — без версия на модул (ILC)", "The report: uploaded by hand — no module version (ILC)")}{i.software.analysisVersions.length ? ` · ${L("други внасяния от PTS_Analysis", "other PTS_Analysis imports")}: ${i.software.analysisVersions.join(", ")}` : ""}</li>
                    : <li>PTS_Analysis: {i.software.analysisVersions.join(", ")}</li>}
                </ul>
              </details>
            </li>
          ))}
        </ol>
      )}
      {certs && (certs.ready > 0 || certs.unchecked > 0 || certs.released > 0) && (
        <p className="text-sm" data-certs-waiting={certs.ready} style={{ margin: "8px 0 0" }}>{L("Сертификати", "Certificates")}: <b>{L(`${certs.ready} готови за издаване`, `${certs.ready} ready to release`)}</b>, {L(`${certs.unchecked} чакат проверка`, `${certs.unchecked} await a check`)}, {L(`${certs.released} издадени`, `${certs.released} released`)} — <a href={`/schemes/${schemeId}/doc/certificate#certificate-steps`}>{L("към сертификатите", "to the certificates")}</a></p>
      )}
      {answer && <p role={okAnswer ? "status" : "alert"} className="text-sm mt-2" data-issue-answer={answer} style={{ color: okAnswer ? "var(--green-dark)" : "#8f2f2f" }}>{answer === "uxpt" ? L("Потвърждението за u(x_pt) е записано.", "The u(x_pt) confirmation is recorded.") : answer === "opened" ? L("Докладът е отворен за участието — уведомено е.", "The report is opened for the participation — it is told.") : answer === "corrected" ? L("Поправката е издадена — засегнатите участия са уведомени.", "The correction is issued — the participations concerned are told.") : said ? L(said.bg, said.en) : L("Не е записано.", "Not recorded.")}</p>}
      {status === "report" && uxpt.canRecord && uxpt.reportSha && (
        <p className="text-sm" data-uxpt-corrected style={{ margin: "10px 0 0" }}>{L(`Поправеният доклад в сила — PTS_Analysis ${uxpt.version}: `, `The corrected report in force — PTS_Analysis ${uxpt.version}: `)}{uxpt.inForce ? `${L(UXPT_ANSWER_TEXT[uxpt.inForce.answer].bg, UXPT_ANSWER_TEXT[uxpt.inForce.answer].en)}${uxpt.inForce.note ? ` — ${uxpt.inForce.note}` : ""}` : L("няма потвърждение за u(x_pt) още.", "no u(x_pt) confirmation yet.")}</p>
      )}
      {canAct && uxpt.canRecord && uxpt.reportSha && (
        <form action={recordUxptAction} className="mt-3" data-uxpt-form style={{ display: "grid", gap: 6, maxWidth: 640 }}>
          <input type="hidden" name="schemeId" value={schemeId} />
          <input type="hidden" name="reportSha" value={uxpt.reportSha} />
          <b className="text-sm">{L(`u(x_pt) ≤ 0,3·σ_pt — какво показва докладът на 2.0 в сила (PTS_Analysis ${uxpt.version}; К16)`, `u(x_pt) ≤ 0.3·σ_pt — what 2.0's report in force shows (PTS_Analysis ${uxpt.version}; К16)`)}</b>
          {answersFor(uxpt.type).map((a) => <label key={a} className="text-sm" style={{ display: "flex", gap: 6 }}><input type="radio" name="answer" value={a} required />{L(UXPT_ANSWER_TEXT[a].bg, UXPT_ANSWER_TEXT[a].en)}</label>)}
          <input name="note" maxLength={1000} placeholder={uxpt.type === "C" ? L("Защо не се прилага (задължително)", "Why it is not applicable (required)") : L("За кои характеристики не е изпълнено (задължително при «не за всички»)", "Which characteristics it is not met for (required for «not for all»)")} aria-label={L("Бележка", "Note")} style={input} />
          <div><button type="submit" className="btn btn-sm" data-uxpt-submit>{L("Запиши потвърждението", "Record the confirmation")}</button> <span className="text-sm" style={{ color: "var(--muted)" }}>{L("Порталът не сравнява числа — 2.0 връща само документи (D3).", "The portal compares no numbers — 2.0 returns documents only (D3).")}</span></div>
        </form>
      )}
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
            <b className="text-sm">{correctable.version ? L(`Издай поправка ${rLabel(last.r + 1)} — докладът в сила от PTS_Analysis ${correctable.version}`, `Issue correction ${rLabel(last.r + 1)} — the report in force from PTS_Analysis ${correctable.version}`) : L(`Издай поправка ${rLabel(last.r + 1)} — докладът в сила, качен на ръка (ILC)`, `Issue correction ${rLabel(last.r + 1)} — the report in force, uploaded by hand (ILC)`)}</b>
            <input name="reason" required maxLength={1000} placeholder={L("Причина за поправката", "The reason for the correction")} aria-label={L("Причина", "Reason")} style={input} />
            <input name="scope" required maxLength={1000} placeholder={L("Какво е поправено", "What is corrected")} aria-label={L("Какво е поправено", "What is corrected")} style={input} />
            <input name="codes" maxLength={4000} placeholder={L("Засегнати кодове (празно — всички)", "Codes concerned (empty — all)")} aria-label={L("Засегнати кодове", "Codes concerned")} style={input} />
            <div><button type="submit" className="btn btn-sm" data-correction-submit>{L("Издай поправката", "Issue the correction")}</button></div>
          </form>
        ) : <p className="text-sm" style={{ color: "var(--muted)", margin: "8px 0 0" }} data-correction-waiting={correctable?.problem ?? "none"}>{correctable?.problem && correctable.problem !== "same-file" && correctable.problem !== "not-issued" ? `${L("Поправка (R2…): ", "A correction (R2…): ")}${L(ISSUE_PROBLEM_TEXT[correctable.problem].bg, ISSUE_PROBLEM_TEXT[correctable.problem].en)}` : ilc ? L("Поправка (R2…): качете поправения доклад — от 2.0 (с проверка на преноса) или на ръка — тогава формата е тук.", "A correction (R2…): upload the corrected report — from 2.0 (with its transfer check) or by hand — the form is here then.") : L("Поправка (R2…): внесете поправения доклад от 2.0 и проверете преноса — тогава формата е тук.", "A correction (R2…): import the corrected report from 2.0 and check the transfer — the form is here then.")}</p>
      )}
    </section>
  );
}
