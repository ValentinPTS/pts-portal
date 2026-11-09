import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { participantViewer, participationViews } from "@/lib/participation-view";
import { isProvisional } from "@/lib/coding-model";
import { selectionsOf } from "@/lib/application-model";
import { labCertificate } from "@/lib/cert-number";
import { writtenInstructions } from "@/lib/docs/instruction-common";
import { chainViewFor } from "@/lib/chain-view";
import { canLabUploadNow, LAB_UPLOAD_SLOTS, fmtPhaseDate, type LabUploadSlot } from "@/lib/lab-phases";
import { LAB_DOC_SLOTS } from "@/lib/doc-release";
import { DEADLINE_LABEL, STATE_LABEL, PAYMENT_LABEL } from "@/lib/participation-state-model";
import { deadlineZone } from "@/lib/scheme-dates";
import { listForParticipations, withReadState } from "@/lib/notifications";
import { labUploadDocAction } from "@/lib/actions";
import { signOutLabAction } from "@/lib/auth-actions";
import { confirmDate } from "@/lib/profile-confirm-model";
import { getServerT } from "@/lib/i18n-server";
import StageBar from "@/components/StageBar";
import DeviceChainCard from "@/components/DeviceChainCard";
import ParticipantNav from "@/components/ParticipantNav";
import LanguageToggle from "@/components/LanguageToggle";
import { deadlineText, docName, docHref, schemeTitle } from "@/components/ParticipationLists";

export const dynamic = "force-dynamic";

// One participation (plan part 5.5; design §6): the scheme, the laboratory, its code and
// object, its state on the bar with payment beside it (К26, К18), the deadline with its
// hour and zone, the documents released to it with whether they were opened, the proforma
// and payment, the delivery and the receipt, the characteristics applied for, its notices.
// For a laboratory's account and for a user of its legal entity — each only its own.
export default async function ParticipationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const { id } = await params;
  const viewer = await participantViewer();
  if (!viewer) redirect("/lab/login");
  const row = viewer.rows.find((r) => r.participantId === id);
  if (!row) notFound();
  const v = (await participationViews([row], { userId: viewer.userId }))[0];
  if (!v) notFound(); // a scheme that has not started is not shown (Реш. 147)
  const { lang: l } = await getServerT();
  const lang: "bg" | "en" = l === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const T = (x: { bg: string; en: string }) => (lang === "bg" ? x.bg : x.en);
  const { scheme: s, part: p } = v;
  const err = (await searchParams).e;

  const coded = !isProvisional(p.code);
  const reported = s.status === "report" || s.status === "closed";
  const officialReport = reported && !!s.uploads?.report;
  // the certificate is served to a laboratory's account (the document route); a user of the
  // entity gets it with phase 7 — never a row whose link answers «no» (5.5 review)
  const hasCert = viewer.kind === "lab" && !!labCertificate(s.certificates, p.code);
  const invoice = s.labDocs?.[p.code]?.proforma;
  const running = s.status === "open" || s.status === "running";
  const chain = await chainViewFor(s, p.code, lang, viewer.actor);
  const notices = await withReadState(await listForParticipations([{ schemeId: s.id, code: p.code }], 20).catch(() => []), viewer.reader).catch(() => []);
  const back = viewer.kind === "entity" ? `/lab/overview${v.laboratoryId ? `?lab=${v.laboratoryId}` : ""}` : "/lab";
  const self = `/lab/p/${encodeURIComponent(v.participantId)}`;

  // the documents of the participation, in its three levels (Реш. 49): the scheme's, those
  // to it alone or to this user, then what is issued to it — the report, the certificate,
  // the proforma. PTS's own documents (the provider's level) have no place in the portal yet.
  const rows = [
    ...v.docs.map((d) => ({ key: d.key, name: docName(d.key, lang), ed: d.editionNo ? String(d.editionNo) : "—", at: d.at.slice(0, 10), lvl: d.level as string, level: d.level === "all" ? L("на схемата", "the scheme's") : d.level === "user" ? L("до вас лично", "to you personally") : L("на участието", "the participation's"), state: d.opened === null ? "—" : d.opened ? L("отворен", "opened") : L("неотворен", "not opened"), opened: d.opened !== false, href: docHref(v, d.key, lang) })),
    ...(officialReport ? [{ key: "report", lvl: "issued", name: L("Окончателен доклад", "Final report"), ed: "—", at: "", level: L("на схемата", "the scheme's"), state: L("издаден", "issued"), opened: true, href: `/lab/doc/${s.id}/report?lang=${lang}&p=${encodeURIComponent(v.participantId)}` }] : []),
    ...(hasCert ? [{ key: "certificate", lvl: "issued", name: L("Сертификат", "Certificate"), ed: "—", at: "", level: L("на участието", "the participation's"), state: L("издаден", "issued"), opened: true, href: `/lab/doc/${s.id}/certificate?lang=${lang}&p=${encodeURIComponent(v.participantId)}` }] : []),
    ...(invoice ? [{ key: "proforma", lvl: "issued", name: T(LAB_DOC_SLOTS.proforma), ed: "—", at: invoice.uploadedAt.slice(0, 10), level: L("на участието", "the participation's"), state: s.status === "not_held" ? L("схемата не се състои — нищо не се фактурира", "the scheme is not held — nothing is invoiced") : T(PAYMENT_LABEL[v.payment]), opened: true, href: `/lab/labdoc/${s.id}/proforma?p=${encodeURIComponent(v.participantId)}` }] : []),
  ];

  // the characteristics it applied for (5.1), each with its participations when more than one
  const sel = s.parameters.length ? selectionsOf(p, s.parameters.length) : {};
  const chars = Object.entries(sel).filter(([, n]) => n > 0).map(([i, n]) => ({ i: Number(i), n, c: s.parameters[Number(i)] })).filter((x) => !!x.c);

  // an upload slot of a laboratory's account (the receipt protocol, the results sheet) —
  // the same rule the upload action keeps; a user of the entity sends them by e-mail until
  // the online protocol (5.6) and the results form (phase 6)
  const slotOpen = (slot: LabUploadSlot) => viewer.kind === "lab" && !v.finished && canLabUploadNow(p.status) && s.status !== "not_held" && s.status !== "closed" && !(slot === "results" && (s.status === "processing" || s.status === "report"));
  const uploadBox = (slot: LabUploadSlot, when: boolean) => {
    const up = s.labUploads?.[p.code]?.[slot];
    if (!when && !up) return null;
    return (
      <div data-upload-slot={slot} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        {up && viewer.kind === "lab" && <a href={`/lab/upload/${s.id}/${slot}?p=${encodeURIComponent(v.participantId)}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ fontSize: 12 }}>📄 {up.name}</a>}
        {up && <span style={{ fontSize: 12, color: "var(--muted)" }}>{L("качен ", "uploaded ")}{fmtPhaseDate(up.uploadedAt.slice(0, 10))}</span>}
        {when && slotOpen(slot) ? (
          <form action={labUploadDocAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input type="hidden" name="schemeId" value={s.id} />
            <input type="hidden" name="participantId" value={v.participantId} />
            <input type="hidden" name="back" value={self} />
            <input type="hidden" name="slot" value={slot} />
            <input type="file" name="file" required accept="application/pdf,image/png,image/jpeg" style={{ fontSize: 12, maxWidth: 220 }} />
            <button type="submit" className="btn btn-sm" style={{ fontSize: 12 }}>↑ {up ? L("Замени файла", "Replace file") : T(LAB_UPLOAD_SLOTS[slot])}</button>
          </form>
        ) : when && viewer.kind === "entity" && !v.finished ? (
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{slot === "protocol" ? L("Изпратете подписания протокол за получаване (Ф 7.3.4-1) на PTS по e-mail.", "Send the signed receipt protocol (Ф 7.3.4-1) to PTS by e-mail.") : L("Изпратете попълнения Лист за резултати на PTS по e-mail.", "Send the completed Results sheet to PTS by e-mail.")}</span>
        ) : null}
      </div>
    );
  };

  const errText = err === "locked" ? L("Файлът не е приет — участието вече не приема файлове.", "The file was not taken — the participation takes no more files.") : err === "upload" ? L("Качването не бе прието — използвайте PDF/PNG/JPG до 15 MB.", "Upload not accepted — use a PDF/PNG/JPG up to 15 MB.") : "";
  const card = (title: string, body: React.ReactNode, attrs: Record<string, string> = {}) => (
    <section className="card" style={{ padding: 0, overflow: "hidden" }} {...attrs}>
      <h2 style={{ margin: 0, padding: "12px 16px", borderBottom: "1px solid var(--line)", fontSize: 15, fontWeight: 800 }}>{title}</h2>
      <div style={{ padding: "12px 16px" }}>{body}</div>
    </section>
  );
  const kv = (k: string, val: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 120 }}>
      <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{k}</span>
      <span style={{ fontSize: 13.5 }}>{val || "—"}</span>
    </div>
  );
  const dl = v.deadline;
  // the zone at the very instant it passes — right on the days the clocks change (review)
  const zone = dl ? deadlineZone(dl.at) : null;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      {viewer.kind === "entity" && viewer.user ? (
        <ParticipantNav lang={lang} active="overview" name={viewer.user.name} role={viewer.user.role} persona={viewer.user.persona} />
      ) : (
        <header className="flex items-center gap-3 px-6 py-3" style={{ background: "#fff", borderBottom: "1px solid var(--line)", color: "var(--ink)" }}>
          <span className="font-bold text-lg tracking-tight"><span style={{ color: "var(--green-dark)" }}>PTS</span> Bulgaria</span>
          <span className="ml-auto text-sm" style={{ fontWeight: 700 }}>{viewer.lab?.name}</span>
          <LanguageToggle />
          <form action={signOutLabAction}><button type="submit" className="btn btn-sm">{L("Изход", "Sign out")}</button></form>
        </header>
      )}
      <main data-participation-page={v.participantId} data-state={v.state} style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 24px 40px" }}>
        <nav style={{ fontSize: 12.5, color: "var(--muted)" }}><Link href={back}>{L("Моите участия", "My participations")}</Link> · {s.number}</nav>
        <h1 className="section-title" style={{ fontSize: 26, margin: "4px 0 2px" }}>{schemeTitle(s, lang) || s.number}</h1>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>
          {s.type === "C" ? L("Калибриране", "Calibration") : L("Изпитване за пригодност", "Proficiency testing")}{v.labName ? ` · ${v.labName}` : ""}
          {" · "}{coded ? <>{L("код на лабораторията ", "laboratory code ")}<b data-own-code style={{ color: "var(--ink)" }}>{p.code}</b></> : <span data-code-to-come>{L("кодът предстои — тегли се след затваряне на заявяването", "the code is to come — drawn after applications close")}</span>}
          {p.sampleCode ? <>{" · "}{L("РТ обект ", "PT object ")}<b style={{ color: "var(--ink)" }}>{p.sampleCode}</b></> : null}
        </p>
        <div style={{ margin: "14px 0 18px" }}><StageBar lang={lang} type={s.type} state={v.state} payment={v.finished ? undefined : v.payment} /></div>
        {errText && <div role="alert" style={{ background: "#fdecec", border: "1px solid #d9534f", color: "#8a1f1f", borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>{errText}</div>}
        {v.state === "carrier" && (
          <p role="note" data-carrier-pending style={{ background: "#faf2e0", border: "1px solid #ecd9ae", borderRadius: 10, padding: "10px 12px", fontSize: 13, margin: "0 0 14px" }}>
            {L("Доставката извън ЕС и Балканите е за сметка на участника: PTS ви изпраща оферти на доставчици, вие избирате една, и PTS я записва тук. Проформата излиза след избора (Реш. 128).", "Delivery outside the EU and the Balkans is at the participant's cost: PTS sends you carriers' offers, you choose one, and PTS records it here. The proforma follows the choice (Реш. 128).")}
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 340px)", gap: 18, alignItems: "start" }} className="participation-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            {card(L("Документи на участието", "The participation's documents"), rows.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{L("Още няма документи за това участие.", "No documents for this participation yet.")}</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table data-participation-docs style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 480 }}>
                  <thead><tr style={{ textAlign: "left", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>
                    <th style={{ padding: "4px 6px" }}>{L("Документ", "Document")}</th><th style={{ padding: "4px 6px" }}>{L("Ред.", "Ed.")}</th><th style={{ padding: "4px 6px" }}>{L("Публикуван", "Published")}</th><th style={{ padding: "4px 6px" }}>{L("Ниво", "Level")}</th><th style={{ padding: "4px 6px" }}>{L("Състояние", "State")}</th>
                  </tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.key} data-doc-row={r.key} data-doc={r.key} data-doc-level={r.lvl} data-doc-opened={r.opened ? "1" : "0"} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={{ padding: "7px 6px" }}><a href={r.href} target="_blank" rel="noreferrer">{r.name}</a></td>
                      <td style={{ padding: "7px 6px", fontVariantNumeric: "tabular-nums" }}>{r.ed}</td>
                      <td style={{ padding: "7px 6px", fontVariantNumeric: "tabular-nums" }}>{r.at ? fmtPhaseDate(r.at) : "—"}</td>
                      <td style={{ padding: "7px 6px", color: "var(--muted)" }}>{r.level}</td>
                      <td style={{ padding: "7px 6px", color: r.opened ? "var(--muted)" : "#2f4f75", fontWeight: r.opened ? 400 : 700 }}>{r.state}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>{L("Всяко сваляне се записва. «Отворен» — свален от някого от участието.", "Every download is recorded. «Opened» — downloaded by someone of the participation.")}</p>
              </div>
            ))}

            {s.type === "C" && chain ? (
              <DeviceChainCard schemeId={s.id} lang={lang} state={chain.state} position={chain.position?.position} total={chain.position?.total} wait={chain.wait} started={chain.started} closed={chain.closed} incoming={chain.incoming} next={chain.next} handOnBy={chain.handOnBy} />
            ) : null}

            {card(L("Доставка и получаване", "Delivery and receipt"), (
              <div id="receipt">
                <div style={{ display: "flex", gap: "10px 24px", flexWrap: "wrap" }}>
                  {kv(L("Изпратен", "Dispatched"), v.dispatch ? fmtPhaseDate(v.dispatch.at) : "")}
                  {kv(L("Куриер и товарителница", "Carrier and waybill"), [p.courier, v.dispatch?.ref].filter(Boolean).join(" · "))}
                  {kv(L("Потвърдено получаване", "Receipt confirmed"), v.receipt ? fmtPhaseDate(v.receipt.at) : "")}
                </div>
                {uploadBox("protocol", ["dispatched", "received", "draft", "submitted"].includes(v.state))}
              </div>
            ), { "data-delivery": v.dispatch ? "dispatched" : "none" })}

            {chars.length > 0 && card(L("Заявени характеристики", "Characteristics applied for"), (
              <ul data-applied-characteristics={chars.length} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5 }}>
                {chars.map((x) => (
                  <li key={x.i}>{lang === "bg" ? x.c.characteristicBg : x.c.characteristicEn}{(lang === "bg" ? x.c.standardBg : x.c.standardEn) ? <span style={{ color: "var(--muted)" }}> · {lang === "bg" ? x.c.standardBg : x.c.standardEn}</span> : null}{x.n > 1 ? <span style={{ color: "var(--muted)" }}> · {x.n} {L("участия", "participations")}</span> : null}</li>
                ))}
              </ul>
            ))}
          </div>

          <aside style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            {dl && !v.finished && (
              <section data-deadline={dl.kind} className="card" style={{ padding: 0, overflow: "hidden", borderColor: dl.kind === "results" || dl.kind === "chain" ? "#ecc4c4" : "var(--line)" }}>
                <div style={{ padding: "12px 16px", background: dl.kind === "results" || dl.kind === "chain" ? "#fbeaea" : "#f7f6f2" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "#8f2f2f" }}>{T(DEADLINE_LABEL[dl.kind])}</div>
                  <div data-deadline-at={dl.at} style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums", margin: "2px 0" }}>{deadlineText(dl.at, v, lang).split(" · ")[0]}</div>
                  <div style={{ fontSize: 12.5, color: "#8f2f2f" }}>
                    {zone ? (zone === "EEST" ? L("източноевропейско лятно време (EEST)", "Eastern European Summer Time (EEST)") : L("източноевропейско време (EET)", "Eastern European Time (EET)")) : L("до края на деня, българско време", "to the end of the day, Bulgarian time")}
                    {deadlineText(dl.at, v, lang).split(" · ").slice(1).map((x) => ` · ${x}`).join("")}
                  </div>
                  {dl.orderNo && <div style={{ fontSize: 12.5, marginTop: 4 }}>{L(`Удължен по Заповед № ${dl.orderNo}`, `Extended by Order No. ${dl.orderNo}`)}</div>}
                </div>
              </section>
            )}

            {card(L("Резултати", "Results"), (
              <div data-results-box style={{ fontSize: 13 }}>
                {reported
                  ? <span>{officialReport ? L("Резултатът ви е в окончателния доклад — в документите вляво.", "Your result is in the final report — among the documents on the left.") : L("Обработката приключи. Окончателният доклад ще е тук, когато PTS го издаде.", "Processing is complete. The final report will be here once PTS issues it.")}</span>
                  : v.state === "submitted" ? <span>{L("Подадени", "Submitted")}{(() => { const e = v.events.find((x) => x.kind === "results_returned"); return e ? ` · ${fmtPhaseDate(e.at)}` : ""; })()}</span>
                  : <span style={{ color: "var(--muted)" }}>{L("Още не са подадени.", "Not submitted yet.")}</span>}
                {uploadBox("results", ["received", "draft", "submitted"].includes(v.state))}
                {running && !["submitted", "scored", "nr"].includes(v.state) && !v.finished && (
                  <p data-written-instructions style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--muted)" }}>{T(writtenInstructions(s.type === "C" ? "C" : "T"))}</p>
                )}
              </div>
            ))}

            {card(L("Проформа и плащане", "Proforma and payment"), (
              <div data-payment-box={v.payment} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span style={{ color: "var(--muted)" }}>{L("Проформа", "Proforma")}</span><span>{invoice ? fmtPhaseDate(invoice.uploadedAt.slice(0, 10)) : "—"}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span style={{ color: "var(--muted)" }}>{L("Състояние", "State")}</span><span style={{ fontWeight: 700 }}>{T(PAYMENT_LABEL[v.payment])}</span></div>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Плащането не спира изпращането — обектът тръгва по графика (Реш. 96). Всички потребители на организацията виждат и свалят проформата.", "Payment never holds the dispatch back — the object goes on schedule (Реш. 96). Every user of the organisation sees and downloads the proforma.")}</span>
              </div>
            ))}

            {running && (lang === "bg" ? s.staticReminder?.bg : s.staticReminder?.en) ? card(L("Напомняне", "Reminder"), <p data-static-reminder style={{ margin: 0, fontSize: 13 }}>{lang === "bg" ? s.staticReminder?.bg : s.staticReminder?.en}</p>) : null}

            {card(L("Съобщения", "Notices"), notices.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{L("Няма съобщения.", "No notices.")}</p> : (
              <ul data-participation-notices={notices.length} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                {notices.slice(0, 8).map((n) => (
                  <li key={n.id} style={{ fontWeight: n.readAt ? 400 : 700 }}>
                    <span style={{ fontSize: 11.5, color: "var(--muted)", marginRight: 6 }}>{confirmDate(n.createdAt)}</span>{lang === "bg" ? n.bg : n.en}
                  </li>
                ))}
              </ul>
            ))}

            {v.finished && <p data-finished style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>{L(`Участието е приключило: ${STATE_LABEL[v.state].bg}. В архива на началната страница.`, `The participation is over: ${STATE_LABEL[v.state].en}. In the archive on the home page.`)}</p>}
          </aside>
        </div>
      </main>
    </div>
  );
}
