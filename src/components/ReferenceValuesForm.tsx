"use client";

import { useActionState } from "react";
import { saveReferenceValuesAction, type ReferenceSaveState } from "@/lib/actions";

// The reference values per point, as a form (plan part 5.7): one row per point (× direction),
// the five columns of 2.0's «Calibration» sheet. A refusal hands the table back as typed, the
// field named and focused — nothing typed is lost (5.7 review).

export interface RefRow { key: string; label: string; values: Record<string, string>; xRef?: string; uStab?: string; scoringXref?: string }

export default function ReferenceValuesForm({ lang, schemeId, version, fp, rows, fields, kReason, canEdit }: {
  lang: "bg" | "en";
  schemeId: string;
  version: number;
  fp: string;
  rows: RefRow[];
  fields: { f: string; label: string }[];
  kReason: string;
  canEdit: boolean;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const [state, action, pending] = useActionState<ReferenceSaveState, FormData>(saveReferenceValuesAction, null);
  const bad = state?.problem ? `${state.problem.field}__${state.problem.key}` : "";
  const why = state?.problem?.why;
  const ERR: Record<string, string> = {
    scheme: L("Само схема за калибриране има референтни стойности.", "Only a calibration scheme has reference values."),
    state: L("След доклада стойностите не се променят.", "After the report the values are not changed."),
    ids: L("Точките на схемата още нямат постоянни номера — запазете веднъж редакцията на схемата.", "The scheme's points have no lasting ids yet — save the scheme's editor once."),
    moved: L("Междувременно стойностите или точките на схемата са променени — нищо не е записано. Презаредете страницата.", "The values or the scheme's points changed meanwhile — nothing was saved. Reload the page."),
    kreason: L("k е различно от 2 — напишете обосновката (поне 3 знака).", "k is other than 2 — write the reason (3 characters at least)."),
    value: L("Стойността не е приета", "A value was not taken"),
  };
  const whyText = why === "negative" ? L("неопределеността не може да е отрицателна", "an uncertainty cannot be negative")
    : why === "zero" ? L("u (калибриране) трябва да е над 0", "u (calibration) must be above 0")
    : why === "k" ? L("k е от 1 до 10", "k is from 1 to 10")
    : L("не е число (десетичен знак — запетая или точка, веднъж)", "not a number (one decimal comma or point)");
  const badRow = rows.find((r) => r.key === state?.problem?.key);
  const badField = fields.find((x) => x.f === state?.problem?.field);
  const cell = { border: "1px solid var(--line)", borderRadius: 6, padding: "3px 6px", fontSize: 13, width: 110, fontFamily: "inherit", fontVariantNumeric: "tabular-nums" } as const;
  return (
    <form action={action} key={state?.n ?? 0} data-reference-form>
      <input type="hidden" name="schemeId" value={schemeId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="fp" value={fp} />
      {state?.error && (
        <div role="alert" id="ref-err" data-reference-err={state.error} className="card p-3 mt-2 text-sm" style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          {ERR[state.error] ?? ERR.value}{state.error === "value" && badRow && badField ? ` — ${badRow.label}, ${badField.label}: ${whyText}. ${L("Нищо не е записано; написаното стои.", "Nothing was saved; what you typed stays.")}` : ""}
        </div>
      )}
      <div style={{ overflowX: "auto" }} className="mt-3">
        <table className="text-sm" style={{ borderCollapse: "collapse", minWidth: 860 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
              <th className="p-1">{L("Точка", "Point")}</th>
              {fields.map((x) => <th key={x.f} className="p-1">{x.label}</th>)}
              <th className="p-1">X_ref</th>
              <th className="p-1">u_stab</th>
              <th className="p-1" title={L("Референтната стойност, въведена отделно в «Резултати» (до 7.1)", "The reference value entered separately under «Results» (until 7.1)")}>{L("в «Резултати»", "in «Results»")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} data-reference-row={r.key} style={{ borderTop: "1px solid var(--line)" }}>
                <td className="p-1" style={{ whiteSpace: "nowrap" }}>{r.label}</td>
                {fields.map((x) => {
                  const name = `${x.f}__${r.key}`;
                  const isBad = name === bad;
                  return (
                    <td key={x.f} className="p-1">
                      {canEdit
                        ? <input name={name} defaultValue={state?.values?.[name] ?? r.values[x.f] ?? ""} inputMode="text" autoComplete="off" spellCheck={false}
                            aria-label={`${r.label} — ${x.label}`} aria-invalid={isBad || undefined} aria-describedby={isBad ? "ref-err" : undefined} autoFocus={isBad}
                            placeholder={x.f === "k" ? "2" : ""} style={{ ...cell, ...(isBad ? { borderColor: "#d9534f", background: "#fdecec" } : {}) }} />
                        : <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.values[x.f] || "—"}</span>}
                    </td>
                  );
                })}
                <td className="p-1" data-xref={r.xRef ?? ""} style={{ fontVariantNumeric: "tabular-nums" }}>{r.xRef ?? "—"}</td>
                <td className="p-1" data-ustab={r.uStab ?? ""} style={{ fontVariantNumeric: "tabular-nums" }}>{r.uStab ?? "—"}</td>
                <td className="p-1" data-scoring-xref={r.scoringXref ?? ""} style={{ fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{r.scoringXref ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <div className="mt-3 flex items-end gap-3" style={{ flexWrap: "wrap" }}>
          <label className="grid text-xs" style={{ color: "var(--muted)", minWidth: 320 }}>
            {L("Обосновка, когато k ≠ 2 (Заданието: k = 2, освен ако не е обосновано друго)", "The reason, when k ≠ 2 (the Zadanie: k = 2 unless justified otherwise)")}
            <input name="kReason" maxLength={300} defaultValue={state?.kReason ?? kReason} aria-invalid={state?.error === "kreason" || undefined} autoFocus={state?.error === "kreason"}
              style={{ ...cell, width: "100%", ...(state?.error === "kreason" ? { borderColor: "#d9534f", background: "#fdecec" } : {}) }} />
          </label>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? L("Записва се…", "Saving…") : L("Запиши като нова версия", "Save as a new version")}</button>
        </div>
      ) : null}
    </form>
  );
}
