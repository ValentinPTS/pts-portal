import { requireSection, mayAnywhereNow } from "@/lib/access";
import { getServerT } from "@/lib/i18n-server";
import { sofiaDay } from "@/lib/chain";
import { fmtMoment } from "@/lib/scheme-dates";
import { listCriteria } from "@/lib/validation-criteria";
import { recordCriteriaAction, voidCriteriaAction } from "@/lib/validation-actions";
import { LEVELS, LEVEL_TEXT, CRITERIA_PROBLEM_TEXT, levelStatus, nextEdition, NOTE_MAX, SIGNED_BY_MAX, MAX_EDITION } from "@/lib/validation-model";
import PendingSubmit from "@/components/PendingSubmit";

export const dynamic = "force-dynamic";

// «Валидиране» (plan part 8.1; Manual 7.5.2, Реш. 134, 144; П 7.4.1 т. 4.6.2). The portal is
// validated before first use, at five levels. PTS writes the acceptance criteria — what must
// match, with what tolerance — and signs them BEFORE any test: each signed edition is recorded
// here with its scan and hash, and a level's test can be recorded only once criteria covering
// it are signed. The head and the quality manager record; the software administrator reads.
export default async function ValidationPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  await requireSection("validation");
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const canRecord = await mayAnywhereNow("validation.record");
  const today = sofiaDay(new Date().toISOString());
  const editions = await listCriteria();
  const status = levelStatus(editions, today);
  const answer = (await searchParams).v;
  const ok: Record<string, [string, string]> = {
    recorded: ["Редакцията е записана.", "The edition is recorded."],
    voided: ["Редакцията е анулирана.", "The edition is voided."],
    "recorded-unlogged": ["Редакцията е записана, но редът в журнала не се записа — съобщете на администратора.", "The edition is recorded, but its journal line was not written — tell the administrator."],
    "voided-unlogged": ["Редакцията е анулирана, но редът в журнала не се записа — съобщете на администратора.", "The edition is voided, but its journal line was not written — tell the administrator."],
  };
  const said = answer ? ok[answer] ?? (() => { const p = (CRITERIA_PROBLEM_TEXT as Record<string, { bg: string; en: string }>)[answer]; return p ? [p.bg, p.en] as [string, string] : null; })() : null;
  const good = !!answer && (answer === "recorded" || answer === "voided");
  const input = { border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 13 } as const;
  const day = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

  return (
    <div>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{L("Валидиране", "Validation")}</h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 820 }}>
        {L("Порталът се валидира преди първа употреба (Наръчник 7.5.2, Реш. 144), на пет нива. Критериите за приемане — какво трябва да съвпадне и с какъв допуск — се пишат и подписват от PTS преди всяко изпитване (Реш. 134). Изпитване на ниво се записва само след като критериите за това ниво са подписани.",
          "The portal is validated before first use (Manual 7.5.2, Реш. 144), at five levels. The acceptance criteria — what must match, with what tolerance — are written and signed by PTS before any test (Реш. 134). A level's test is recorded only once the criteria for that level are signed.")}
      </p>

      <section className="card p-4 mt-4" id="criteria" data-criteria-section>
        <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15, margin: 0 }}>{L("Критерии за приемане", "Acceptance criteria")}</h2>
        {said && <p role={good ? "status" : "alert"} className="text-sm" data-criteria-answer={answer} style={{ color: good ? "var(--green-dark)" : "#8f2f2f", margin: "6px 0" }}>{L(said[0], said[1])}</p>}

        <table className="w-full text-sm mt-2" style={{ borderCollapse: "collapse" }} data-level-status>
          <tbody>
            {status.map(({ level, edition }) => (
              <tr key={level} data-level={level} data-level-criteria={edition ? edition.edition : "none"} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={{ padding: "5px 6px" }}>{L(LEVEL_TEXT[level].bg, LEVEL_TEXT[level].en)}</td>
                <td style={{ padding: "5px 6px", color: edition ? "var(--green-dark)" : "#8f2f2f", fontWeight: 600 }}>
                  {edition
                    ? L(`в сила: редакция № ${edition.edition}, подписана ${day(edition.signedOn)}`, `in force: edition ${edition.edition}, signed ${day(edition.signedOn)}`)
                    : L("няма подписани критерии — изпитване не може да се запише", "no signed criteria — no test can be recorded")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="font-bold mt-4" style={{ fontSize: 14, margin: "14px 0 4px" }}>{L("Редакции", "Editions")}</h3>
        {editions.length === 0 ? <p className="text-sm" style={{ color: "var(--muted)" }} data-criteria-none>{L("Още няма записани критерии. Проектът за PTS: docs/participant-portal/ACCEPTANCE-CRITERIA-BG.md.", "No criteria recorded yet.")}</p> : (
          <div style={{ display: "grid", gap: 8 }}>
            {editions.map((e) => (
              <div key={e.id} data-criteria-id={e.id} data-criteria-edition={e.edition} data-criteria-voided={e.voided ? "1" : "0"} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", opacity: e.voided ? 0.7 : 1 }}>
                <div className="text-sm" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
                  <b>{L(`Редакция № ${e.edition}`, `Edition ${e.edition}`)}</b>
                  <span>{L("подписана", "signed")} {day(e.signedOn)} · {e.signedBy}</span>
                  <span style={{ color: "var(--muted)" }}>{L("нива", "levels")}: {e.levels.join(", ")}</span>
                  <a href={`/validation/criteria/${e.id}`} target="_blank" rel="noopener" data-criteria-file>{L("подписаният документ", "the signed document")}</a>
                  <span style={{ color: "var(--muted)", fontFamily: "monospace" }} title={e.fileSha256}>SHA-256 {e.fileSha256.slice(0, 12)}…</span>
                </div>
                {e.note && <p className="text-sm" style={{ margin: "4px 0 0" }}>{e.note}</p>}
                <p className="text-sm" style={{ color: "var(--muted)", margin: "4px 0 0" }}>{L("записана от", "recorded by")} {e.recordedBy} · {fmtMoment(e.recordedAt)}</p>
                {e.voided && <p className="text-sm" data-criteria-void-reason style={{ color: "#8f2f2f", margin: "4px 0 0" }}>{L("АНУЛИРАНА", "VOIDED")} — {e.voided.reason} ({e.voided.by}, {fmtMoment(e.voided.at)})</p>}
                {canRecord && !e.voided && (
                  <details style={{ marginTop: 6 }} data-criteria-void>
                    <summary className="text-sm">{L("Анулирай — записана по грешка", "Void — recorded by mistake")}</summary>
                    <form action={voidCriteriaAction} style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      <input type="hidden" name="id" value={e.id} />
                      <input name="reason" required minLength={5} maxLength={500} placeholder={L("Защо (5–500 знака)", "Why (5–500 characters)")} style={{ ...input, minWidth: 320 }} />
                      <PendingSubmit className="btn btn-sm" mark="data-criteria-void-submit" label={L("Анулирай", "Void")} />
                    </form>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {canRecord ? (
          <details style={{ marginTop: 12 }} open={editions.length === 0} data-criteria-form-box>
            <summary className="text-sm font-bold">{L("Запиши подписана редакция", "Record a signed edition")}</summary>
            <p className="text-sm" style={{ color: "var(--muted)", margin: "6px 0 0", maxWidth: 720 }}>{L("Редакцията е целият документ: новата заменя предишната изцяло — ниво, което тя не покрива, остава без критерии от деня на подписа ѝ.", "An edition is the whole document: a new one replaces the previous entirely — a level it does not cover has no criteria from the day it is signed.")}</p>
            <form action={recordCriteriaAction} data-criteria-form style={{ display: "grid", gap: 8, marginTop: 8, maxWidth: 720 }}>
              <label className="text-sm" style={{ display: "grid", gap: 3 }}>{L("Подписаният документ (PDF, PNG или JPG, до 15 MB)", "The signed document (PDF, PNG or JPG, up to 15 MB)")}<input type="file" name="file" required accept="application/pdf,image/png,image/jpeg" /></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <label className="text-sm" style={{ display: "grid", gap: 3 }}>{L("Редакция № (както е на документа)", "Edition no. (as on the document)")}<input type="number" name="edition" required min={1} max={MAX_EDITION} defaultValue={nextEdition(editions)} style={{ ...input, width: 90 }} /></label>
                <label className="text-sm" style={{ display: "grid", gap: 3 }}>{L("Подписана на", "Signed on")}<input type="date" name="signedOn" required max={today} style={input} /></label>
                <label className="text-sm" style={{ display: "grid", gap: 3, flex: 1, minWidth: 260 }}>{L("Подписана от (както е на документа)", "Signed by (as on the document)")}<input name="signedBy" required minLength={3} maxLength={SIGNED_BY_MAX} style={input} /></label>
              </div>
              <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px" }}>
                <legend className="text-sm">{L("Нивата, които покрива", "The levels it covers")}</legend>
                {LEVELS.map((l) => <label key={l} className="text-sm" style={{ display: "flex", gap: 6 }}><input type="checkbox" name="level" value={l} />{L(LEVEL_TEXT[l].bg, LEVEL_TEXT[l].en)}</label>)}
              </fieldset>
              <label className="text-sm" style={{ display: "grid", gap: 3 }}>{L("Какво е променено спрямо предишната редакция (по желание)", "What changed since the previous edition (optional)")}<textarea name="note" maxLength={NOTE_MAX} rows={2} style={input} /></label>
              <div><PendingSubmit className="btn btn-sm btn-primary" mark="data-criteria-submit" label={L("Запиши редакцията", "Record the edition")} /></div>
            </form>
          </details>
        ) : <p className="text-sm" style={{ color: "var(--muted)", marginTop: 10 }} data-criteria-read-only>{L("Записват ръководителят на РТ провайдъра и отговорникът по качеството.", "The head of the PT provider and the quality manager record them.")}</p>}
      </section>

      <section className="card p-4 mt-4" id="tests">
        <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15, margin: 0 }}>{L("Изпитвания", "Tests")}</h2>
        <p className="text-sm" style={{ color: "var(--muted)", margin: "4px 0 0" }}>{L("Записът на изпитванията — дата, обхват, проверяващ, резултат, заключение — идва с части 8.3–8.6, спрямо критериите в сила в деня на изпитването.", "The record of the tests — date, scope, checker, result, conclusion — comes with parts 8.3–8.6, judged against the criteria in force on the test's day.")}</p>
      </section>
    </div>
  );
}
