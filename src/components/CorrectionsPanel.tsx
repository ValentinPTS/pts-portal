import { recordCorrectionAction } from "@/lib/actions";
import { randomUUID } from "node:crypto";
import { correctableFields, activeCorrections, kNotTwo, kOff, targetOf, FIELD_LABEL, CORRECTION_PROBLEM_TEXT, type ResultCorrection } from "@/lib/corrections-model";
import { fmtMoment } from "@/lib/scheme-dates";

// «Подадено и използвано» (plan part 6.5; D3; К22) — PTS's side, on the participant's page, under
// the latest submitted version: each field with a reported value — the reported one, the used one
// if a correction is in force (with its reason, who, when), else «= подаденото». The coding expert
// records a used value or withdraws one; the portal computes nothing. k ≠ 2 is flagged until the
// used U (at k = 2) is recorded — information, never a block.

export default function CorrectionsPanel({ schemeId, code, lang, version, data, corrections, labelOf, canEnter, open, answer, unread }: {
  schemeId: string; code: string; lang: "bg" | "en";
  /** the latest submitted version — the one used */
  version: number; data: unknown;
  /** every correction of this participation (all versions) */
  corrections: readonly ResultCorrection[];
  labelOf: (key: string) => string;
  canEnter: boolean;
  /** the scheme still with PTS (running, processing) — not once the report is out */
  open: boolean;
  answer?: string;
  unread?: boolean;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  if (unread) return <p role="alert" id="corrections" data-corrections-unread className="text-sm mt-3" style={{ color: "#8f2f2f" }}>{L("Корекциите не можаха да се прочетат — не е ясно кои стойности се използват. Презаредете страницата.", "The corrections could not be read — it is not known which values are used. Reload the page.")}</p>;
  const fields = correctableFields(data);
  const active = activeCorrections(corrections, version);
  const flags = kNotTwo(data, corrections, version);
  const mine = corrections.filter((c) => c.version === version);
  const earlier = corrections.filter((c) => c.version !== version);
  const kOf = new Map(fields.filter((f) => f.k).map((f) => [f.key, f.k!] as const));
  const fieldName = (f: string, key?: string) => FIELD_LABEL(f, f === "U" && key ? kOf.get(key) : undefined)[lang];
  const said = answer ? (answer === "ok" ? null : (CORRECTION_PROBLEM_TEXT as Record<string, { bg: string; en: string }>)[answer]) : null;
  return (
    <div id="corrections" className="mt-3" data-corrections={active.size} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <h3 className="font-bold" style={{ fontSize: 14, margin: 0 }}>{L(`Подадено и използвано — версия ${version}`, `Submitted and used — version ${version}`)}</h3>
      <p className="text-sm" style={{ color: "var(--muted)", margin: "2px 0 6px" }}>{L("Подадената версия не се променя. Използваната стойност се въвежда от експерта по събиране и кодиране, с основание — порталът не изчислява нищо (К22). Лабораторията вижда и двете, с основанието.", "The submitted version is never changed. The used value is typed by the coding expert, with a reason — the portal computes nothing (К22). The laboratory sees both, with the reason.")}</p>
      {flags.length > 0 && (
        <ul className="text-sm" data-k-flags={flags.length} style={{ color: "#7a5416", margin: "0 0 6px", paddingLeft: 18 }}>
          {flags.map((f) => <li key={f.key} data-k-flag={f.key}>{labelOf(f.key)}: {L(`k = ${f.k} по доклада — U при k = 2 за използване не е записана (D3)`, `k = ${f.k} as reported — the used U at k = 2 is not recorded (D3)`)}</li>)}
        </ul>
      )}
      {fields.length === 0 ? <p className="text-sm" style={{ color: "var(--muted)" }}>{L("Няма подадени стойности за коригиране (всичко е N/R или N/A).", "No submitted values to correct (all N/R or N/A).")}</p> : (
        <div style={{ overflowX: "auto" }}>
          <table className="text-sm" data-corrections-table style={{ borderCollapse: "collapse", minWidth: 560, fontVariantNumeric: "tabular-nums" }}>
            <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}>
              <th style={{ padding: "3px 8px 3px 0" }}>{L("Характеристика / точка", "Characteristic / point")}</th>
              <th style={{ padding: "3px 8px" }}>{L("Поле", "Field")}</th>
              <th style={{ padding: "3px 8px" }}>{L("Подадено", "Submitted")}</th>
              <th style={{ padding: "3px 8px" }}>{L("Използвано", "Used")}</th>
              <th style={{ padding: "3px 8px" }}>{L("Основание", "Reason")}</th>
            </tr></thead>
            <tbody>
              {fields.map((f) => {
                const c = active.get(targetOf(f.key, f.field));
                return (
                  <tr key={targetOf(f.key, f.field)} data-correction-row={targetOf(f.key, f.field)} data-used={c?.used ?? ""} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: "3px 8px 3px 0" }}>{labelOf(f.key)}</td>
                    <td style={{ padding: "3px 8px" }}>{fieldName(f.field, f.key)}</td>
                    <td style={{ padding: "3px 8px" }}>{f.reported}</td>
                    <td style={{ padding: "3px 8px" }}>{c ? <b>{c.used}</b> : kOff(f) ? <span data-used-missing style={{ color: "#7a5416" }}>{L("не е записана — U при k = 2", "not recorded — U at k = 2")}</span> : <span style={{ color: "var(--muted)" }}>{L("= подаденото", "= submitted")}</span>}</td>
                    <td style={{ padding: "3px 8px" }}>{c ? <>{c.reason} <span style={{ color: "var(--muted)" }}>({c.by}, {fmtMoment(c.at)})</span></> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {mine.length > 0 && (
        <details className="text-sm mt-2" data-correction-history={mine.length}>
          <summary>{L(`Всички записи по тази версия (${mine.length}) — нищо не се изтрива`, `Every record on this version (${mine.length}) — nothing is deleted`)}</summary>
          <ul style={{ paddingLeft: 18, margin: "4px 0" }}>
            {mine.map((c) => <li key={c.id}>{fmtMoment(c.at)} · {labelOf(c.key)} · {fieldName(c.field, c.key)}: {c.used === null ? L("оттеглена — използва се подаденото", "withdrawn — the submitted value is used") : `${c.reported} → ${c.used}`} — «{c.reason}» ({c.by})</li>)}
          </ul>
        </details>
      )}
      {earlier.length > 0 && (
        <details className="text-sm mt-1" data-corrections-earlier={earlier.length} style={{ color: "var(--muted)" }}>
          <summary>{L(`${earlier.length} записа по по-ранни версии — пазят се, но не се пренасят: по-новата версия започва чиста.`, `${earlier.length} records on earlier versions — kept, never carried over: the newer version starts clean.`)}</summary>
          <ul style={{ paddingLeft: 18, margin: "4px 0" }}>
            {earlier.map((c) => <li key={c.id}>{L("версия", "version")} {c.version} · {fmtMoment(c.at)} · {labelOf(c.key)} · {FIELD_LABEL(c.field)[lang]}: {c.used === null ? L("оттеглена", "withdrawn") : `${c.reported} → ${c.used}`} — «{c.reason}» ({c.by})</li>)}
          </ul>
        </details>
      )}
      {/* the answer to the last post — shown even when the form is not (the scheme moved on meanwhile) */}
      {answer && !(canEnter && open && fields.length > 0) ? <p role={answer === "ok" ? "status" : "alert"} data-correction-answer={answer} className="text-sm mt-1" style={{ color: answer === "ok" ? "var(--green-dark)" : "#8f2f2f" }}>{answer === "ok" ? L("Записано.", "Recorded.") : said ? L(said.bg, said.en) : L("Не е записано.", "Not recorded.")}</p> : null}
      {canEnter && open && fields.length > 0 && (
        <form action={recordCorrectionAction} className="mt-2" data-correction-form style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <input type="hidden" name="schemeId" value={schemeId} />
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="version" value={version} />
          {/* the form's own id: a second press records nothing new (6.5 review) */}
          <input type="hidden" name="nonce" value={randomUUID()} />
          <label className="text-sm" style={{ display: "grid", gap: 3 }}>{L("Поле", "Field")}
            <select name="target" required style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", maxWidth: 320 }}>
              {fields.map((f) => <option key={targetOf(f.key, f.field)} value={targetOf(f.key, f.field)}>{labelOf(f.key)} · {fieldName(f.field, f.key)} ({L("подадено", "submitted")} {f.reported})</option>)}
            </select>
          </label>
          <label className="text-sm" style={{ display: "grid", gap: 3 }}>{L("Използвана стойност (празно = оттегли)", "Used value (empty = withdraw)")}
            <input name="used" inputMode="decimal" maxLength={40} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", width: 150 }} />
          </label>
          <label className="text-sm" style={{ display: "grid", gap: 3, flex: 1, minWidth: 240 }}>{L("Основание (вижда се и от лабораторията)", "Reason (the laboratory sees it too)")}
            <input name="reason" required minLength={5} maxLength={500} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px" }} />
          </label>
          <button type="submit" className="btn btn-sm" data-correction-submit>{L("Запиши", "Record")}</button>
          {answer ? <span role={answer === "ok" ? "status" : "alert"} data-correction-answer={answer} className="text-sm" style={{ color: answer === "ok" ? "var(--green-dark)" : "#8f2f2f" }}>{answer === "ok" ? L("Записано — лабораторията е уведомена (след одобрение на известието).", "Recorded — the laboratory is told (once the notice is released).") : said ? L(said.bg, said.en) : L("Не е записано.", "Not recorded.")}</span> : null}
        </form>
      )}
    </div>
  );
}
