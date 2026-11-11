import { feedbackOf } from "@/lib/feedback";
import { feedbackShown, feedbackBand, FEEDBACK_SHOWN_FROM, QUESTION_TEXT } from "@/lib/feedback-model";

// «Обратна връзка» on the scheme (plan part 10.3; Реш. 92, 122; К21): while it is given, only whether three
// have given (never the exact number — a reload would time each give); once the records are closed, from
// three, each question's counts and the words in a fixed (sorted) order — never whose, never when.
export default async function SchemeFeedbackPanel({ scheme, lang }: { scheme: { id: string; status: string; lifecycle?: { acts?: readonly { act: string }[] } }; lang: "bg" | "en" }) {
  const schemeId = scheme.id, status = scheme.status;
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const fb = await feedbackOf(schemeId).catch(() => null);
  if (!fb) return null;
  const total = fb.counts.total ?? 0;
  if (!total && status !== "report" && status !== "closed") return null;
  const shown = feedbackShown(total, scheme);
  const band = feedbackBand(total);
  const n = (k: string) => fb.counts[k] ?? 0;
  const ratingRow = (q: "q1" | "q2") => (
    <tr key={q}><td style={{ paddingRight: 12 }}>{QUESTION_TEXT[q][lang]}</td>{[1, 2, 3, 4, 5].map((v) => <td key={v} style={{ textAlign: "center", minWidth: 28 }} data-feedback-count={`${q}:${v}`}>{n(`${q}:${v}`)}</td>)}</tr>
  );
  return (
    <section className="card p-4 mt-6" data-feedback-panel={shown ? "shown" : "hidden"}>
      <h2 className="text-lg font-bold" style={{ color: "var(--green-dark)" }}>{L("Обратна връзка (анонимна)", "Feedback (anonymous)")}</h2>
      <p className="text-sm" style={{ color: "var(--muted)" }} data-feedback-band={shown ? "shown" : band}>
        {shown
          ? L(`Дадена от ${total} участия. Не се пази кой и кога (Реш. 92) — и не влиза в журнала (К21).`, `Given by ${total} participations. Who and when are not kept (Decision 92) — and it is not in the journal (К21).`)
          : band === "none" ? L("Още никой не е дал обратна връзка.", "No feedback given yet.")
          : band === "under" ? L(`Дадена от по-малко от ${FEEDBACK_SHOWN_FROM} участия.`, `Given by fewer than ${FEEDBACK_SHOWN_FROM} participations.`)
          : L(`Дадена от поне ${FEEDBACK_SHOWN_FROM} участия.`, `Given by ${FEEDBACK_SHOWN_FROM} participations or more.`)}
      </p>
      {!shown ? (
        <p className="text-sm" data-feedback-wait>{status === "closed"
          ? L(`Дадена е от по-малко от ${FEEDBACK_SHOWN_FROM} участия — отговорите не се показват, за да не може някой от тях да се свърже с участието си.`, `Fewer than ${FEEDBACK_SHOWN_FROM} participations gave it — the answers are not shown, so none can be matched to its participation.`)
          : L(`Обратната връзка се дава, докато докладът е издаден. Отговорите се виждат след «Приключи записите», ако са дадени от поне ${FEEDBACK_SHOWN_FROM} — нищо не може да се свърже с участието, което току-що е дало.`, `The feedback is given while the report stands. The answers show after «Close the records», if ${FEEDBACK_SHOWN_FROM} or more gave — nothing can be matched to the participation that just gave.`)}</p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="text-sm mt-2">
              <thead><tr><th />{[1, 2, 3, 4, 5].map((v) => <th key={v}>{v}</th>)}</tr></thead>
              <tbody>{ratingRow("q1")}{ratingRow("q2")}</tbody>
            </table>
          </div>
          <p className="text-sm mt-2">{QUESTION_TEXT.q3[lang]} — {L("Да", "Yes")}: <b data-feedback-count="q3:yes">{n("q3:yes")}</b>, {L("Не", "No")}: <b data-feedback-count="q3:no">{n("q3:no")}</b>, {L("Друго", "Other")}: <b data-feedback-count="q3:other">{n("q3:other")}</b></p>
          {(["q3", "q4", "q5"] as const).map((q) => {
            const ws = fb.words.filter((w) => w.q === q);
            return ws.length ? (
              <div key={q} className="mt-2" data-feedback-words={q}>
                <div className="text-sm font-bold">{q === "q3" ? L("«Друго» — с думи", "«Other» — in words") : QUESTION_TEXT[q][lang]}</div>
                <ul className="text-sm" style={{ margin: "2px 0 0 18px" }}>{ws.map((w, i) => <li key={i} style={{ whiteSpace: "pre-wrap" }}>{w.text}</li>)}</ul>
              </div>
            ) : null;
          })}
        </>
      )}
    </section>
  );
}
