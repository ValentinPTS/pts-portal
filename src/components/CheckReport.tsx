import { CHECK_TEXT, type CheckProblem } from "@/lib/results-model";

// The checks before submission, as a list (plan part 6.3; rule 12; Реш. 88): what is not filled
// in, not a number, not a date, outside the plan's physical limits, out of order or outside the
// dates — said neutrally, never a word about a value. What blocks the submission is apart from
// what is only said (a value not reported is N/R for that value — Реш. 19, 20). Once run, it
// follows the form as it is typed.

export const CHECK_REPORT_ID = "results-check-report";

export default function CheckReport({ problems, lang, labelOf }: {
  problems: CheckProblem[] | null;
  lang: "bg" | "en";
  /** the row's and the field's words, as the form shows them */
  labelOf: (p: CheckProblem) => string;
}) {
  if (!problems) return null;
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const fmt = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : d ?? "");
  const range = (p: CheckProblem) => {
    const l = p.limits;
    if (!l) return "";
    if (l.min !== undefined || l.max !== undefined) return ` (${l.min ?? "…"} – ${l.max ?? "…"})`;
    if (l.from || l.to) return ` (${fmt(l.from) || "…"} – ${fmt(l.to) || "…"})`;
    return "";
  };
  const blocks = problems.filter((p) => p.level !== "notice"), notices = problems.filter((p) => p.level === "notice");
  const item = (p: CheckProblem, i: number) => (
    <li key={`${p.key}|${p.field}|${i}`} data-check-problem={`${p.key}|${p.field}`} data-check-why={p.why} data-check-level={p.level ?? "block"}>
      {labelOf(p)}: {L(CHECK_TEXT[p.why].bg, CHECK_TEXT[p.why].en)}{range(p)}
    </li>
  );
  return (
    <section id={CHECK_REPORT_ID} role="status" data-check-report={blocks.length} data-check-notices={notices.length} className="card" style={{ padding: "10px 14px", fontSize: 13, background: blocks.length ? "#faf2e0" : "var(--green-soft)", border: `1px solid ${blocks.length ? "#ecd9ae" : "var(--line)"}` }}>
      {blocks.length === 0 ? (
        <b>{L("Проверка: формулярът е пълен и във формат.", "Check: the form is complete and in format.")}</b>
      ) : (
        <>
          <b>{L(`Проверка: ${blocks.length} ${blocks.length === 1 ? "поле иска внимание" : "полета искат внимание"}`, `Check: ${blocks.length} ${blocks.length === 1 ? "field needs attention" : "fields need attention"}`)}</b>
          <span style={{ color: "var(--muted)" }}>{L(" — само дали е попълнено и във формат; никога стойността.", " — only whether it is filled in and in format; never the value.")}</span>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{blocks.map(item)}</ul>
        </>
      )}
      {notices.length > 0 && (
        <div data-check-notice-list style={{ marginTop: 8 }}>
          <span style={{ fontWeight: 600 }}>{L("За сведение — не спира подаването:", "For information — it does not stop the submission:")}</span>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--muted)" }}>{notices.map(item)}</ul>
        </div>
      )}
    </section>
  );
}
