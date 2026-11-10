import Link from "next/link";
import { requireSection } from "@/lib/access";
import { getServerT } from "@/lib/i18n-server";
import { sofiaDay } from "@/lib/chain";
import { fmtMoment } from "@/lib/scheme-dates";
import { listCriteria } from "@/lib/validation-criteria";
import { listTests } from "@/lib/validation-tests";
import { LEVELS, LEVEL_TEXT } from "@/lib/validation-model";
import { ITEM_TEXT, KIND_TEXT, latestTest, type RoundKind } from "@/lib/validation-test-model";
import { d1Check } from "@/lib/d1-check";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

// «Протокол от валидирането» (plan part 8.6; Manual 7.5.2; П 7.4.1 т. 4.6.2): the whole validation on
// one printable page — the criteria, every test (date, scope, checker, result, conclusion), the coverage,
// and the D1 computation verified on a representative data set. Printed and signed by the checker and
// the head. Names no participant (the rounds are replays and dry runs, by code).
export default async function ValidationRecordPage() {
  await requireSection("validation");
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const [editions, tests] = await Promise.all([listCriteria(), listTests()]);
  const d1 = d1Check();
  const today = sofiaDay(new Date().toISOString());
  const day = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
  const running = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 12) || L("местна сборка", "a local build");
  const cell = { padding: "3px 6px", borderTop: "1px solid var(--line)", verticalAlign: "top" } as const;
  const cover: { level: 1 | 2 | 3; kind: RoundKind; label: [string, string] }[] = [
    { level: 1, kind: "pts-t", label: ["Ниво 1 — PTS 26/03-T-1", "Level 1 — PTS 26/03-T-1"] },
    ...(["calibration", "ilc", "sampling"] as const).map((k) => ({ level: 2 as const, kind: k, label: [`Ниво 2 — ${KIND_TEXT[k].bg}`, `Level 2 — ${KIND_TEXT[k].en}`] as [string, string] })),
    ...(["pts-t", "calibration", "ilc"] as const).map((k) => ({ level: 3 as const, kind: k, label: [`Ниво 3 — ${KIND_TEXT[k].bg}`, `Level 3 — ${KIND_TEXT[k].en}`] as [string, string] })),
  ];
  return (
    <div data-validation-record>
      <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
        <Link href="/validation">← {L("Валидиране", "Validation")}</Link>
        <PrintButton label={L("Печат", "Print")} />
        <a href="/validation/record/d1.csv" data-d1-csv>{L("Наборът за D1 (CSV) — за проверка с независим инструмент", "The D1 set (CSV) — to check with an independent tool")}</a>
        <span data-record-printed-on>{L(`отпечатан ${day(today)}`, `printed ${day(today)}`)}</span>
      </div>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{L("Протокол от валидирането на портала", "The portal's validation record")}</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>{L(`Наръчник 7.5.2, П 7.4.1 т. 4.6.2 · отпечатан ${day(today)} · версия на портала ${running}`, `Manual 7.5.2, П 7.4.1 т. 4.6.2 · printed ${day(today)} · the portal's version ${running}`)}</p>

      <h2 className="font-bold mt-4" style={{ fontSize: 16 }}>{L("1. Критерии за приемане", "1. Acceptance criteria")}</h2>
      {editions.length === 0 ? <p className="text-sm" data-record-no-criteria>{L("Няма записани критерии.", "No criteria recorded.")}</p> : (
        <table className="text-sm" style={{ borderCollapse: "collapse", width: "100%" }} data-record-criteria={editions.length}>
          <thead><tr><th style={cell}>№</th><th style={cell}>{L("Подписана", "Signed")}</th><th style={cell}>{L("От", "By")}</th><th style={cell}>{L("Нива", "Levels")}</th><th style={cell}>SHA-256</th><th style={cell}>{L("Състояние", "State")}</th></tr></thead>
          <tbody>{editions.map((e) => <tr key={e.id}><td style={cell}>{e.edition}</td><td style={cell}>{day(e.signedOn)}</td><td style={cell}>{e.signedBy}</td><td style={cell}>{e.levels.join(", ")}</td><td style={{ ...cell, fontFamily: "monospace", fontSize: 11 }}>{e.fileSha256}</td><td style={cell}>{e.voided ? L(`анулирана — ${e.voided.reason}`, `voided — ${e.voided.reason}`) : L("валидна", "valid")}</td></tr>)}</tbody>
        </table>
      )}

      <h2 className="font-bold mt-4" style={{ fontSize: 16 }}>{L("2. Покритие", "2. Coverage")}</h2>
      <ul className="text-sm" data-record-coverage>
        {cover.map((c) => { const t = latestTest(tests, c.level, c.kind); return <li key={`${c.level}-${c.kind}`} data-record-cover={`${c.level}-${c.kind}`} data-covered={t?.result === "pass" ? "1" : "0"}>{L(...c.label)}: {!t ? L("няма изпитване", "no test") : t.result === "pass" ? L(`премина (${day(t.testedOn)})`, `passed (${day(t.testedOn)})`) : L(`последното НЕ премина (${day(t.testedOn)})`, `the latest FAILED (${day(t.testedOn)})`)}</li>; })}
        <li>{L(`${LEVEL_TEXT[4].bg}, ${LEVEL_TEXT[5].bg} — извън портала (пилотът и цялата схема)`, `${LEVEL_TEXT[4].en}, ${LEVEL_TEXT[5].en} — outside the portal (the pilot and the full scheme)`)}</li>
      </ul>

      <h2 className="font-bold mt-4" style={{ fontSize: 16 }}>{L("3. Изпитвания", "3. Tests")}</h2>
      {tests.length === 0 ? <p className="text-sm" data-record-no-tests>{L("Няма записани изпитвания.", "No tests recorded.")}</p> : LEVELS.filter((lv) => tests.some((t) => t.level === lv)).map((lv) => (
        <div key={lv} data-record-level={lv}>
          <h3 className="font-bold" style={{ fontSize: 14, margin: "8px 0 4px" }}>{L(LEVEL_TEXT[lv].bg, LEVEL_TEXT[lv].en)}</h3>
          {tests.filter((t) => t.level === lv).map((t) => (
            <div key={t.id} className="text-sm" data-record-test={t.id} data-record-result={t.result} data-record-voided={t.voided ? "1" : "0"} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", margin: "0 0 6px", breakInside: "avoid" }}>
              {/* a voided test leads with it — never a bold «passes» first (8.6 review) */}
              {t.voided && <div style={{ color: "#8f2f2f", fontWeight: 800 }}>{L("АНУЛИРАНО", "VOIDED")} — {t.voided.reason} ({t.voided.by}, {fmtMoment(t.voided.at)})</div>}
              <div><b style={t.voided ? { textDecoration: "line-through" } : undefined}>{t.result === "pass" ? L("ПРЕМИНАВА", "PASSES") : L("НЕ ПРЕМИНАВА", "FAILS")}</b> · {L("дата", "date")} {day(t.testedOn)} · {L(KIND_TEXT[t.kind].bg, KIND_TEXT[t.kind].en)} · {t.schemeNumber}{t.replayOf ? L(` (повторение на ${t.replayOf})`, ` (replay of ${t.replayOf})`) : L(" (пробно изпълнение)", " (dry run)")} · {L("критерии редакция №", "criteria edition")} {t.criteriaEdition}{t.criteriaRecordedAfter ? L(" — записана в портала след деня", " — recorded in the portal after the day") : ""}</div>
              <div>{L("Обхват", "Scope")}: {t.scope || L("— (не е посочен)", "— (not given)")}</div>
              <div>{t.items.map((i) => `${i.result === "match" ? "✓" : i.result === "na" ? "–" : "✗"} ${L(ITEM_TEXT[i.key]?.bg ?? i.key, ITEM_TEXT[i.key]?.en ?? i.key)}${i.note ? ` (${i.note})` : ""}`).join(" · ")}</div>
              <div style={{ color: "var(--muted)" }}>{L("порталът", "the portal")}: {t.auto.unexpected === null ? "—" : L(`${t.auto.unexpected} неочаквани разлики`, `${t.auto.unexpected} unexpected differences`)}{t.auto.analysisVersion ? ` · PTS_Analysis ${t.auto.analysisVersion}` : ""}{t.auto.reportSha ? ` · ${L("доклад", "report")} ${t.auto.reportSha.slice(0, 12)}…` : ""}{t.auto.numberRead !== undefined ? ` · ${t.auto.numberRead ? L("номерът прочетен", "the number read") : L("номерът НЕ е прочетен", "the number NOT read")}` : ""}{t.auto.scenarios ? ` · ${L("сценарии със запис", "scenarios on record")}: ${Object.values(t.auto.scenarios.happened).filter(Boolean).length}/7` : ""}</div>
              <div>{L("Заключение", "Conclusion")}: {t.conclusion}</div>
              <div style={{ color: "var(--muted)" }}>{L("Записано от", "Recorded by")}: {t.recordedBy} · {fmtMoment(t.recordedAt)} · {t.file ? `${L("доказателство", "evidence")} SHA-256 ${t.file.sha256.slice(0, 12)}…` : L("без приложено доказателство", "no evidence attached")}</div>
              <div>{L("Проверил (име и подпис)", "Checked by (name and signature)")}: ______________________</div>
            </div>
          ))}
        </div>
      ))}

      <h2 className="font-bold mt-4" style={{ fontSize: 16 }}>{L("4. Изчислението D1 — грешката при калибриране", "4. The D1 computation — the calibration error")}</h2>
      <p className="text-sm" style={{ maxWidth: 820 }}>{L("Единственото, което порталът изчислява: грешката = измерена − референтна стойност (D1; Ф 7.2.1-7 ред. 1). Представителен набор — знаци, нула, различен брой знаци след запетаята, запетая или точка, степен, големи и малки стойности. До резултата на портала е изчисление по друг метод; проверяващият го повтаря и с независим инструмент (CSV по-горе) и подписва.", "The one thing the portal computes: the error = measured − reference value (D1; Ф 7.2.1-7 rev. 1). A representative set — signs, zero, different decimals, a comma or a point, an exponent, large and small values. Beside the portal's result, a computation by another method; the checker repeats it with an independent tool too (the CSV above) and signs.")}</p>
      <p className="text-sm" style={{ maxWidth: 820 }}>{L("Как се чете стойност (както формулярът): една запетая или една точка е десетичният знак; интервалите се пренебрегват; няма разделител на хилядите; «1e2» е 100. Стойности, които формулярът отказва, трябва да откаже и другият метод.", "How a value reads (as the form): one comma or one point is the decimal mark; spaces are ignored; no thousands separator; «1e2» is 100. Values the form refuses, the other method must refuse too.")}</p>
      <p className="text-sm" style={{ fontWeight: 700, color: d1.allAgree ? "var(--green-dark)" : "#8f2f2f" }} data-d1-all={d1.allAgree ? "1" : "0"}>{d1.allAgree ? L(`Самопроверка на портала (два метода): всички ${d1.rows.length} реда съвпадат. Това НЕ е проверката с независим инструмент — тя е по-долу.`, `The portal's self-check (two methods): all ${d1.rows.length} rows agree. This is NOT the check with an independent tool — that one is below.`) : L("Самопроверка на портала: РАЗЛИКА — вижте редовете.", "The portal's self-check: a DIFFERENCE — see the rows.")}</p>
      <div style={{ overflowX: "auto" }}><table className="text-sm" style={{ borderCollapse: "collapse" }} data-d1-rows={d1.rows.length}>
        <thead><tr><th style={cell}>{L("Референтна (както е въведена)", "Reference (as typed)")}</th><th style={cell}>{L("Измерена (както е въведена)", "Measured (as typed)")}</th><th style={cell}>{L("Референтна (числото)", "Reference (the number)")}</th><th style={cell}>{L("Измерена (числото)", "Measured (the number)")}</th><th style={cell}>{L("Порталът", "The portal")}</th><th style={cell}>{L("Самопроверка", "Self-check")}</th><th style={cell}></th><th style={cell}>{L("Проверяващият", "The checker")}</th></tr></thead>
        <tbody>{d1.rows.map((r, i) => <tr key={i} data-d1-agree={r.agree ? "1" : "0"}><td style={cell}>{r.ref}</td><td style={cell}>{r.meas}</td><td style={{ ...cell, fontFamily: "monospace" }}>{r.refPlain ?? "—"}</td><td style={{ ...cell, fontFamily: "monospace" }}>{r.measPlain ?? "—"}</td><td style={{ ...cell, fontFamily: "monospace" }}>{r.portal ?? L("отказва", "refuses")}</td><td style={{ ...cell, fontFamily: "monospace" }}>{r.independent ?? L("отказва", "refuses")}</td><td style={cell}>{r.agree ? "✓" : "✗"}</td><td style={{ ...cell, minWidth: 90 }}></td></tr>)}</tbody>
      </table></div>
      <p className="text-sm" style={{ maxWidth: 820 }}>{L("Проверка с независим инструмент (П 7.4.1 т. 4.6.2): отворете CSV чрез «Данни → От текст/CSV», разделител запетая, всички колони като текст; изчислете measured_plain − reference_plain и сравнете с portal_error; запишете резултата в последната колона.", "The check with an independent tool (П 7.4.1 т. 4.6.2): open the CSV through «Data → From Text/CSV», comma delimiter, every column as text; compute measured_plain − reference_plain and compare with portal_error; write the result in the last column.")}</p>
      <div className="text-sm" style={{ display: "grid", gap: 14, margin: "8px 0" }} data-d1-checker>
        <div>{L("Инструмент и версия", "Tool and version")}: ______________________ · {L("съвпадат", "agree")}: ____ {L("от", "of")} {d1.rows.length} · {L("Дата", "Date")}: __________</div>
        <div>{L("Заключение за D1", "Conclusion on D1")}: ____________________________________________ · {L("Проверяващ (подпис)", "Checker (signature)")}: ______________</div>
      </div>

      <h2 className="font-bold mt-4" style={{ fontSize: 16 }}>{L("5. Заключение и подписи", "5. Conclusion and signatures")}</h2>
      <div className="text-sm" style={{ display: "grid", gap: 18, marginTop: 8 }}>
        <div>{L("Заключение", "Conclusion")}: ____________________________________________________________</div>
        <div>{L("Проверяващ (независимият инструмент за D1)", "Checker (the independent tool for D1)")}: ______________________ {L("Дата", "Date")}: __________</div>
        <div>{L("Ръководител на РТ провайдъра", "Head of the PT provider")}: ______________________ {L("Дата", "Date")}: __________</div>
      </div>
    </div>
  );
}
