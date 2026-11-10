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
import { labUploadDocAction, submitReceiptAction, reportDeliveryProblemAction, acknowledgeDocAction } from "@/lib/actions";
import { ACK_PROBLEM_TEXT, ackDone, ackMoment, declarationWords, DECLARATION, type AckProblem } from "@/lib/ack-model";
import type { DocAck } from "@/lib/participation-view";
import { deliveryOf, openShipment, chainReceiptTarget, RECEIPT_PROBLEM_TEXT } from "@/lib/delivery-model";
import { gateB } from "@/lib/gate-texts";
import { schemeNowMs, sofiaToday } from "@/lib/clock";
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
export default async function ParticipationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; ok?: string }> }) {
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
  const sp = await searchParams;
  const err = sp.e;

  const coded = !isProvisional(p.code);
  // delivery and receipt (5.6): what was sent, the protocol awaited, the problems signalled
  const delivery = deliveryOf(s, v.participantId);
  const last = delivery.shipments[delivery.shipments.length - 1];
  // the protocol awaited — not once it was received some other way (a signed scan, PTS's step), nor after the round (5.6 review)
  const awaiting = s.type !== "C"
    ? (!v.finished && s.status === "running" && !v.receivedOtherwise ? openShipment(delivery) : null)
    // a calibration device: its protocol at this laboratory's chain stop, once its arrival is
    // stamped — while it travels (5.11, completing 5.6)
    : (!v.finished && (s.status === "open" || s.status === "running") ? chainReceiptTarget(s.chain?.stops, p.code, delivery.receipts) : null);
  // the calibration device's protocols, filed at its stop
  const chainReceipts = s.type === "C" ? delivery.receipts.filter((r) => r.shipmentId.startsWith("chain:")) : [];
  const today = sofiaToday(schemeNowMs(s));
  const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 13, fontFamily: "inherit" } as const;
  const reported = s.status === "report" || s.status === "closed";
  const officialReport = reported && !!s.uploads?.report;
  // the certificate is served to a laboratory's account (the document route); a user of the
  // entity gets it with phase 7 — never a row whose link answers «no» (5.5 review)
  const hasCert = viewer.kind === "lab" && !!labCertificate(s.certificates, p.code);
  // the proforma and, after the payment, the original invoice — each with its number (5.8; Реш. 35, 36)
  const invoice = s.labDocs?.[p.code]?.proforma;
  const original = s.labDocs?.[p.code]?.invoice;
  const running = s.status === "open" || s.status === "running";
  const chain = await chainViewFor(s, p.code, lang, viewer.actor);
  const notices = await withReadState(await listForParticipations([{ schemeId: s.id, code: p.code }], 20).catch(() => []), viewer.reader).catch(() => []);
  const back = viewer.kind === "entity" ? `/lab/overview${v.laboratoryId ? `?lab=${v.laboratoryId}` : ""}` : "/lab";
  const self = `/lab/p/${encodeURIComponent(v.participantId)}`;

  // the documents of the participation, in its three levels (Реш. 49): the scheme's, those
  // to it alone or to this user, then what is issued to it — the report, the certificate,
  // the proforma. PTS's own documents (the provider's level) have no place in the portal yet.
  const NO_ACK: DocAck = { state: "none" };
  const rows = [
    ...v.docs.map((d) => ({ key: d.key, ack: d.ack as DocAck, editionId: d.editionId ?? "", editionNo: d.editionNo, name: docName(d.key, lang), ed: d.editionNo ? String(d.editionNo) : "—", at: d.at.slice(0, 10), lvl: d.level as string, level: d.level === "all" ? L("на схемата", "the scheme's") : d.level === "user" ? L("до вас лично", "to you personally") : L("на участието", "the participation's"), state: d.opened === null ? "—" : d.opened ? L("отворен", "opened") : L("неотворен", "not opened"), opened: d.opened !== false, href: docHref(v, d.key, lang) })),
    ...(officialReport ? [{ key: "report", ack: NO_ACK, editionId: "", editionNo: undefined, lvl: "issued", name: L("Окончателен доклад", "Final report"), ed: "—", at: "", level: L("на схемата", "the scheme's"), state: L("издаден", "issued"), opened: true, href: `/lab/doc/${s.id}/report?lang=${lang}&p=${encodeURIComponent(v.participantId)}` }] : []),
    ...(hasCert ? [{ key: "certificate", ack: NO_ACK, editionId: "", editionNo: undefined, lvl: "issued", name: L("Сертификат", "Certificate"), ed: "—", at: "", level: L("на участието", "the participation's"), state: L("издаден", "issued"), opened: true, href: `/lab/doc/${s.id}/certificate?lang=${lang}&p=${encodeURIComponent(v.participantId)}` }] : []),
    ...(original ? [{ key: "invoice", ack: NO_ACK, editionId: "", editionNo: undefined, lvl: "issued", name: `${T(LAB_DOC_SLOTS.invoice)}${original.number ? ` № ${original.number}` : ""}`, ed: "—", at: original.uploadedAt.slice(0, 10), level: L("на участието", "the participation's"), state: L("платено", "paid"), opened: true, href: `/lab/labdoc/${s.id}/invoice?p=${encodeURIComponent(v.participantId)}` }] : []),
    ...(invoice ? [{ key: "proforma", ack: NO_ACK, editionId: "", editionNo: undefined, lvl: "issued", name: `${T(LAB_DOC_SLOTS.proforma)}${invoice.number ? ` № ${invoice.number}` : ""}`, ed: "—", at: invoice.uploadedAt.slice(0, 10), level: L("на участието", "the participation's"), state: s.status === "not_held" ? L("схемата не се състои — нищо не се фактурира", "the scheme is not held — nothing is invoiced") : T(PAYMENT_LABEL[v.payment]), opened: true, href: `/lab/labdoc/${s.id}/proforma?p=${encodeURIComponent(v.participantId)}` }] : []),
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
        ) : when && viewer.kind === "entity" && !v.finished && !(slot === "protocol" && gateB()) ? (
          // from Gate B the protocol is filed online on this page, never by e-mail (П12, П17 — 5.11)
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{slot === "protocol" ? L("Изпратете подписания протокол за получаване (Ф 7.3.4-1) на PTS по e-mail.", "Send the signed receipt protocol (Ф 7.3.4-1) to PTS by e-mail.") : L("Изпратете попълнения Лист за резултати на PTS по e-mail.", "Send the completed Results sheet to PTS by e-mail.")}</span>
        ) : null}
      </div>
    );
  };

  const receiptErr = err?.startsWith("receipt-") ? err.slice(8) : "";
  const ackErr = err?.startsWith("ack-") ? err.slice(4) : "";
  const errText = err === "locked" ? L("Файлът не е приет — участието вече не приема файлове.", "The file was not taken — the participation takes no more files.")
    : err === "upload" ? L("Качването не бе прието — използвайте PDF/PNG/JPG до 15 MB.", "Upload not accepted — use a PDF/PNG/JPG up to 15 MB.")
    : receiptErr && Object.hasOwn(RECEIPT_PROBLEM_TEXT, receiptErr) ? `${L("Протоколът не е подаден", "The protocol was not filed")}: ${T(RECEIPT_PROBLEM_TEXT[receiptErr as keyof typeof RECEIPT_PROBLEM_TEXT])}`
    : err === "problem-text" ? L("Опишете проблема (поне 3 знака).", "Describe the problem (3 characters at least).")
    : err === "problem-nothing" ? L("Още нищо не е изпратено към вас.", "Nothing has been sent to you yet.")
    : err === "problem-state" ? L("Схемата вече не приема сигнали — свържете се с PTS.", "The scheme no longer takes problems — contact PTS.")
    : err === "problem-many" ? L("Имате няколко неотговорени сигнала — изчакайте отговора на PTS.", "You have several problems unanswered — wait for PTS's answer.")
    : ackErr && Object.hasOwn(ACK_PROBLEM_TEXT, ackErr) ? T(ACK_PROBLEM_TEXT[ackErr as AckProblem]) : "";
  const okText = sp.ok === "receipt" ? L("Протоколът за получаване е подаден — PTS е уведомен.", "The receipt protocol is filed — PTS is told.") : sp.ok === "problem" ? L("Сигналът е изпратен на PTS.", "The problem is sent to PTS.")
    : sp.ok === "ack" ? L("Потвърждението е записано.", "The acknowledgement is recorded.") : sp.ok === "declaration" ? L("Декларацията е подписана — записана с вашия акаунт, датата, часа и редакцията.", "The declaration is signed — recorded with your account, the date, the hour and the edition.") : "";
  // a record's moment as a person reads it: the day and the hour, both on Sofia's clock (review)
  const dayTime = ackMoment;
  const declaration = rows.find((r) => r.key === DECLARATION && r.ack.state !== "none");
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
        {errText && <div role="alert" data-page-err={err} style={{ background: "#fdecec", border: "1px solid #d9534f", color: "#8a1f1f", borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>{errText}</div>}
        {okText && <div role="status" data-page-ok={sp.ok} style={{ background: "var(--green-soft)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>{okText}</div>}
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
                    <tr key={r.key} data-doc-row={r.key} data-doc={r.key} data-doc-level={r.lvl} data-doc-opened={r.opened ? "1" : "0"} data-doc-ack={r.ack.state} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={{ padding: "7px 6px" }}><a href={r.href} target="_blank" rel="noreferrer">{r.name}</a></td>
                      <td style={{ padding: "7px 6px", fontVariantNumeric: "tabular-nums" }}>{r.ed}</td>
                      <td style={{ padding: "7px 6px", fontVariantNumeric: "tabular-nums" }}>{r.at ? fmtPhaseDate(r.at) : "—"}</td>
                      <td style={{ padding: "7px 6px", color: "var(--muted)" }}>{r.level}</td>
                      <td style={{ padding: "7px 6px", color: r.opened ? "var(--muted)" : "#2f4f75", fontWeight: r.opened ? 400 : 700 }}>
                        {r.state}
                        {/* 5.9: asked to acknowledge (Реш. 117) or to sign (Реш. 118) — never a block */}
                        {r.ack.state === "done" ? (
                          <div data-ack-done={r.ack.kind} style={{ fontSize: 12, color: "#2e6b3a", fontWeight: 600 }}>✓ {ackDone(lang, r.ack.kind, dayTime(r.ack.record.at))}</div>
                        ) : r.ack.state === "asked" && r.ack.kind === "declaration" ? (
                          <div><a href="#declaration" style={{ fontSize: 12, fontWeight: 700 }}>{L("Подпишете ↓", "Sign ↓")}</a></div>
                        ) : r.ack.state === "asked" && s.status !== "not_held" && !r.editionId ? (
                          // released before editions: its edition is kept on the first opening (3.0)
                          <div data-ack-open-first style={{ fontSize: 12 }}><a href={r.href} target="_blank" rel="noreferrer">{L("Отворете го — после потвърдете", "Open it — then acknowledge")}</a></div>
                        ) : r.ack.state === "asked" && s.status !== "not_held" ? (
                          <form action={acknowledgeDocAction} data-ack-form={r.key} style={{ marginTop: 4 }}>
                            <input type="hidden" name="schemeId" value={s.id} />
                            <input type="hidden" name="participantId" value={v.participantId} />
                            <input type="hidden" name="docKey" value={r.key} />
                            <input type="hidden" name="editionId" value={r.editionId} />
                            <input type="hidden" name="lang" value={lang} />
                            <button type="submit" className="btn btn-sm" style={{ fontSize: 12 }}>{L("Запознах се", "I have read it")}</button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>{L("Всяко сваляне се записва. «Отворен» — свален от някого от участието. «Запознах се» записва вашия акаунт, датата и редакцията; не спира нищо.", "Every download is recorded. «Opened» — downloaded by someone of the participation. «I have read it» records your account, the date and the edition; it holds nothing back.")}</p>
              </div>
            ), { id: "documents" })}

            {/* the declaration Ф 4.2-2, signed by a tick (5.9; Реш. 118) — the account, the day and
                the hour, and the edition's text (the hash of its frozen file) */}
            {declaration ? card(L("Декларация за конфиденциалност (Ф 4.2-2)", "Confidentiality declaration (F 4.2-2)"), declaration.ack.state === "done" ? (
              <div data-declaration="signed" style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: "#2e6b3a" }}>✓ {ackDone(lang, "declaration", dayTime(declaration.ack.record.at))}{declaration.ack.record.editionNo ? L(` · редакция № ${declaration.ack.record.editionNo}`, ` · edition No. ${declaration.ack.record.editionNo}`) : ""}</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Записана с акаунта, датата, часа и текста на тази редакция. Нова редакция ще поиска нов подпис.", "Recorded with the account, the date, the hour and this edition's text. A new edition will ask to be signed again.")}</span>
              </div>
            ) : s.status === "not_held" ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{L("Схемата не се състои — няма какво да се подписва.", "The scheme is not held — there is nothing to sign.")}</p>
            ) : !declaration.editionId ? (
              // sent before editions: its edition — the text signed — is kept on the first opening (3.0)
              <p data-declaration="open-first" style={{ margin: 0, fontSize: 13 }}>
                <a href={declaration.href} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{L("Отворете декларацията", "Open the declaration")} ↗</a>
                {L(" — после презаредете страницата и я подпишете.", " — then reload this page and sign it.")}
              </p>
            ) : (
              <form action={acknowledgeDocAction} data-declaration="asked" style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                <input type="hidden" name="schemeId" value={s.id} />
                <input type="hidden" name="participantId" value={v.participantId} />
                <input type="hidden" name="docKey" value={DECLARATION} />
                <input type="hidden" name="editionId" value={declaration.editionId} />
                <input type="hidden" name="lang" value={lang} />
                <a href={declaration.href} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{L("Прочетете декларацията", "Read the declaration")}{declaration.editionNo ? L(` (редакция № ${declaration.editionNo})`, ` (edition No. ${declaration.editionNo})`) : ""} ↗</a>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <input type="checkbox" name="tick" value="on" required style={{ marginTop: 3 }} />
                  <span>{declarationWords(lang, declaration.editionNo, undefined) /* the edition by its number — the row's date is the release's, not the edition's */}</span>
                </label>
                <div><button type="submit" className="btn btn-primary btn-sm">{L("Подписвам", "Sign")}</button></div>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Отметката е подписът: записват се вашият акаунт, датата, часът и текстът на тази редакция. Сканирано копие не е нужно.", "The tick is the signature: your account, the date, the hour and this edition's text are recorded. A scanned copy is not needed.")}</span>
              </form>
            ), { id: "declaration" }) : null}

            {/* 6.1: the results form, online — a draft kept as typed, the participation's own */}
            {(s.type === "T" ? s.status === "running" : (s.status === "open" || s.status === "running") && (s.chain?.stops ?? []).some((x) => x.kind === "lab" && x.code === p.code && !!x.receivedAt)) && !v.finished ? card(L("Резултати", "Results"), (
              <div data-results-link style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
                <span style={{ color: "var(--muted)", flex: 1, minWidth: 220 }}>{s.type === "C" ? L("Попълнете резултатите от калибрирането онлайн: общата информация и за всяка точка референтната и измерената стойност. Черновата се пази, както е написана.", "Fill in the calibration results online: the general info and, for each point, the reference and the measured value. The draft is kept as typed.") : L("Попълнете резултатите онлайн: определянията, средната стойност, U и k. Черновата се пази, както е написана.", "Fill in the results online: the determinations, the mean, U and k. The draft is kept as typed.")}</span>
                <Link href={`${self}/results`} className="btn btn-primary btn-sm" data-open-results>{L("Към формуляра", "Open the form")}</Link>
              </div>
            )) : null}

            {s.type === "C" && chain ? (
              <DeviceChainCard schemeId={s.id} lang={lang} state={chain.state} position={chain.position?.position} total={chain.position?.total} wait={chain.wait} started={chain.started} closed={chain.closed} incoming={chain.incoming} next={chain.next} handOnBy={chain.handOnBy} />
            ) : null}

            {card(L("Доставка и получаване", "Delivery and receipt"), (
              <div id="receipt">
                <div style={{ display: "flex", gap: "10px 24px", flexWrap: "wrap" }}>
                  {kv(L("Изпратен", "Dispatched"), v.dispatch ? fmtPhaseDate(v.dispatch.at) : "")}
                  {kv(L("Куриер и товарителница", "Carrier and waybill"), [last?.carrier ?? p.courier, last?.waybill ?? v.dispatch?.ref].filter(Boolean).join(" · "))}
                  {kv(L("Потвърдено получаване", "Receipt confirmed"), v.receipt ? fmtPhaseDate(v.receipt.at) : "")}
                </div>
                {/* what was sent, what arrived, what was signalled (5.6) */}
                {delivery.shipments.length > 0 && (
                  <ul data-shipments={delivery.shipments.length} style={{ listStyle: "none", margin: "10px 0 0", padding: 0, fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 }}>
                    {delivery.shipments.map((x) => (
                      <li key={x.id} data-shipment={x.kind}>
                        <b>{x.kind === "handover" ? L("Предаден на вашия куриер", "Handed to your courier") : x.kind === "replacement" ? L("Заместващ обект", "Replacement object") : L("Изпратен", "Sent")}</b> {fmtPhaseDate(x.day)}
                        {x.handover ? ` ${x.handover.time} · ${x.handover.carrier}` : ""}{x.carrier && !x.handover ? ` · ${x.carrier}` : ""}{x.waybill ? ` · ${L("товарителница", "waybill")} ${x.waybill}` : ""}
                        {x.docs.length ? <span style={{ color: "var(--muted)" }}> · {(s.lists?.shipmentDocs ?? []).filter((i) => x.docs.includes(i.id)).map((i) => T(i)).join(", ")}</span> : null}
                        {delivery.receipts.filter((r) => r.shipmentId === x.id).map((r) => (
                          <div key={r.id} data-receipt={r.suitable ? "fit" : "unfit"} style={{ color: r.suitable ? "var(--green-dark)" : "#8f2f2f" }}>
                            {L("Протокол за получаване", "Receipt protocol")} {fmtPhaseDate(r.day)} {r.time} · {r.suitable ? L("годен", "fit") : L("негоден", "not fit")}
                            {(s.lists?.receiptChecks ?? []).filter((c) => r.checks[c.id] === false).map((c) => ` · ✗ ${T(c)}`).join("")}{!r.undamaged ? ` · ${L("нарушена опаковка", "packaging damaged")}` : ""}
                          </div>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
                {delivery.problems.length > 0 && (
                  <ul data-problems={delivery.problems.length} style={{ listStyle: "none", margin: "8px 0 0", padding: 0, fontSize: 12.5 }}>
                    {delivery.problems.map((pr) => (
                      <li key={pr.id} data-problem-open={pr.resolved ? "0" : "1"} style={{ color: pr.resolved ? "var(--muted)" : "#8f2f2f" }}>
                        {L("Сигнал", "Problem")} {fmtPhaseDate(pr.at.slice(0, 10))}: «{pr.text}»{pr.resolved ? ` — ${L("решен от PTS", "resolved by PTS")}: ${pr.resolved.note}` : ` — ${L("при PTS", "with PTS")}`}
                      </li>
                    ))}
                  </ul>
                )}
                {chainReceipts.map((r) => (
                  <div key={r.id} data-receipt={r.suitable ? "fit" : "unfit"} data-chain-receipt style={{ fontSize: 12.5, marginTop: 6, color: r.suitable ? "var(--green-dark)" : "#8f2f2f" }}>
                    {L("Протокол за получаване на уреда", "The device's receipt protocol")} {fmtPhaseDate(r.day)} {r.time} · {r.suitable ? L("годен", "fit") : L("негоден", "not fit")}
                    {(s.lists?.receiptChecks ?? []).filter((c) => r.checks[c.id] === false).map((c) => ` · ✗ ${T(c)}`).join("")}{!r.undamaged ? ` · ${L("нарушена опаковка", "packaging damaged")}` : ""}
                  </div>
                ))}
                {/* the online receipt protocol (Ф 7.3.4-1) for the shipment — or, calibration, the device at this stop — awaiting it; «годен» is every listed check passed (Реш. 79) */}
                {awaiting && (
                  <form action={submitReceiptAction} data-receipt-form={awaiting.id} style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, display: "grid", gap: 8, fontSize: 13 }}>
                    <b>{L("Протокол за получаване (Ф 7.3.4-1)", "Receipt protocol (Ф 7.3.4-1)")}</b>
                    <input type="hidden" name="schemeId" value={s.id} />
                    <input type="hidden" name="participantId" value={v.participantId} />
                    <input type="hidden" name="shipmentId" value={awaiting.id} />
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <label style={{ display: "grid", fontSize: 12, color: "var(--muted)" }}>{L("Получен на", "Received on")}<input type="date" name="day" required max={today} defaultValue={today} style={field} /></label>
                      <label style={{ display: "grid", fontSize: 12, color: "var(--muted)" }}>{L("Час", "Time")}<input type="time" name="time" required style={field} /></label>
                      <label style={{ display: "grid", fontSize: 12, color: "var(--muted)", flex: 1, minWidth: 180 }}>{L("Получил (име и фамилия)", "Received by (name and surname)")}<input name="receivedBy" required maxLength={120} style={field} /></label>
                    </div>
                    <fieldset data-check="undamaged" style={{ border: "none", padding: 0, margin: 0 }}>
                      <legend>{L("Опаковката е ненарушена", "The packaging is undamaged")}</legend>
                      <label style={{ marginRight: 12 }}><input type="radio" name="undamaged" value="yes" required /> {L("да", "yes")}</label>
                      <label><input type="radio" name="undamaged" value="no" /> {L("не", "no")}</label>
                    </fieldset>
                    {(s.lists?.receiptChecks ?? []).map((c) => (
                      <fieldset key={c.id} data-check={c.id} style={{ border: "none", padding: 0, margin: 0 }}>
                        <legend>{T(c)}</legend>
                        <label style={{ marginRight: 12 }}><input type="radio" name={`check_${c.id}`} value="yes" required /> {L("да", "yes")}</label>
                        <label><input type="radio" name={`check_${c.id}`} value="no" /> {L("не", "no")}</label>
                      </fieldset>
                    ))}
                    <label style={{ display: "grid", fontSize: 12, color: "var(--muted)" }}>{L("Забележки, ако е необходимо", "Remarks, if necessary")}<textarea name="remarks" maxLength={1000} rows={2} style={field} /></label>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{L("«Годен» означава само, че всички изброени проверки са минали (Реш. 79). Протоколът не се променя след подаване.", "«Fit» means only that every listed check passed (Реш. 79). The protocol is not changed once filed.")}</span>
                    <button type="submit" className="btn btn-primary btn-sm" style={{ justifySelf: "start" }}>{L("Подай протокола", "File the protocol")}</button>
                  </form>
                )}
                {/* «Сигнализирай проблем» — once something was sent, while it goes on */}
                {delivery.shipments.length > 0 && !v.finished && s.type !== "C" && s.status === "running" && (
                  <details style={{ marginTop: 10 }} data-problem-box>
                    <summary style={{ cursor: "pointer", fontSize: 13, color: "#8f2f2f" }}>{L("Сигнализирай проблем", "Report a problem")}</summary>
                    <form action={reportDeliveryProblemAction} style={{ display: "grid", gap: 6, marginTop: 6 }}>
                      <input type="hidden" name="schemeId" value={s.id} />
                      <input type="hidden" name="participantId" value={v.participantId} />
                      <textarea name="text" required minLength={3} maxLength={1000} rows={3} aria-label={L("Какво не е наред с обекта или пратката", "What is wrong with the object or the shipment")} placeholder={L("Какво не е наред с обекта или пратката", "What is wrong with the object or the shipment")} style={field} />
                      <button type="submit" className="btn btn-sm" style={{ justifySelf: "start" }}>{L("Изпрати сигнала на PTS", "Send it to PTS")}</button>
                    </form>
                  </details>
                )}
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

            {card(L("Проформа, фактура и плащане", "Proforma, invoice and payment"), (
              <div data-payment-box={v.payment} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }} data-proforma-number={invoice?.number ?? ""}><span style={{ color: "var(--muted)" }}>{L("Проформа", "Proforma")}</span><span>{invoice ? `${invoice.number ? `№ ${invoice.number} · ` : ""}${fmtPhaseDate(invoice.uploadedAt.slice(0, 10))}` : "—"}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }} data-invoice-number={original?.number ?? ""}><span style={{ color: "var(--muted)" }}>{L("Фактура", "Invoice")}</span><span>{original ? `${original.number ? `№ ${original.number} · ` : ""}${fmtPhaseDate(original.uploadedAt.slice(0, 10))}` : L("след плащането", "after the payment")}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span style={{ color: "var(--muted)" }}>{L("Състояние", "State")}</span><span style={{ fontWeight: 700 }}>{T(PAYMENT_LABEL[v.payment])}</span></div>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Плащането не спира изпращането — обектът тръгва по графика (Реш. 96). Всички потребители на организацията виждат и свалят проформата и фактурата.", "Payment never holds the dispatch back — the object goes on schedule (Реш. 96). Every user of the organisation sees and downloads the proforma and the invoice.")}</span>
              </div>
            ))}

            {running && (lang === "bg" ? s.staticReminder?.bg : s.staticReminder?.en) ? card(L("Напомняне", "Reminder"), <p data-static-reminder style={{ margin: 0, fontSize: 13 }}>{lang === "bg" ? s.staticReminder?.bg : s.staticReminder?.en}</p>) : null}

            {card(L("Съобщения", "Notices"), notices.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{L("Няма съобщения.", "No notices.")}</p> : (
              <ul data-participation-notices={notices.length} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                {notices.slice(0, 8).map((n) => (
                  <li key={n.id} data-participation-notice={n.kind} style={{ fontWeight: n.readAt ? 400 : 700, whiteSpace: "pre-wrap" }}>
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
