"use client";

import { useState } from "react";
import { computeError, showError, calField, genField, readCalDraft, checkCalibration, type GeneralField, type CheckProblem, type CalRow } from "@/lib/results-model";
import { useDraftSaver, saveStatus, type Values } from "./useDraftSaver";
import CheckReport, { CHECK_REPORT_ID } from "./CheckReport";
import SubmitPanel from "./SubmitPanel";

// The results form — calibration, per M2 (plan part 6.2; Zadanie §11; D1). GENERAL INFO, then
// a row per calibration point × direction: the reference value (the participant's reference
// equipment), the measured value (the PT item), the ERROR — measured minus reference, computed and
// shown as the two are typed, never typed itself (D1) — U at k = 2, CMC (information only), and
// «N/A» for a point outside the lab's scope: a declared choice, never an arithmetic error. The
// draft is saved as typed, by revision, as the testing form's (useDraftSaver).

export interface CalFormRow { key: string; nominal: string; direction?: string }

const GENERAL: { f: GeneralField; bg: string; en: string; wide?: boolean; type?: "date" }[] = [
  { f: "labName", bg: "Наименование на лабораторията", en: "Name of the laboratory", wide: true },
  { f: "manufacturer", bg: "Обект — производител", en: "PT item — manufacturer" },
  { f: "model", bg: "Модел", en: "Model" },
  { f: "serial", bg: "Сериен номер", en: "Serial number" },
  { f: "dateFrom", bg: "Измервания — от", en: "Measurements — from", type: "date" },
  { f: "dateTo", bg: "до", en: "to", type: "date" },
  { f: "tempMin", bg: "Температура в измервателния обем — min, °C", en: "Temperature in the measurement volume — min, °C" },
  { f: "tempMax", bg: "max, °C", en: "max, °C" },
  { f: "otherConditions", bg: "Други контролирани условия, когато е приложимо", en: "Other relevant controlled conditions, when applicable", wide: true },
  { f: "method", bg: "Метод на измерване и референтно оборудване — кратко описание", en: "Measurement method and reference equipment — short description", wide: true },
  { f: "signedOn", bg: "Дата", en: "Date", type: "date" },
  { f: "signedBy", bg: "Име и фамилия", en: "Name and surname" },
];

export default function CalibrationResultsForm({ schemeId, participantId, lang, rows, unit, quantity, code, initial, editable, savedAt, rev, windows, submitOpen = false }: {
  schemeId: string; participantId: string; lang: "bg" | "en"; rows: CalFormRow[]; unit: string; quantity: string;
  /** the laboratory's code — filled by PTS (M2), shown, never typed; absent while provisional */
  code?: string;
  initial: Values; editable: boolean; savedAt?: string; rev: number;
  /** the lab's windows with the device — from each arrival to its window's end, an extension
   *  included; a chain visiting it twice gives two (6.3) */
  windows?: { from?: string; to?: string }[];
  /** a submission is taken now — before the deadline, or under PTS's unlock (6.4) */
  submitOpen?: boolean;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const { values, change, save, state, bad: notNum, flush } = useDraftSaver({ schemeId, participantId, initial, rev, savedAt });
  const status = saveStatus(state, L);
  // 6.3: the checks before submission, on request — completeness and format only
  // once run, the report follows the form as it is typed (the checks are pure — review)
  const [checking, setChecking] = useState(false);
  const asRows: CalRow[] = rows.map((r) => ({ key: r.key, nominal: r.nominal }));
  const checked: CheckProblem[] | null = checking ? checkCalibration(readCalDraft((n) => values[n], asRows), asRows, windows ?? []) : null;
  const runCheck = () => setChecking(true);
  const flagged = new Set((checked ?? []).filter((p) => p.level !== "notice").map((p) => `${p.key}|${p.field}`));
  const bad = new Set([...notNum, ...flagged]);
  // the report names a general field in full — «до» alone says nothing (review)
  const REPORT_LABEL: Partial<Record<GeneralField, { bg: string; en: string }>> = { dateFrom: { bg: "Измервания — от", en: "Measurements — from" }, dateTo: { bg: "Измервания — до", en: "Measurements — to" }, tempMin: { bg: "Температура — min", en: "Temperature — min" }, tempMax: { bg: "Температура — max", en: "Temperature — max" } };
  const COL: Record<string, { bg: string; en: string }> = { ref: { bg: "референтна стойност", en: "reference value" }, meas: { bg: "измерена стойност", en: "measured value" }, U: { bg: "U", en: "U" }, cmc: { bg: "CMC", en: "CMC" }, na: { bg: "точки", en: "points" } };
  const labelOf = (p: CheckProblem) => {
    if (p.key === "general") { const g = REPORT_LABEL[p.field as GeneralField] ?? GENERAL.find((x) => x.f === p.field); return `${L("Обща информация", "General info")} — ${g ? L(g.bg, g.en) : p.field}`; }
    if (p.key === "points") return L("Резултати", "Results");
    const r = rows.find((x) => x.key === p.key);
    return `${L("Точка", "Point")} ${r?.nominal ?? p.key}${r?.direction ? ` · ${r.direction}` : ""} — ${COL[p.field] ? L(COL[p.field].bg, COL[p.field].en) : p.field}`;
  };
  const cell = { border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 13, fontFamily: "inherit", fontVariantNumeric: "tabular-nums" as const, width: "100%", minWidth: 70, background: editable ? "#fff" : "#f4f3ef" };
  const text = (name: string, badKey: string, extra: { type?: string; maxLength?: number; label?: string } = {}) => (
    <input name={name} value={values[name] ?? ""} onChange={(e) => change(name, e.target.value)} readOnly={!editable} aria-label={extra.label}
      type={extra.type ?? "text"} inputMode="text" autoComplete="off" spellCheck={false} maxLength={extra.maxLength ?? 40}
      aria-invalid={bad.has(badKey) || undefined} aria-describedby={flagged.has(badKey) ? CHECK_REPORT_ID : notNum.has(badKey) ? "results-not-numbers" : undefined} data-field={name}
      style={{ ...cell, borderColor: bad.has(badKey) ? "#b7791f" : "var(--line)" }} />
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} data-results-form={participantId} data-results-kind="C" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <fieldset className="card" data-general style={{ padding: "12px 14px", margin: 0, border: "1px solid var(--line)" }}>
        <legend style={{ fontWeight: 800, fontSize: 14, padding: "0 4px" }}>{L("Обща информация", "General info")}</legend>
        <p data-lab-code style={{ margin: "0 0 8px", fontSize: 12.5 }}><span style={{ color: "var(--muted)" }}>{L("Код на лабораторията (попълва се от PTS): ", "Laboratory code (filled by the PT provider): ")}</span><b>{code ?? L("още не е даден", "not given yet")}</b></p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {GENERAL.map((g) => (
            <label key={g.f} style={{ display: "grid", gap: 3, fontSize: 12, color: "var(--muted)", gridColumn: g.wide ? "1 / -1" : undefined }}>
              {L(g.bg, g.en)}
              {text(genField(g.f), `general|${g.f}`, { type: g.type, maxLength: g.f === "method" ? 500 : g.f === "otherConditions" ? 300 : g.f === "labName" ? 160 : g.f === "signedBy" ? 120 : 40 })}
            </label>
          ))}
        </div>
      </fieldset>

      <section className="card" style={{ padding: "12px 14px" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 800 }}>{L("Резултати", "Results")}{quantity ? ` — ${quantity}` : ""}</h2>
        <div style={{ overflowX: "auto" }}>
          <table data-cal-table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 11.5, color: "var(--muted)" }}>
                <th style={{ padding: "4px 6px" }}>{L("Точка на калибриране", "Calibration point")}</th>
                <th style={{ padding: "4px 6px" }}>{L("Референтна стойност (показание на еталона на участника)", "Reference value (the participant's reference equipment)")}</th>
                <th style={{ padding: "4px 6px" }}>{L("Измерена стойност (показание на обекта)", "Measured value (the PT item)")}</th>
                <th style={{ padding: "4px 6px" }}>{L("Грешка* (измерена − референтна)", "Error* (measured − reference)")}</th>
                <th style={{ padding: "4px 6px" }}>{L("U (k = 2; P ≈ 95 %)", "U (k = 2; P ≈ 95 %)")}</th>
                <th style={{ padding: "4px 6px" }}>{L("CMC** (по избор)", "CMC** (optional)")}</th>
                <th style={{ padding: "4px 6px" }}>{L("Извън обхвата ми (N/A)", "Outside my scope (N/A)")}</th>
              </tr>
              {/* the units row (M2) */}
              <tr data-units style={{ fontSize: 11.5, color: "var(--muted)" }}>
                <td style={{ padding: "2px 6px" }}>{unit}</td><td style={{ padding: "2px 6px" }}>{unit}</td><td style={{ padding: "2px 6px" }}>{unit}</td><td style={{ padding: "2px 6px" }}>{unit}</td><td style={{ padding: "2px 6px" }}>{unit}</td><td style={{ padding: "2px 6px" }}>{unit}</td><td />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const na = values[calField("na", r.key)] === "on";
                const exact = na ? "N/A" : computeError(values[calField("ref", r.key)] ?? "", values[calField("meas", r.key)] ?? "");
                // shown with a decimal comma in Bulgarian, as typed; data-error keeps the exact value
                const err = exact === "N/A" ? "N/A" : showError(exact, lang);
                return (
                  <tr key={r.key} data-cal-row={r.key} data-na={na ? "1" : "0"} style={{ borderTop: "1px solid var(--line)", opacity: na ? 0.6 : 1 }}>
                    <td style={{ padding: "6px", fontWeight: 700, whiteSpace: "nowrap" }}>{r.nominal}{r.direction ? <span style={{ fontWeight: 400, color: "var(--muted)" }}> · {r.direction}</span> : null}</td>
                    {/* each cell named by its point and its column — for a screen reader, as the table reads */}
                    <td style={{ padding: "6px" }}>{text(calField("ref", r.key), `${r.key}|ref`, { label: `${r.nominal}${r.direction ? ` ${r.direction}` : ""} — ${L("референтна стойност", "reference value")}` })}</td>
                    <td style={{ padding: "6px" }}>{text(calField("meas", r.key), `${r.key}|meas`, { label: `${r.nominal}${r.direction ? ` ${r.direction}` : ""} — ${L("измерена стойност", "measured value")}` })}</td>
                    {/* computed and shown, never typed (D1) — confirmed on submission (6.4) */}
                    <td style={{ padding: "6px", fontVariantNumeric: "tabular-nums", fontWeight: 700 }} data-error={exact ?? ""}>{err ?? "—"}</td>
                    <td style={{ padding: "6px" }}>{text(calField("U", r.key), `${r.key}|U`, { label: `${r.nominal}${r.direction ? ` ${r.direction}` : ""} — U` })}</td>
                    <td style={{ padding: "6px" }}>{text(calField("cmc", r.key), `${r.key}|cmc`, { label: `${r.nominal}${r.direction ? ` ${r.direction}` : ""} — CMC` })}</td>
                    <td style={{ padding: "6px", textAlign: "center" }}>
                      <input type="checkbox" checked={na} disabled={!editable} onChange={(e) => change(calField("na", r.key), e.target.checked ? "on" : "")} data-field={calField("na", r.key)}
                        aria-label={L(`Точка ${r.nominal}${r.direction ? ` ${r.direction}` : ""}: извън обхвата ми`, `Point ${r.nominal}${r.direction ? ` ${r.direction}` : ""}: outside my scope`)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>
          {L("* Грешката = измерена стойност минус референтна стойност; изчислява се от формуляра и вие я потвърждавате при подаването. ** CMC — по избор, само за сведение, не се използва при оценяването. За точки извън обхвата ви отбележете N/A.",
            "* The error = the measured value minus the reference value; the form computes it and you confirm it on submission. ** CMC — optional, for information only, not used for evaluation. For points outside your scope, tick N/A.")}
        </p>
      </section>

      <CheckReport problems={checked} lang={lang} labelOf={labelOf} />
      {/* 6.4: review → confirmations (the computed errors confirmed — D1) → receipt */}
      <SubmitPanel schemeId={schemeId} participantId={participantId} lang={lang} kind="C" flush={flush} open={submitOpen && editable} labelOf={labelOf}
        problems={() => checkCalibration(readCalDraft((n) => values[n], asRows), asRows, windows ?? [])}
        summary={() => (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {rows.map((r) => {
              const na = values[calField("na", r.key)] === "on";
              const err = showError(computeError(values[calField("ref", r.key)] ?? "", values[calField("meas", r.key)] ?? ""), lang);
              return (
                <li key={r.key} data-summary-row={r.key}>
                  <b>{r.nominal}{r.direction ? ` · ${r.direction}` : ""}</b> — {na ? "N/A" : `${L("референтна", "reference")} ${values[calField("ref", r.key)] || "—"}, ${L("измерена", "measured")} ${values[calField("meas", r.key)] || "—"}; ${L("грешка", "error")} `}{na ? null : <b data-summary-error>{err ?? "—"}</b>}{na ? null : `; U ${values[calField("U", r.key)] || "—"}`}
                </li>
              );
            })}
          </ul>
        )} />
      {notNum.size > 0 && (
        <p id="results-not-numbers" role="status" data-not-numbers={notNum.size} style={{ margin: 0, fontSize: 12.5, color: "#7a5416" }}>
          {L("Отбелязаните полета още не са числа (една десетична запетая или точка). Черновата ги пази, както са написани.", "The marked fields are not numbers yet (one decimal comma or point). The draft keeps them as typed.")}
        </p>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {editable && <button type="submit" className="btn btn-primary btn-sm" data-save-draft disabled={state.kind === "saving" || state.kind === "stale"}>{L("Запази черновата", "Save the draft")}</button>}
        <button type="button" className="btn btn-sm" data-run-check onClick={runCheck}>{L("Провери", "Check")}</button>
        <span role="status" data-draft-state={state.kind} style={{ fontSize: 12.5, color: state.kind === "error" || state.kind === "stale" ? "#8f2f2f" : "var(--muted)" }}>{status}</span>
      </div>
    </form>
  );
}
