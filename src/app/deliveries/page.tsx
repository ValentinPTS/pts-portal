import Link from "next/link";
import { requireSection, getViewer, schemesFor, mayNow } from "@/lib/access";
import { listSchemes } from "@/lib/store";
import { listParticipants, withIdentities } from "@/lib/participants";
import { actorNow } from "@/lib/identities";
import { inFinalRound } from "@/lib/announcement-model";
import { isProvisional, CODING_PROBLEM_TEXT } from "@/lib/coding-model";
import { isStarted } from "@/lib/visibility";
import { resultsDeadline } from "@/lib/deadlines-model";
import { holidaySet } from "@/lib/holidays";
import { schemeNowMs, sofiaToday } from "@/lib/clock";
import { fmtSchemeDate } from "@/lib/scheme-dates";
import {
  deliveryOf, deliveryState, openProblems, latestReceipt, replacementProblem, replacementCalledFor, receivedOtherwise, otherReceipts, minDaysOf, DELIVERY_STATE_LABEL, SHIPMENT_PROBLEM_TEXT, DEFAULT_MIN_DAYS,
} from "@/lib/delivery-model";
import { listCaseEventsForScheme } from "@/lib/case-events";
import { dispatchAction, resolveDeliveryProblemAction, setDeliveryMinDaysAction } from "@/lib/actions";
import { getServerT } from "@/lib/i18n-server";
import { logActivity } from "@/lib/activity";

// «Доставки» (plan part 5.6; D18): the objects of the testing schemes this person may send
// (capability «dispatch» — the scheme manager, the coding expert), participation by
// participation, by its code: the dispatch with its waybill and the shipment documents from
// the scheme's list (3.8), the hand-over to the participant's own courier on Ф 7.3.4-1
// (Реш. 154), the participant's receipt protocol (fit — every listed check passed, Реш. 79),
// the problems it signalled, and a replacement object — only with the minimum working days
// left to its results deadline (Реш. 127). The addresses only to who sees names in the
// scheme, as one opening for dispatch, on record (2.3). A calibration device travels by the
// chain — on the scheme's own page (5.7).
export const dynamic = "force-dynamic";

const ERR: Record<string, { bg: string; en: string }> = {
  ...SHIPMENT_PROBLEM_TEXT,
  kind: { bg: "Неизвестен вид пратка.", en: "Unknown kind of shipment." },
  scheme: { bg: "Схемата не е за изпитване — уредът при калибриране се движи по веригата.", en: "Not a testing scheme — a calibration device travels by the chain." },
  state: { bg: "Обектите се изпращат, докато схемата е «В процес».", en: "Objects are sent while the scheme is «In progress»." },
  participation: { bg: "Участието не е в окончателния списък или не продължава.", en: "The participation is not on the final list, or goes no further." },
  uncoded: CODING_PROBLEM_TEXT.uncoded,
  twice: { bg: "Обектът вече е изпратен — втори се изпраща като заместващ.", en: "The object was sent already — a second goes as a replacement." },
  nothing: { bg: "Още нищо не е изпратено — първо изпращането.", en: "Nothing was sent yet — the dispatch first." },
  fit: { bg: "Заместващ обект — само след негоден протокол или сигнал за проблем.", en: "A replacement — only after an unfit protocol or a problem signalled." },
  calibration: { bg: "При калибриране обектът е един и обикаля — заместване няма.", en: "In calibration one object travels — there is no replacement." },
  "no-deadline": { bg: "Участието няма срок за резултати — не може да се провери минималният брой дни.", en: "The participation has no results deadline — the minimum days cannot be checked." },
  "too-late": { bg: "До срока за резултати остават по-малко от минималните работни дни (Реш. 127) — заместващ обект не се изпраща.", en: "Fewer than the minimum working days remain to the results deadline (Реш. 127) — no replacement is sent." },
  reach: { bg: "Не стигнах до хранилището на самоличността — нищо не е записано. Опитайте пак.", en: "Could not reach the identity store — nothing was recorded. Try again." },
  note: { bg: "Напишете бележка (поне 3 знака).", en: "Write a note (3 characters at least)." },
  problem: { bg: "Сигналът вече е решен или го няма.", en: "The problem is resolved already, or not there." },
  days: { bg: "Минималният брой работни дни е цяло число от 1 до 60.", en: "The minimum working days is a whole number from 1 to 60." },
  moved: { bg: "Междувременно нещо се промени (друга пратка или протокол) — нищо не е записано. Вижте реда отново.", en: "Something changed meanwhile (another shipment or protocol) — nothing was recorded. Look at the row again." },
};
const OK: Record<string, { bg: string; en: string }> = {
  dispatch: { bg: "Записано: обектът е изпратен; участието е уведомено.", en: "Recorded: the object is sent; the participation is told." },
  replacement: { bg: "Записано: заместващ обект е изпратен; участието е уведомено.", en: "Recorded: a replacement object is sent; the participation is told." },
  handover: { bg: "Записано: обектът е предаден на куриера на участника; участието е уведомено.", en: "Recorded: the object is handed to the participant's courier; the participation is told." },
  resolved: { bg: "Сигналът е отбелязан като решен.", en: "The problem is marked resolved." },
  days: { bg: "Минималният брой работни дни е записан.", en: "The minimum working days are saved." },
};

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<{ scheme?: string; p?: string; ok?: string; err?: string; left?: string }> }) {
  await requireSection("deliveries");
  const sp = await searchParams;
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const T = (x: { bg: string; en: string }) => (lang === "bg" ? x.bg : x.en);
  const scope = schemesFor(await getViewer(), "dispatch");
  const schemes = (await listSchemes()).filter((s) => isStarted(s) && (scope === "all" || scope.includes(s.id)));
  const chosen = schemes.find((s) => s.id === sp.scheme) ?? schemes.find((s) => s.status === "running" && s.type !== "C") ?? schemes[0];
  const name = (s: (typeof schemes)[number]) => s.name?.trim() || (lang === "bg" ? s.titleBg : s.titleEn) || "";
  const input = "border rounded px-2 py-1 text-sm";
  const inputStyle = { borderColor: "var(--line)", fontFamily: "inherit" } as const;

  let body: React.ReactNode = null;
  if (chosen && chosen.type !== "C") {
    const s = chosen;
    const today = sofiaToday(schemeNowMs(s));
    const off = await holidaySet();
    const minDays = minDaysOf(s);
    const canEdit = await mayNow("scheme.edit", s.id);
    const coded = (await listParticipants(s.id)).filter((p) => inFinalRound(s, p));
    // the addresses: only to who sees names here — one opening for dispatch, on record (2.3)
    const names = await mayNow("names.view", s.id);
    const who = names && coded.length ? new Map((await withIdentities(coded, s.id, { actor: await actorNow(), purpose: "dispatch" }).catch(() => [])).map((p) => [p.id, p] as const)) : new Map();
    // the page journals what it showed (names.viewed, 1.9)
    if (who.size) await logActivity("names.viewed", { schemeId: s.id, subject: "page:deliveries", summary: "Laboratory names and delivery addresses shown with their codes — deliveries" });
    // what else says an object arrived — a signed scan, PTS's own step (5.6 review)
    const events = await listCaseEventsForScheme(s.id).catch(() => []);
    const docs = s.lists?.shipmentDocs ?? [];
    const checks = s.lists?.receiptChecks ?? [];
    body = (
      <section className="card p-4 mt-4" data-deliveries-scheme={s.id}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-bold" style={{ color: "var(--green-dark)" }}>{s.number}</span>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>{name(s)}</span>
          <span style={{ flex: 1 }} />
          <Link href={`/schemes/${s.id}/participants`} className="btn btn-sm">{L("Участници", "Participants")}</Link>
        </div>
        {s.status !== "running" && <p className="text-sm mt-2" style={{ color: "#8a5a00" }}>{T(ERR.state)}</p>}
        <div className="flex items-center gap-3 flex-wrap mt-2 text-sm" style={{ color: "var(--muted)" }}>
          <span>{L("Документи за пратката", "Shipment documents")}: {docs.length ? docs.map((d) => T(d)).join(" · ") : L("няма в списъка на схемата", "none on the scheme's list")}</span>
          <span>· {L("Проверки при получаване", "Receipt checks")}: {checks.length}</span>
          <span data-min-days={minDays}>· {L(`Заместващ обект: поне ${minDays} работни дни до срока`, `Replacement: at least ${minDays} working days to the deadline`)}{minDays === DEFAULT_MIN_DAYS ? L(" (по подразбиране)", " (default)") : ""}</span>
          {canEdit && (
            <form action={setDeliveryMinDaysAction} className="flex items-center gap-1" data-min-days-form>
              <input type="hidden" name="schemeId" value={s.id} />
              <input name="days" type="number" min={1} max={60} defaultValue={minDays} className={input} style={{ ...inputStyle, width: 64 }} aria-label={L("Минимален брой работни дни", "Minimum working days")} />
              <button type="submit" className="btn btn-sm">{L("Запази", "Save")}</button>
            </form>
          )}
        </div>
        {coded.length === 0 ? (
          <p className="text-sm mt-3" style={{ color: "var(--muted)" }}>{L("Няма участия в окончателния списък.", "No participations on the final list.")}</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {coded.map((p) => {
              const d = deliveryOf(s, p.id);
              const otherwise = receivedOtherwise(d, otherReceipts(s, p.code, events.filter((e) => e.code === p.code)));
              const st = deliveryState(d, otherwise);
              const id = who.get(p.id);
              const last = d.shipments[d.shipments.length - 1];
              const rec = latestReceipt(d);
              const problems = openProblems(d);
              const rd = resultsDeadline(s, p.code).at;
              // a replacement: after an unfit protocol of the latest shipment, or a problem signalled since it
              const replace = replacementCalledFor(d) ? replacementProblem(s.type, rd, today, minDays, off) : undefined;
              const open = sp.p === p.id;
              return (
                <div key={p.id} id={`p-${p.id}`} data-delivery-row={p.id} data-delivery-state={st} data-delivery-problems={problems.length} className="border rounded p-3" style={{ borderColor: problems.length || st === "unfit" ? "#ecc4c4" : "var(--line)" }}>
                  <div className="flex items-center gap-3 flex-wrap text-sm">
                    <span className="font-mono font-bold">{isProvisional(p.code) ? <span style={{ color: "var(--muted)" }}>{p.code} · {L("без код", "no code")}</span> : p.code}</span>
                    {p.sampleCode && <span>{L("обект", "object")} {p.sampleCode}</span>}
                    <span style={{ color: "var(--muted)" }}>{L("куриер", "carrier")}: {p.courier || "—"}</span>
                    <span data-state-chip style={{ fontWeight: 700, color: st === "unfit" ? "#8f2f2f" : st === "fit" || st === "received" ? "var(--green-dark)" : st === "sent" ? "#7a5416" : "var(--muted)" }}>● {T(DELIVERY_STATE_LABEL[st])}</span>
                    {problems.length > 0 && <span style={{ fontWeight: 700, color: "#8f2f2f" }}>{L(`сигнали: ${problems.length}`, `problems: ${problems.length}`)}</span>}
                  </div>
                  {id && (id.labName || id.deliveryAddress) && (
                    <div className="text-sm mt-1" data-dispatch-address>{id.labName}{id.deliveryAddress ? ` · ${id.deliveryAddress}` : ""}{id.country ? ` · ${id.country}` : ""}{id.contact ? ` · ${id.contact}` : ""}{id.phone ? ` · ${id.phone}` : ""}</div>
                  )}
                  {last && (
                    <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                      {d.shipments.map((x) => (
                        <div key={x.id} data-shipment={x.kind}>
                          {x.kind === "handover" ? L("Предаден на куриера на участника", "Handed to the participant's courier") : x.kind === "replacement" ? L("Заместващ обект", "Replacement object") : L("Изпратен", "Sent")} {fmtSchemeDate(x.day)}
                          {x.handover ? ` ${x.handover.time} · ${x.handover.carrier} · ${L("получил", "taken by")} ${x.handover.receiver}` : ""}
                          {x.carrier && !x.handover ? ` · ${x.carrier}` : ""}{x.waybill ? ` · ${L("товарителница", "waybill")} ${x.waybill}` : ""}
                          {x.docs.length ? ` · ${docs.filter((i) => x.docs.includes(i.id)).map((i) => T(i)).join(", ")}` : ""}
                          {x.reason ? ` · ${x.reason}` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* every protocol, each under its shipment's day — the first unfit one stays in sight after a replacement */}
                  {d.receipts.map((r) => (
                    <div key={r.id} className="text-xs mt-1" data-receipt={r.suitable ? "fit" : "unfit"} data-receipt-latest={r.id === rec?.id ? "1" : undefined} style={{ color: r.suitable ? "var(--green-dark)" : "#8f2f2f" }}>
                      {L("Протокол за получаване", "Receipt protocol")} {fmtSchemeDate(r.day)} {r.time} · {r.suitable ? L("годен", "fit") : L("НЕГОДЕН", "NOT fit")}
                      {!r.undamaged ? ` · ${L("нарушена опаковка", "packaging damaged")}` : ""}
                      {checks.filter((c) => r.checks[c.id] === false).map((c) => ` · ✗ ${T(c)}`).join("")}
                      {r.remarks ? ` · «${r.remarks}»` : ""}
                    </div>
                  ))}
                  {d.problems.map((pr) => (
                    <div key={pr.id} className="text-xs mt-1" data-problem={pr.id} data-problem-open={pr.resolved ? "0" : "1"} style={{ color: pr.resolved ? "var(--muted)" : "#8f2f2f" }}>
                      {L("Сигнал", "Problem")} {fmtSchemeDate(pr.at.slice(0, 10))}: «{pr.text}»{pr.resolved ? ` — ${L("решен", "resolved")}: ${pr.resolved.note}` : ""}
                      {!pr.resolved && (
                        <form action={resolveDeliveryProblemAction} className="flex items-center gap-1 mt-1">
                          <input type="hidden" name="schemeId" value={s.id} />
                          <input type="hidden" name="participantId" value={p.id} />
                          <input type="hidden" name="problemId" value={pr.id} />
                          <input name="note" required minLength={3} maxLength={300} placeholder={L("Какво е направено — вижда го и участникът", "What was done — the participant sees it")} aria-label={L("Бележка за решението — вижда я и участникът", "The resolution's note — the participant sees it")} className={input} style={{ ...inputStyle, minWidth: 280 }} />
                          <button type="submit" className="btn btn-sm">{L("Решен", "Resolved")}</button>
                        </form>
                      )}
                    </div>
                  ))}
                  {s.status === "running" && !isProvisional(p.code) && (st === "to-send" || replace !== undefined) && (
                    <details className="mt-2" open={open} data-dispatch-forms>
                      <summary className="text-sm" style={{ cursor: "pointer", color: "var(--green-dark)" }}>{st === "to-send" ? L("Изпрати обекта", "Send the object") : L("Заместващ обект", "Replacement object")}</summary>
                      {st === "to-send" ? (
                        <div className="grid gap-2 mt-2">
                          <form action={dispatchAction} className="flex items-end gap-2 flex-wrap" data-dispatch-form="dispatch">
                            <input type="hidden" name="schemeId" value={s.id} />
                            <input type="hidden" name="participantId" value={p.id} />
                            <input type="hidden" name="kind" value="dispatch" />
                            <label className="grid text-xs" style={{ color: "var(--muted)" }}>{L("Изпратен на", "Sent on")}<input type="date" name="day" defaultValue={today} max={today} className={input} style={inputStyle} required /></label>
                            <label className="grid text-xs" style={{ color: "var(--muted)" }}>{L("Товарителница", "Waybill")}<input name="waybill" maxLength={60} className={input} style={inputStyle} required /></label>
                            <label className="grid text-xs" style={{ color: "var(--muted)" }}>{L("Куриер", "Carrier")}<input name="carrier" maxLength={60} defaultValue={p.courier ?? ""} className={input} style={inputStyle} /></label>
                            {docs.length > 0 && (
                              <fieldset className="text-xs" style={{ border: "none", padding: 0, margin: 0 }}>
                                <legend style={{ color: "var(--muted)" }}>{L("С пратката", "With the shipment")}</legend>
                                {docs.map((i) => <label key={i.id} className="mr-3"><input type="checkbox" name="doc" value={i.id} defaultChecked /> {T(i)}</label>)}
                              </fieldset>
                            )}
                            <button type="submit" className="btn btn-primary btn-sm">{L("Запиши изпращането", "Record the dispatch")}</button>
                          </form>
                          <form action={dispatchAction} className="flex items-end gap-2 flex-wrap" data-dispatch-form="handover" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
                            <input type="hidden" name="schemeId" value={s.id} />
                            <input type="hidden" name="participantId" value={p.id} />
                            <input type="hidden" name="kind" value="handover" />
                            <span className="text-xs" style={{ color: "var(--muted)", maxWidth: 260 }}>{L("Предаване на куриера на участника (Ф 7.3.4-1; рискът при превоза е на участника — Реш. 154):", "Hand-over to the participant's own courier (Ф 7.3.4-1; the risk in transit is the participant's — Реш. 154):")}</span>
                            <label className="grid text-xs" style={{ color: "var(--muted)" }}>{L("Ден", "Day")}<input type="date" name="day" defaultValue={today} max={today} className={input} style={inputStyle} required /></label>
                            <label className="grid text-xs" style={{ color: "var(--muted)" }}>{L("Час", "Time")}<input type="time" name="time" className={input} style={inputStyle} required /></label>
                            <label className="grid text-xs" style={{ color: "var(--muted)" }}>{L("Куриер", "Carrier")}<input name="carrier" maxLength={60} className={input} style={inputStyle} required /></label>
                            <label className="grid text-xs" style={{ color: "var(--muted)" }}>{L("Получил (име)", "Taken by (name)")}<input name="receiver" maxLength={120} className={input} style={inputStyle} required /></label>
                            <button type="submit" className="btn btn-sm">{L("Запиши предаването", "Record the hand-over")}</button>
                          </form>
                        </div>
                      ) : replace ? (
                        <p className="text-sm mt-2" data-replacement-refused={replace.problem} style={{ color: "#8f2f2f" }}>{T(ERR[replace.problem])}{replace.left !== undefined ? L(` Остават ${replace.left} работни дни, нужни са ${minDays}.`, ` ${replace.left} working days are left, ${minDays} are needed.`) : ""}</p>
                      ) : (
                        <form action={dispatchAction} className="flex items-end gap-2 flex-wrap mt-2" data-dispatch-form="replacement">
                          <input type="hidden" name="schemeId" value={s.id} />
                          <input type="hidden" name="participantId" value={p.id} />
                          <input type="hidden" name="kind" value="replacement" />
                          {/* the latest shipment as this person saw it — re-checked in the lock (review) */}
                          <input type="hidden" name="after" value={last?.id ?? ""} />
                          <label className="grid text-xs" style={{ color: "var(--muted)" }}>{L("Изпратен на", "Sent on")}<input type="date" name="day" defaultValue={today} max={today} className={input} style={inputStyle} required /></label>
                          <label className="grid text-xs" style={{ color: "var(--muted)" }}>{L("Товарителница", "Waybill")}<input name="waybill" maxLength={60} className={input} style={inputStyle} required /></label>
                          <label className="grid text-xs" style={{ color: "var(--muted)" }}>{L("Куриер", "Carrier")}<input name="carrier" maxLength={60} defaultValue={last?.carrier ?? p.courier ?? ""} className={input} style={inputStyle} /></label>
                          <label className="grid text-xs" style={{ color: "var(--muted)" }}>{L("Защо", "Why")}<input name="reason" required minLength={3} maxLength={300} className={input} style={{ ...inputStyle, minWidth: 220 }} /></label>
                          {docs.length > 0 && (
                            <fieldset className="text-xs" style={{ border: "none", padding: 0, margin: 0 }}>
                              <legend style={{ color: "var(--muted)" }}>{L("С пратката", "With the shipment")}</legend>
                              {docs.map((i) => <label key={i.id} className="mr-3"><input type="checkbox" name="doc" value={i.id} defaultChecked /> {T(i)}</label>)}
                            </fieldset>
                          )}
                          <button type="submit" className="btn btn-primary btn-sm">{L("Изпрати заместващ", "Send a replacement")}</button>
                        </form>
                      )}
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  } else if (chosen) {
    body = (
      <section className="card p-4 mt-4 text-sm" data-deliveries-calibration={chosen.id}>
        {L("Схема за калибриране: един уред обикаля участниците — изпращането и получаването са във веригата на схемата.", "A calibration scheme: one device travels between the participants — dispatch and receipt are in the scheme's chain.")}{" "}
        <Link href={`/schemes/${chosen.id}`}>{L("Към схемата", "To the scheme")}</Link>
      </section>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{L("Доставки", "Deliveries")}</h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 820 }}>
        {L("Изпращане на обектите, протоколите за получаване и сигналите на участниците — по код. Изпращат ръководителят на схемата и експертът по кодиране (D18).", "Dispatch of the objects, the participants' receipt protocols and the problems they signal — by code. The scheme manager and the coding expert send them (D18).")}
      </p>
      {sp.err && (
        <div role="alert" data-deliveries-err={sp.err} className="card p-3 mt-3 text-sm" style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          {ERR[sp.err] ? T(ERR[sp.err]) : L("Не стана — нищо не е записано.", "It did not go through — nothing was recorded.")}{sp.left ? L(` Остават ${sp.left} работни дни.`, ` ${sp.left} working days are left.`) : ""}
        </div>
      )}
      {sp.ok && OK[sp.ok] && <div role="status" data-deliveries-ok={sp.ok} className="card p-3 mt-3 text-sm" style={{ background: "var(--green-soft)", border: "1px solid var(--line)" }}>{T(OK[sp.ok])}</div>}
      {schemes.length === 0 ? (
        <div className="card p-4 mt-4" style={{ color: "var(--muted)" }}>{L("Няма започнала схема, в която да изпращате.", "No started scheme you send in.")}</div>
      ) : (
        <nav className="flex gap-2 mt-3" style={{ flexWrap: "wrap" }} aria-label={L("Схеми", "Schemes")} data-deliveries-schemes>
          {schemes.map((s) => (
            <Link key={s.id} href={`/deliveries?scheme=${encodeURIComponent(s.id)}`} aria-current={chosen?.id === s.id ? "true" : undefined} className="btn btn-sm"
              style={chosen?.id === s.id ? { background: "var(--green-dark)", color: "#fff", borderColor: "var(--green-dark)" } : undefined}>
              {s.number}{s.type === "C" ? ` · ${L("калибриране", "calibration")}` : ""}
            </Link>
          ))}
        </nav>
      )}
      {body}
    </div>
  );
}
