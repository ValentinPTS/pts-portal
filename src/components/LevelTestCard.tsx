import { recordTestAction } from "@/lib/validation-actions";
import { listCriteria } from "@/lib/validation-criteria";
import { listTests } from "@/lib/validation-tests";
import { levelState, type LevelState } from "@/lib/validation-level";
import { sofiaDay } from "@/lib/chain";
import { KIND_ITEMS, KIND_MUST, KIND_TEXT, ITEM_TEXT, TEST_PROBLEM_TEXT, LEVEL_ONE_REFERENCE, criteriaOf, roundKind, levelOfKind, needs20, SCOPE_MAX, NOTE_MAX, CONCLUSION_MAX, type ValidationTest } from "@/lib/validation-test-model";
import PendingSubmit from "@/components/PendingSubmit";
import type { Scheme } from "@/lib/types";

// «Изпитване ниво 1» (plan part 8.3; Реш. 134, 135; D3): on a replay round. What the level needs —
// the export to 2.0, 2.0's report in, the transfer check, the re-export matching its file — said item
// by item; the criteria in force for level 1 today; the form for who records the validation (the head,
// the quality manager): each item compared by a person, the conclusion; the result is the portal's
// rule, never the checker's word. The tests recorded on this round.

const READY_TEXT: Record<string, [string, string]> = {
  reference: [`Повторение на еталонния кръг ${LEVEL_ONE_REFERENCE}`, `A replay of the reference round ${LEVEL_ONE_REFERENCE}`],
  export: ["Изнасяне към 2.0 в сила — окончателно, под заключването, без корекция след него", "An export to 2.0 in force — final, under the lock, no correction after it"],
  report: ["Докладът на 2.0, внесен след това изнасяне (7.2)", "2.0's report, imported after that export (7.2)"],
  check: ["Проверката на преноса за тази двойка: «същите» (7.3)", "The transfer check of that pair: «the same» (7.3)"],
  compared: ["Изпратеният към 2.0 файл, сравнен с изходния", "The file sent to 2.0, compared with the source"],
  "compared-own": ["Изнасянето на кръга, сравнено с изходния файл", "The round's export, compared with the source file"],
  number: ["Номерът на приключилия кръг — прочетен от портала (днешна или стара форма)", "The closed round's number — read by the portal (today's form or an old one)"],
};
const OK_TEXT: Record<string, [string, string]> = {
  "recorded-pass": ["Изпитването е записано — ПРЕМИНАВА.", "The test is recorded — it PASSES."],
  "recorded-fail": ["Изпитването е записано — НЕ ПРЕМИНАВА.", "The test is recorded — it FAILS."],
  "recorded-unlogged": ["Изпитването е записано, но редът в журнала не се записа — съобщете на администратора.", "The test is recorded, but its journal line was not written — tell the administrator."],
};

export default async function LevelTestCard({ s, lang, canRecord, answer }: { s: Scheme; lang: "bg" | "en"; canRecord: boolean; answer?: string }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  // the round's kind decides the level (8.4): PTS testing — level 1; calibration, ILC, sampling — level 2
  const kind = roundKind(s), level = levelOfKind(kind);
  const today = sofiaDay(new Date().toISOString());
  let state: LevelState | null = null, tests: ValidationTest[] = [], criteria = null as ReturnType<typeof criteriaOf>, unread = false;
  try {
    const [st, eds, all] = await Promise.all([levelState(s), listCriteria(), listTests()]);
    state = st;
    criteria = criteriaOf(eds, level, today);
    tests = all.filter((t) => t.schemeId === s.id);
  } catch {
    unread = true;
  }
  const shownItems: readonly string[] = !needs20(kind) ? ["compared", "number"] : kind === "pts-t" ? ["reference", "export", "report", "check", "compared"] : ["export", "report", "check", "compared", "number"];
  const missing: string[] = state ? state.missing : [...shownItems];
  const unexpected = state?.auto.unexpected ?? null;
  const said = answer ? OK_TEXT[answer] ?? ((p) => (p ? [p.bg, p.en] as [string, string] : null))((TEST_PROBLEM_TEXT as Record<string, { bg: string; en: string }>)[answer]) : null;
  const good = !!answer && answer.startsWith("recorded-") && answer !== "recorded-unlogged";
  const input = { border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 13 } as const;
  const day = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
  return (
    <section className="card p-4 mt-4" id="level-test" data-level-test={level} data-level-ready={missing.length ? "no" : "yes"}>
      <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15, margin: 0 }} data-level-kind={kind}>{L(`Изпитване ниво ${level} — повторение на приключил кръг (${KIND_TEXT[kind].bg})`, `Level ${level} test — the replay of a closed round (${KIND_TEXT[kind].en})`)}</h2>
      <p className="text-sm" style={{ color: "var(--muted)", margin: "2px 0 8px", maxWidth: 820 }}>{!needs20(kind)
        ? L("Пробовземане — само моделът на данните и номерът (А9): порталът внася кръга и го изнася отново, сравнено с изходния файл; човек проверява точките срещу подписаните критерии.", "Sampling — the data model and the number only (А9): the portal loads the round and exports it again, compared with the source file; a person checks the items against the signed criteria.")
        : L("Изнасяне → 2.0 → внасяне трябва да възпроизведе издадения доклад. Порталът не изчислява (Реш. 135): сравнява човек, точка по точка, срещу подписаните критерии; каквото порталът проверява сам, се записва с изпитването.", "Export → 2.0 → import must reproduce the issued report. The portal computes nothing (Реш. 135): a person compares, item by item, against the signed criteria; what the portal checks by itself is recorded with the test.")}</p>
      {said && <p role={good ? "status" : "alert"} className="text-sm" data-level-answer={answer} style={{ color: good ? "var(--green-dark)" : "#8f2f2f", margin: "0 0 6px" }}>{L(said[0], said[1])}</p>}
      {unread && <p role="alert" className="text-sm" style={{ color: "#8f2f2f" }}>{L("Не можа да се прочете какво е готово — презаредете.", "What is ready could not be read — reload.")}</p>}
      <ul className="text-sm" style={{ margin: "0 0 6px", paddingLeft: 18 }} data-level-ready-list>
        {shownItems.map((k) => { const off = missing.includes(k) || (k === "report" && missing.includes("report-after")); return <li key={k} data-ready-item={k} data-ready={off ? "0" : "1"} style={{ color: off ? "#7a5416" : "var(--green-dark)" }}>{off ? "○" : "✓"} {L(...READY_TEXT[k === "compared" && !needs20(kind) ? "compared-own" : k])}{k === "compared" && unexpected !== null ? L(` — ${unexpected} неочаквани разлики`, ` — ${unexpected} unexpected differences`) : ""}</li>; })}
        <li data-ready-item="criteria" data-ready={criteria ? "1" : "0"} style={{ color: criteria ? "var(--green-dark)" : "#8f2f2f" }}>{criteria ? "✓" : "○"} {criteria ? L(`Критерии за ниво ${level} в сила днес: редакция № ${criteria.edition.edition}, подписана ${day(criteria.edition.signedOn)}`, `Criteria for level ${level} in force today: edition ${criteria.edition.edition}, signed ${day(criteria.edition.signedOn)}`) : L(`Няма подписани критерии за ниво ${level} — изпитване не може да се запише (Реш. 134)`, `No signed criteria for level ${level} — no test can be recorded (Реш. 134)`)}</li>
      </ul>
      {tests.length > 0 && (
        <div style={{ display: "grid", gap: 6, margin: "6px 0" }}>
          {tests.map((t) => (
            <div key={t.id} data-level-test-row={t.id} data-test-result={t.result} data-test-voided={t.voided ? "1" : "0"} className="text-sm" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", opacity: t.voided ? 0.7 : 1 }}>
              <b style={{ color: t.result === "pass" ? "var(--green-dark)" : "#8f2f2f" }}>{t.result === "pass" ? L("ПРЕМИНАВА", "PASSES") : L("НЕ ПРЕМИНАВА", "FAILS")}</b> · {day(t.testedOn)} · {L("критерии редакция №", "criteria edition")} {t.criteriaEdition}{t.criteriaRecordedAfter ? L(" (записана в портала след деня на изпитването)", " (recorded in the portal after the test's day)") : ""} · {t.recordedBy}
              {t.voided && <span style={{ color: "#8f2f2f" }}> · {L("АНУЛИРАНО", "VOIDED")}: {t.voided.reason}</span>}
              <div style={{ color: "var(--muted)" }}>{t.conclusion}</div>
            </div>
          ))}
        </div>
      )}
      {canRecord && criteria && missing.length === 0 && (
        <details style={{ marginTop: 6 }} data-level-form-box open={tests.length === 0}>
          <summary className="text-sm font-bold">{L("Запиши изпитване", "Record a test")}</summary>
          <form action={recordTestAction} data-level-form style={{ display: "grid", gap: 8, marginTop: 8, maxWidth: 820 }}>
            <input type="hidden" name="schemeId" value={s.id} />
            <label className="text-sm" style={{ display: "grid", gap: 3, width: 180 }}>{L("Дата на изпитването", "The test's date")}<input type="date" name="testedOn" required min={state?.earliest} max={today} defaultValue={today} style={input} /></label>
            <label className="text-sm" style={{ display: "grid", gap: 3 }}>{L("Обхват (по желание)", "Scope (optional)")}<input name="scope" maxLength={SCOPE_MAX} style={input} /></label>
            <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px", display: "grid", gap: 6 }}>
              <legend className="text-sm">{needs20(kind) ? L("Точките — сравнени от вас срещу издадения доклад", "The items — compared by you against the issued report") : L("Точките — сравнени от вас срещу записите на приключилия кръг", "The items — compared by you against the closed round's records")}</legend>
              {KIND_ITEMS[kind].map((k) => (
                <div key={k} className="text-sm" data-level-item={k} style={{ display: "grid", gap: 3 }}>
                  <span>{L(ITEM_TEXT[k].bg, ITEM_TEXT[k].en)}{KIND_MUST[kind].includes(k) ? <b style={{ color: "#7a5416" }}>{L(" — трябва да съвпада", " — must match")}</b> : null}</span>
                  <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {(["match", "mismatch", "na"] as const).map((r) => <label key={r} style={{ display: "flex", gap: 4 }}><input type="radio" name={`item_${k}`} value={r} required />{r === "match" ? L("съвпада", "matches") : r === "mismatch" ? L("не съвпада", "does not match") : L("неприложимо", "not applicable")}</label>)}
                  </span>
                  <input name={`note_${k}`} maxLength={NOTE_MAX} placeholder={L("Защо — при «не съвпада» и «неприложимо»", "Why — for «does not match» and «not applicable»")} style={input} />
                </div>
              ))}
            </fieldset>
            <label className="text-sm" style={{ display: "grid", gap: 3 }}>{L("Заключение", "Conclusion")}<textarea name="conclusion" required minLength={5} maxLength={CONCLUSION_MAX} rows={2} style={input} /></label>
            <label className="text-sm" style={{ display: "grid", gap: 3 }}>{L("Доказателство (по желание — PDF, PNG или JPG)", "Evidence (optional — PDF, PNG or JPG)")}<input type="file" name="file" accept="application/pdf,image/png,image/jpeg" /></label>
            <p className="text-sm" style={{ color: "var(--muted)", margin: 0 }}>{needs20(kind)
              ? L("Резултатът не се избира: изпитването преминава само ако точките, които трябва да съвпадат, съвпадат, другите съвпадат или са неприложими (с причина), в изпратения към 2.0 файл няма неочаквана разлика, а проверката на преноса казва «същите».", "The result is not chosen: the test passes only if the items that must match match, the others match or are not applicable (with why), the file sent to 2.0 has no unexpected difference, and the transfer check says «the same».")
              : L("Резултатът не се избира: изпитването преминава само ако точките, които трябва да съвпадат, съвпадат, порталът е прочел номера и в изнасянето на кръга няма неочаквана разлика.", "The result is not chosen: the test passes only if the items that must match match, the portal read the number, and the round's export has no unexpected difference.")}</p>
            <div><PendingSubmit className="btn btn-sm btn-primary" mark="data-level-submit" label={L("Запиши изпитването", "Record the test")} /></div>
          </form>
        </details>
      )}
    </section>
  );
}
