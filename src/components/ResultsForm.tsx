"use client";

import { useState } from "react";
import { useDraftSaver, saveStatus } from "./useDraftSaver";
import CheckReport, { CHECK_REPORT_ID } from "./CheckReport";
import SubmitPanel from "./SubmitPanel";
import { readDraft, checkTesting, type CheckProblem, type ResultRow } from "@/lib/results-model";

// The results form — testing (plan part 6.1). What is typed is kept exactly as typed, saved a
// few seconds after typing stops (and by «Запази черновата»). The mean is the participant's own —
// never computed here (Реш. 88); k is required, prefilled with 2 (К22). A field that is not a
// number yet is named, neutrally — never a word about a value (rule 12).
//
// Each save names the draft's revision it was typed over: a newer one stored meanwhile (another
// tab, another user of the participation, a page brought back by «Back») is never overwritten —
// the form says so and stops (6.1 review). «Saved» is said only when nothing changed since the
// save was sent; leaving with changes unsaved asks first.

export interface FormRow {
  key: string;
  name: string;
  method: string;
  unit?: string;
  determinations: number;
  uRequired: boolean;
  /** the plan's physical limits (3.6) — checked neutrally (6.3) */
  guardMin?: number;
  guardMax?: number;
}

type Values = Record<string, string>;
const field = (kind: "d" | "mean" | "U" | "k", key: string, j?: number) => (kind === "d" ? `d_${key}_${j}` : `${kind}_${key}`);
const NAMES = { mean: { bg: "Средна стойност", en: "Mean" }, U: { bg: "U (разширена)", en: "U (expanded)" }, k: { bg: "k", en: "k" } };
const ROMAN = ["I", "II", "III"];

export default function ResultsForm({ schemeId, participantId, lang, rows, initial, editable, savedAt, rev, period, submitOpen = false }: {
  schemeId: string; participantId: string; lang: "bg" | "en"; rows: FormRow[]; initial: Values; editable: boolean; savedAt?: string; rev: number;
  /** the scheme's dates the test period lies within: the dispatch, the results deadline in force (6.3) */
  period?: { from?: string; to?: string };
  /** a submission is taken now — before the deadline, or under PTS's unlock (6.4) */
  submitOpen?: boolean;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const { values, change, save, state, bad: notNum, flush } = useDraftSaver({ schemeId, participantId, initial, rev, savedAt });
  const status = saveStatus(state, L);
  // 6.3: the checks before submission, on request — completeness and format only
  // once run, the report follows the form as it is typed (the checks are pure — review)
  const [checking, setChecking] = useState(false);
  const asRows: ResultRow[] = rows.map((r, i) => ({ key: r.key, index: i, name: { bg: r.name, en: r.name }, method: { bg: r.method, en: r.method }, unit: r.unit, determinations: r.determinations, uRequired: r.uRequired, guardMin: r.guardMin, guardMax: r.guardMax }));
  const checked: CheckProblem[] | null = checking ? checkTesting(readDraft((n) => values[n], asRows), asRows, period ?? {}) : null;
  const runCheck = () => setChecking(true);
  const flagged = new Set((checked ?? []).filter((p) => p.level !== "notice").map((p) => `${p.key}|${p.field}`));
  const bad = new Set([...notNum, ...flagged]);
  const fieldLabel = (f: string) => (f.startsWith("d") ? L(`определяне ${ROMAN[Number(f.slice(1)) - 1]}`, `determination ${ROMAN[Number(f.slice(1)) - 1]}`) : f === "mean" ? L("средна стойност", "mean") : f === "from" ? L("от", "from") : f === "to" ? L("до", "to") : f);
  const labelOf = (p: CheckProblem) => (p.key === "period" ? `${L("Период на изпитване", "Test period")} — ${fieldLabel(p.field)}` : p.key === "rows" ? L("Характеристики", "Characteristics") : `${rows.find((r) => r.key === p.key)?.name ?? p.key} (${rows.find((r) => r.key === p.key)?.method ?? ""}) — ${fieldLabel(p.field)}`);
  const input = (name: string, badKey: string) => (
    <input
      name={name} value={values[name] ?? ""} onChange={(e) => change(name, e.target.value)} readOnly={!editable}
      // text, not a number keyboard: a minus and a decimal comma must be typeable (5.7 review)
      type="text" inputMode="text" autoComplete="off" spellCheck={false} maxLength={40}
      aria-invalid={bad.has(badKey) || undefined} aria-describedby={flagged.has(badKey) ? CHECK_REPORT_ID : notNum.has(badKey) ? "results-not-numbers" : undefined} data-field={name}
      style={{ width: "100%", minWidth: 80, border: `1px solid ${bad.has(badKey) ? "#b7791f" : "var(--line)"}`, borderRadius: 8, padding: "5px 8px", fontSize: 13, fontFamily: "inherit", fontVariantNumeric: "tabular-nums", background: editable ? "#fff" : "#f4f3ef" }}
    />
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} data-results-form={participantId} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* the test period (6.3: inside the scheme's dates) */}
      <fieldset className="card" data-test-period style={{ padding: "10px 14px", margin: 0, border: "1px solid var(--line)" }}>
        <legend style={{ fontWeight: 800, fontSize: 14, padding: "0 4px" }}>{L("Период на изпитване", "Test period")}</legend>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {(["from", "to"] as const).map((f) => (
            <label key={f} style={{ display: "grid", gap: 3, fontSize: 12, color: "var(--muted)" }}>
              {f === "from" ? L("от", "from") : L("до", "to")}
              <input type="date" name={`p_${f}`} value={values[`p_${f}`] ?? ""} onChange={(e) => change(`p_${f}`, e.target.value)} readOnly={!editable} data-field={`p_${f}`}
                aria-invalid={bad.has(`period|${f}`) || undefined}
                style={{ border: `1px solid ${bad.has(`period|${f}`) ? "#b7791f" : "var(--line)"}`, borderRadius: 8, padding: "5px 8px", fontSize: 13, fontFamily: "inherit", background: editable ? "#fff" : "#f4f3ef" }} />
            </label>
          ))}
        </div>
      </fieldset>
      {rows.map((r) => (
        // the legend names the characteristic WITH its method — every field inside is read with it
        <fieldset key={r.key} data-result-row={r.key} className="card" style={{ padding: "12px 14px", margin: 0, border: "1px solid var(--line)" }}>
          <legend style={{ fontWeight: 800, fontSize: 14, padding: "0 4px" }}>{r.name}<span style={{ fontWeight: 400, color: "var(--muted)" }}> — {r.method}{r.unit ? ` · ${r.unit}` : ""}</span></legend>
          {/* not reported, per characteristic (Реш. 19, 20): a stated choice — the row is N/R */}
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
            <input type="checkbox" checked={values[`nr_${r.key}`] === "on"} disabled={!editable} onChange={(e) => change(`nr_${r.key}`, e.target.checked ? "on" : "")} data-field={`nr_${r.key}`} />
            {L("Не докладвам тази характеристика (N/R)", "I do not report this characteristic (N/R)")}
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, alignItems: "end" }}>
            {Array.from({ length: r.determinations }, (_, j) => (
              <label key={j} style={{ display: "grid", gap: 3, fontSize: 12, color: "var(--muted)" }}>
                {L(`Определяне ${ROMAN[j]}`, `Determination ${ROMAN[j]}`)}
                {input(field("d", r.key, j), `${r.key}|d${j + 1}`)}
              </label>
            ))}
            {(["mean", "U", "k"] as const).map((f) => (
              <label key={f} style={{ display: "grid", gap: 3, fontSize: 12, color: f === "mean" ? "var(--ink)" : "var(--muted)", fontWeight: f === "mean" ? 700 : 400 }}>
                {L(NAMES[f].bg, NAMES[f].en)}{f === "U" && !r.uRequired ? L(" (по желание)", " (optional)") : ""}
                {input(field(f, r.key), `${r.key}|${f}`)}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {notNum.size > 0 && (
        <p id="results-not-numbers" role="status" data-not-numbers={notNum.size} style={{ margin: 0, fontSize: 12.5, color: "#7a5416" }}>
          {L("Отбелязаните полета още не са числа (една десетична запетая или точка). Черновата ги пази, както са написани.", "The marked fields are not numbers yet (one decimal comma or point). The draft keeps them as typed.")}
        </p>
      )}
      <CheckReport problems={checked} lang={lang} labelOf={labelOf} />
      {/* 6.4: review → confirmations → receipt */}
      <SubmitPanel schemeId={schemeId} participantId={participantId} lang={lang} kind="T" flush={flush} open={submitOpen && editable} labelOf={labelOf}
        problems={() => checkTesting(readDraft((n) => values[n], asRows), asRows, period ?? {})}
        summary={() => (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {rows.map((r) => (
              <li key={r.key} data-summary-row={r.key}>
                <b>{r.name}</b> <span style={{ color: "var(--muted)" }}>({r.method})</span> — {values[`nr_${r.key}`] === "on" ? L("не докладвам (N/R)", "not reported (N/R)") : `${L("средна", "mean")} ${values[field("mean", r.key)] || "—"}${values[field("U", r.key)] ? `; U ${values[field("U", r.key)]} (k ${values[field("k", r.key)] || "—"})` : ""}${Array.from({ length: r.determinations }, (_, j) => values[field("d", r.key, j)]).some(Boolean) ? `; ${L("определяния", "determinations")} ${Array.from({ length: r.determinations }, (_, j) => values[field("d", r.key, j)] || "N/R").join(" / ")}` : ""}`}
              </li>
            ))}
            <li>{L("Период на изпитване", "Test period")}: {values.p_from || "—"}{values.p_to && values.p_to !== values.p_from ? ` – ${values.p_to}` : ""}</li>
          </ul>
        )} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {editable && <button type="submit" className="btn btn-primary btn-sm" data-save-draft disabled={state.kind === "saving" || state.kind === "stale"}>{L("Запази черновата", "Save the draft")}</button>}
        <button type="button" className="btn btn-sm" data-run-check onClick={runCheck}>{L("Провери", "Check")}</button>
        <span role="status" data-draft-state={state.kind} style={{ fontSize: 12.5, color: state.kind === "error" || state.kind === "stale" ? "#8f2f2f" : "var(--muted)" }}>{status}</span>
      </div>
    </form>
  );
}
