import { requireSection, mayAnywhereNow } from "@/lib/access";
import { getServerT } from "@/lib/i18n-server";
import { sofiaDay } from "@/lib/chain";
import { fmtMoment } from "@/lib/scheme-dates";
import { listCriteria } from "@/lib/validation-criteria";
import { recordCriteriaAction, voidCriteriaAction } from "@/lib/validation-actions";
import { LEVELS, LEVEL_TEXT, CRITERIA_PROBLEM_TEXT, levelStatus, nextEdition, NOTE_MAX, SIGNED_BY_MAX, MAX_EDITION } from "@/lib/validation-model";
import PendingSubmit from "@/components/PendingSubmit";
import ReplayImport from "@/components/ReplayImport";
import Link from "next/link";
import { listSchemes } from "@/lib/store";
import { replayAllowedHere } from "@/lib/replay-import";
import { listTests } from "@/lib/validation-tests";
import { voidTestAction } from "@/lib/validation-actions";
import { TEST_PROBLEM_TEXT, ITEM_TEXT } from "@/lib/validation-test-model";

export const dynamic = "force-dynamic";

// «Валидиране» (plan part 8.1; Manual 7.5.2, Реш. 134, 144; П 7.4.1 т. 4.6.2). The portal is
// validated before first use, at five levels. PTS writes the acceptance criteria — what must
// match, with what tolerance — and signs them BEFORE any test: each signed edition is recorded
// here with its scan and hash, and a level's test can be recorded only once criteria covering
// it are signed. The head and the quality manager record; the software administrator reads.
export default async function ValidationPage({ searchParams }: { searchParams: Promise<{ v?: string; vt?: string }> }) {
  await requireSection("validation");
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const canRecord = await mayAnywhereNow("validation.record");
  // 8.2: the replay rounds, and who may load one (technical — the test environment only)
  const canImport = (await mayAnywhereNow("system.technical")) && replayAllowedHere();
  const replays = (await listSchemes()).filter((x) => !!x.replay).sort((a, b) => b.replay!.importedAt.localeCompare(a.replay!.importedAt));
  const today = sofiaDay(new Date().toISOString());
  const editions = await listCriteria();
  const status = levelStatus(editions, today);
  const sp = await searchParams;
  const answer = sp.v, testAnswer = sp.vt;
  // the tests recorded (8.3) — every level, the newest first; unreadable (0046 not yet applied, an
  // outage): said, and the criteria still shown (8.3 review)
  let tests: Awaited<ReturnType<typeof listTests>> = [], testsUnread = false;
  try { tests = await listTests(); } catch { testsUnread = true; }
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

      <section className="card p-4 mt-4" id="replays" data-replays={replays.length}>
        <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15, margin: 0 }}>{L("Приключили кръгове за повторение", "Closed rounds for the replay")}</h2>
        <p className="text-sm" style={{ color: "var(--muted)", margin: "4px 0 8px", maxWidth: 820 }}>{L("Приключил кръг се внася от входния си файл за PTS_Analysis 2.0 (договор 2.1) — само кодове, без имена (Реш. 119), в тестовата среда, със симулационен номер (Реш. 130). Порталът го изнася отново и сравнява изнасянето с файла клетка по клетка.", "A closed round is loaded from its PTS_Analysis 2.0 input file (contract 2.1) — codes only, no names (Реш. 119), in the test environment, with a simulation number (Реш. 130). The portal exports it again and compares the export with the file cell by cell.")}</p>
        {replays.length > 0 && (
          <ul className="text-sm" style={{ margin: "0 0 8px", paddingLeft: 18 }}>
            {replays.map((x) => <li key={x.id} data-replay-row={x.id}><Link href={`/schemes/${x.id}#replay`}>{x.number}</Link> — {L("възпроизвеждане на", "replay of")} {x.replay!.of} · {x.replay!.counts.participants} {L("участия", "participations")} · {day(x.replay!.importedAt.slice(0, 10))}{x.replay!.failed ? <b style={{ color: "#8f2f2f" }} data-replay-row-failed> · {L("не завърши", "not finished")}</b> : null}</li>)}
          </ul>
        )}
        {canImport ? <ReplayImport lang={lang === "bg" ? "bg" : "en"} />
          : <p className="text-sm" style={{ color: "var(--muted)" }} data-replay-not-here>{replayAllowedHere() ? L("Внася администраторът на софтуера или ръководителят на РТ провайдъра.", "The software administrator or the head of the PT provider loads them.") : L("Само в тестовата среда — истинският портал не приема възпроизвеждане.", "In the test environment only — the real portal takes no replay.")}</p>}
      </section>

      <section className="card p-4 mt-4" id="tests" data-tests={tests.length}>
        <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15, margin: 0 }}>{L("Изпитвания", "Tests")}</h2>
        <p className="text-sm" style={{ color: "var(--muted)", margin: "4px 0 8px", maxWidth: 820 }}>{L("Всяко изпитване — спрямо редакцията на критериите в сила в деня му за нивото му. Записва се от картата на кръга (ниво 1: кръгът за повторение). Нищо не се трие: изпитване, записано по грешка, се анулира с причина.", "Each test — against the criteria edition in force on its day for its level. Recorded from the round's card (level 1: the replay round). Nothing is deleted: a test recorded by mistake is voided with its reason.")}</p>
        {testAnswer && <p role={testAnswer === "voided" ? "status" : "alert"} className="text-sm" data-tests-answer={testAnswer} style={{ color: testAnswer === "voided" ? "var(--green-dark)" : "#8f2f2f" }}>{testAnswer === "voided" ? L("Изпитването е анулирано.", "The test is voided.") : testAnswer === "voided-unlogged" ? L("Изпитването е анулирано, но редът в журнала не се записа — съобщете на администратора.", "The test is voided, but its journal line was not written — tell the administrator.") : L((TEST_PROBLEM_TEXT as Record<string, { bg: string; en: string }>)[testAnswer]?.bg ?? "Не е записано.", (TEST_PROBLEM_TEXT as Record<string, { bg: string; en: string }>)[testAnswer]?.en ?? "Not recorded.")}</p>}
        {testsUnread ? <p role="alert" className="text-sm" style={{ color: "#8f2f2f" }} data-tests-unread>{L("Изпитванията не можаха да се прочетат — презаредете.", "The tests could not be read — reload.")}</p> : tests.length === 0 ? <p className="text-sm" style={{ color: "var(--muted)" }}>{L("Още няма записани изпитвания.", "No tests recorded yet.")}</p> : (
          <div style={{ display: "grid", gap: 8 }}>
            {tests.map((t) => (
              <div key={t.id} data-test-row={t.id} data-test-result={t.result} data-test-voided={t.voided ? "1" : "0"} className="text-sm" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", opacity: t.voided ? 0.7 : 1 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
                  <b style={{ color: t.result === "pass" ? "var(--green-dark)" : "#8f2f2f" }}>{t.result === "pass" ? L("ПРЕМИНАВА", "PASSES") : L("НЕ ПРЕМИНАВА", "FAILS")}</b>
                  <span>{L(`Ниво ${t.level}`, `Level ${t.level}`)} · {day(t.testedOn)}</span>
                  <Link href={`/schemes/${t.schemeId}#level-test`}>{t.schemeNumber}</Link>{t.replayOf && <span style={{ color: "var(--muted)" }}>{L("повторение на", "replay of")} {t.replayOf}</span>}
                  <span style={{ color: "var(--muted)" }}>{L("критерии редакция №", "criteria edition")} {t.criteriaEdition}{t.criteriaRecordedAfter ? L(" — записана в портала след деня на изпитването", " — recorded in the portal after the test's day") : ""}</span>
                  {t.file && <a href={`/validation/tests/${t.id}`} target="_blank" rel="noopener" data-test-file>{L("доказателството", "the evidence")}</a>}
                </div>
                <div style={{ margin: "4px 0 0" }}>{t.items.map((i) => <span key={i.key} style={{ marginRight: 10, color: i.result === "mismatch" ? "#8f2f2f" : i.result === "na" ? "#7a5416" : "var(--green-dark)" }}>{i.result === "match" ? "✓" : i.result === "na" ? "–" : "✗"} {L(ITEM_TEXT[i.key]?.bg ?? i.key, ITEM_TEXT[i.key]?.en ?? i.key)}{i.note ? ` (${i.note})` : ""}</span>)}</div>
                <div style={{ color: "var(--muted)", margin: "4px 0 0" }}>{L("порталът", "the portal")}: {t.auto.unexpected === null ? L("несравнено", "not compared") : L(`${t.auto.unexpected} неочаквани разлики`, `${t.auto.unexpected} unexpected differences`)}{t.auto.analysisVersion ? ` · PTS_Analysis ${t.auto.analysisVersion}` : ""}{t.auto.transferSame === false ? L(" · проверката на преноса: НЕ са същите", " · transfer check: NOT the same") : ""}</div>
                <p style={{ margin: "4px 0 0" }}>{t.conclusion}</p>
                <p style={{ color: "var(--muted)", margin: "2px 0 0" }}>{L("записано от", "recorded by")} {t.recordedBy} · {fmtMoment(t.recordedAt)}</p>
                {t.voided && <p style={{ color: "#8f2f2f", margin: "2px 0 0" }} data-test-void-reason>{L("АНУЛИРАНО", "VOIDED")} — {t.voided.reason} ({t.voided.by})</p>}
                {canRecord && !t.voided && (
                  <details style={{ marginTop: 4 }} data-test-void>
                    <summary>{L("Анулирай — записано по грешка", "Void — recorded by mistake")}</summary>
                    <form action={voidTestAction} style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      <input type="hidden" name="id" value={t.id} />
                      <input name="reason" required minLength={5} maxLength={500} placeholder={L("Защо (5–500 знака)", "Why (5–500 characters)")} style={{ ...input, minWidth: 320 }} />
                      <PendingSubmit className="btn btn-sm" mark="data-test-void-submit" label={L("Анулирай", "Void")} />
                    </form>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
