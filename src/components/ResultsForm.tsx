"use client";

import { useDraftSaver, saveStatus } from "./useDraftSaver";

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
}

type Values = Record<string, string>;
const field = (kind: "d" | "mean" | "U" | "k", key: string, j?: number) => (kind === "d" ? `d_${key}_${j}` : `${kind}_${key}`);
const NAMES = { mean: { bg: "Средна стойност", en: "Mean" }, U: { bg: "U (разширена)", en: "U (expanded)" }, k: { bg: "k", en: "k" } };
const ROMAN = ["I", "II", "III"];

export default function ResultsForm({ schemeId, participantId, lang, rows, initial, editable, savedAt, rev }: {
  schemeId: string; participantId: string; lang: "bg" | "en"; rows: FormRow[]; initial: Values; editable: boolean; savedAt?: string; rev: number;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const { values, change, save, state, bad } = useDraftSaver({ schemeId, participantId, initial, rev, savedAt });
  const status = saveStatus(state, L);
  const input = (name: string, badKey: string) => (
    <input
      name={name} value={values[name] ?? ""} onChange={(e) => change(name, e.target.value)} readOnly={!editable}
      // text, not a number keyboard: a minus and a decimal comma must be typeable (5.7 review)
      type="text" inputMode="text" autoComplete="off" spellCheck={false} maxLength={40}
      aria-invalid={bad.has(badKey) || undefined} aria-describedby={bad.has(badKey) ? "results-not-numbers" : undefined} data-field={name}
      style={{ width: "100%", minWidth: 80, border: `1px solid ${bad.has(badKey) ? "#b7791f" : "var(--line)"}`, borderRadius: 8, padding: "5px 8px", fontSize: 13, fontFamily: "inherit", fontVariantNumeric: "tabular-nums", background: editable ? "#fff" : "#f4f3ef" }}
    />
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} data-results-form={participantId} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((r) => (
        // the legend names the characteristic WITH its method — every field inside is read with it
        <fieldset key={r.key} data-result-row={r.key} className="card" style={{ padding: "12px 14px", margin: 0, border: "1px solid var(--line)" }}>
          <legend style={{ fontWeight: 800, fontSize: 14, padding: "0 4px" }}>{r.name}<span style={{ fontWeight: 400, color: "var(--muted)" }}> — {r.method}{r.unit ? ` · ${r.unit}` : ""}</span></legend>
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
      {bad.size > 0 && (
        <p id="results-not-numbers" role="status" data-not-numbers={bad.size} style={{ margin: 0, fontSize: 12.5, color: "#7a5416" }}>
          {L("Отбелязаните полета още не са числа (една десетична запетая или точка). Черновата ги пази, както са написани.", "The marked fields are not numbers yet (one decimal comma or point). The draft keeps them as typed.")}
        </p>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {editable && <button type="submit" className="btn btn-primary btn-sm" data-save-draft disabled={state.kind === "saving" || state.kind === "stale"}>{L("Запази черновата", "Save the draft")}</button>}
        <span role="status" data-draft-state={state.kind} style={{ fontSize: 12.5, color: state.kind === "error" || state.kind === "stale" ? "#8f2f2f" : "var(--muted)" }}>{status}</span>
      </div>
    </form>
  );
}
