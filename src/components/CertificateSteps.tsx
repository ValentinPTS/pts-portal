import { recordCertContentAction, checkCertContentAction, releaseCertificateAction } from "@/lib/actions";
import { CERT_STATE_TEXT, CERT_PROBLEM_TEXT, CONTENT_MAX, CONTENT_FIELDS, type CertRecord, type CertState, type ScopeItem, type ContentText, type CertLang } from "@/lib/cert-model";
import { rLabel } from "@/lib/report-issue-model";
import { fmtMoment } from "@/lib/scheme-dates";

// «Сертификати — стъпки» (plan part 7.7; D2's conditions; D7). On the certificate's page, one row per
// participation on the final list, by its code: the number (0.15 — said recorded, never shown beside
// the code unless who reads may see names: a number with a code is a register lookup, Реш. 115); the
// content typed from the issued report; the check by a second person; the release — the issue date and
// the language(s). What comes next is said; a step is offered only to who may take it.

export interface CertRow { code: string; state: CertState; cert: CertRecord | null; correctedSince: boolean; numberShown: boolean; offered: ScopeItem[]; offeredFrom: "version" | "selections" }

export default function CertificateSteps({ schemeId, lang, rows, rInForce, canType, canCheck, canRelease, me, answer, today }: {
  schemeId: string; lang: "bg" | "en"; rows: readonly CertRow[]; rInForce: number | null;
  canType: boolean; canCheck: boolean; canRelease: boolean; me: string; answer?: string; today: string;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const input = { border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 13, width: "100%" } as const;
  const okAnswers: Record<string, [string, string]> = { typed: ["Съдържанието е записано — чака проверка от втори човек.", "The content is recorded — it awaits a second person's check."], checked: ["Проверено.", "Checked."], "released-ok": ["Сертификатът е издаден — лабораторията е уведомена.", "The certificate is released — the laboratory is told."] };
  const said = answer ? (okAnswers[answer] ? null : (CERT_PROBLEM_TEXT as Record<string, { bg: string; en: string }>)[answer]) : null;
  const tone = (st: CertState) => (st === "released" ? "var(--green-dark)" : st === "ready" ? "#2e6b3a" : st === "nr" || st === "stale" ? "#8f2f2f" : "#7a5416");
  const FIELD: Record<keyof ContentText, [string, string]> = { conclusion: ["Заключение", "Conclusion"], results: ["Резултати (z, ζ или Eₙ — както в доклада)", "Results (z, ζ or Eₙ — as in the report)"], period: ["Период", "Period"], methods: ["Методи", "Methods"] };
  const langsOf = (c: CertRecord["content"]) => (c ? (["bg", "en"] as const).filter((l) => !!c.text[l]) : []) as CertLang[];
  // the content as typed, read-only — what the checker checks and the releaser releases (review)
  const shown = (c: NonNullable<CertRecord["content"]>) => (
    <div className="text-sm" data-cert-content-shown style={{ display: "grid", gap: 4, margin: "4px 0 0" }}>
      {langsOf(c).map((l) => <div key={l} data-cert-content-lang={l} style={{ borderLeft: "3px solid var(--line)", paddingLeft: 8 }}><b>{l.toUpperCase()}</b>{CONTENT_FIELDS.map((f) => <div key={f}><span style={{ color: "var(--muted)" }}>{L(FIELD[f][0], FIELD[f][1])}:</span> {c.text[l]![f]}</div>)}</div>)}
    </div>
  );
  return (
    <section className="card p-4 mt-4" id="certificate-steps" data-certificate-steps={rows.length}>
      <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15, margin: 0 }}>{L("Сертификати — стъпки", "Certificates — the steps")}</h2>
      <p className="text-sm" style={{ color: "var(--muted)", margin: "2px 0 8px" }}>{L(`Номерът от регистъра → съдържанието, въведено от издадения доклад${rInForce ? ` (${rLabel(rInForce)})` : ""} → проверка от втори човек → издаване от човек. Лабораторията получава сертификата едва при издаването, след като докладът е стигнал до нея (D7). N/R — без сертификат.`, `The number from the register → the content, typed from the issued report${rInForce ? ` (${rLabel(rInForce)})` : ""} → a second person's check → the release by a person. The laboratory gets the certificate only at the release, once the report has reached it (D7). N/R — no certificate.`)}</p>
      {answer && <p role={okAnswers[answer] ? "status" : "alert"} className="text-sm" data-cert-answer={answer} style={{ color: okAnswers[answer] ? "var(--green-dark)" : "#8f2f2f", margin: "0 0 6px" }}>{okAnswers[answer] ? L(okAnswers[answer][0], okAnswers[answer][1]) : said ? L(said.bg, said.en) : L("Не е записано.", "Not recorded.")}</p>}
      {rows.length === 0 ? <p className="text-sm" style={{ color: "var(--muted)" }}>{L("Няма участия в окончателния списък.", "No participations on the final list.")}</p> : (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((r) => {
            const c = r.cert, content = c?.content;
            const mayType = canType && ["no-content", "stale", "unchecked", "awaiting-payment", "ready"].includes(r.state);
            const typedBy = content ? (content.byKey ?? content.by.toLowerCase()) : "";
            const mayCheck = canCheck && r.state === "unchecked" && !!content && typedBy !== me;
            const picked = new Set((content && content.fromR === rInForce ? content.scope : r.offered).map((x) => x.key));
            return (
              <div key={r.code} id={`cert-${r.code}`} data-cert-row={r.code} data-cert-state={r.state} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px" }}>
                <div className="text-sm" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
                  <b style={{ fontFamily: "monospace" }}>{r.code}</b>
                  <span style={{ color: tone(r.state), fontWeight: 700 }}>{L(CERT_STATE_TEXT[r.state].bg, CERT_STATE_TEXT[r.state].en)}</span>
                  <span style={{ color: "var(--muted)" }} data-cert-number={c && (c.registeredAt || c.simulation) ? "1" : "0"}>{L("номер", "number")}: {c && (c.registeredAt || c.simulation) ? (r.numberShown ? c.no : L("записан", "recorded")) : "—"}</span>
                  {content && <span style={{ color: "var(--muted)" }}>{L("съдържание", "content")}: {rLabel(content.fromR)} · {content.by} · {fmtMoment(content.at)}</span>}
                  {c?.checked && <span style={{ color: "var(--muted)" }} data-cert-checked>{L("проверено", "checked")}: {c.checked.by}</span>}
                  {c?.released && <span style={{ color: "var(--green-dark)" }} data-cert-released={c.released.langs.join(",")}>{L("издаден", "released")} {c.date} · {c.released.langs.join(" + ").toUpperCase()} · {c.released.by}</span>}
                </div>
                {r.correctedSince && <p className="text-sm" data-cert-corrected-since style={{ color: "#8f2f2f", margin: "4px 0 0" }}>{L(`Издаден от ${rLabel(content!.fromR)} — в сила е ${rInForce ? rLabel(rInForce) : ""}: проверете дали сертификатът се променя (поправка на издаден сертификат — по-късна стъпка).`, `Released from ${rLabel(content!.fromR)} — ${rInForce ? rLabel(rInForce) : ""} is in force: check whether the certificate changes (correcting a released certificate is a later step).`)}</p>}
                {content && <div className="text-sm" style={{ margin: "4px 0 0" }} data-cert-scope>{L("Обхват (потвърден)", "Scope (confirmed)")}: {content.scope.map((x) => (lang === "bg" ? x.bg : x.en)).join(" · ") || "—"}</div>}
                {content && (r.state === "unchecked" || r.state === "ready" || r.state === "awaiting-payment") && shown(content)}
                {mayCheck && (
                  <form action={checkCertContentAction} data-cert-check-form style={{ marginTop: 6 }}>
                    <input type="hidden" name="schemeId" value={schemeId} />
                    <input type="hidden" name="code" value={r.code} />
                    <input type="hidden" name="typedAt" value={content!.at} />
                    <button type="submit" className="btn btn-sm" data-cert-check-submit>{L("Проверих съдържанието и обхвата срещу доклада", "I checked the content and the scope against the report")}</button>
                  </form>
                )}
                {canCheck && r.state === "unchecked" && content && typedBy === me && <p className="text-sm" data-cert-check-other style={{ color: "#7a5416", margin: "6px 0 0" }}>{L("Проверява втори човек — не този, който е въвел съдържанието.", "A second person checks — not the one who typed the content.")}</p>}
                {canRelease && r.state === "ready" && (
                  <form action={releaseCertificateAction} data-cert-release-form style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end", marginTop: 6 }}>
                    <input type="hidden" name="schemeId" value={schemeId} />
                    <input type="hidden" name="code" value={r.code} />
                    <input type="hidden" name="typedAt" value={content!.at} />
                    <label className="text-sm" style={{ display: "grid", gap: 3 }}>{L("Дата на издаване", "Issue date")}<input name="date" defaultValue={c?.date || today} placeholder="дд.мм.гггг" style={{ ...input, width: 130 }} /></label>
                    {langsOf(content).map((l) => <label key={l} className="text-sm" style={{ display: "flex", gap: 4 }}><input type="checkbox" name="lang" value={l} defaultChecked={l === "bg"} />{l.toUpperCase()}</label>)}
                    <button type="submit" className="btn btn-sm btn-primary" data-cert-release-submit>{L("Издай сертификата", "Release the certificate")}</button>
                  </form>
                )}
                {mayType && (
                  <details style={{ marginTop: 6 }} open={r.state === "no-content" || r.state === "stale"} data-cert-type>
                    <summary className="text-sm">{content ? L("Поправи съдържанието (проверката се изчиства)", "Correct the content (the check is cleared)") : L("Въведи съдържанието от доклада", "Type the content from the report")}</summary>
                    <form action={recordCertContentAction} data-cert-content-form style={{ display: "grid", gap: 6, marginTop: 6, maxWidth: 760 }}>
                      <input type="hidden" name="schemeId" value={schemeId} />
                      <input type="hidden" name="code" value={r.code} />
                      <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px" }}>
                        <legend className="text-sm">{L("Обхват — за кои има резултат в доклада", "Scope — what the report has a result for")}{r.offeredFrom === "selections" ? L(" (предложено по заявеното — резултатите са извън формата)", " (offered as applied for — the results came outside the form)") : ""}</legend>
                        {r.offered.map((x) => <label key={x.key} className="text-sm" style={{ display: "flex", gap: 6 }}><input type="checkbox" name="scope" value={x.key} defaultChecked={picked.has(x.key)} />{lang === "bg" ? x.bg : x.en}</label>)}
                      </fieldset>
                      {(["bg", "en"] as const).map((l) => (
                        <fieldset key={l} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px", display: "grid", gap: 6 }}>
                          <legend className="text-sm">{l === "bg" ? L("На български (задължително)", "In Bulgarian (required)") : L("На английски (или четирите полета, или нито едно)", "In English (all four fields, or none)")}</legend>
                          {CONTENT_FIELDS.map((f) => <label key={f} className="text-sm" style={{ display: "grid", gap: 3 }}>{L(FIELD[f][0], FIELD[f][1])}<input name={`${l}_${f}`} required={l === "bg"} maxLength={CONTENT_MAX} defaultValue={content?.text[l]?.[f] ?? ""} style={input} /></label>)}
                        </fieldset>
                      ))}
                      <div><button type="submit" className="btn btn-sm" data-cert-content-submit>{content ? L("Запиши поправката", "Record the correction") : L("Запиши съдържанието", "Record the content")}</button></div>
                    </form>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
