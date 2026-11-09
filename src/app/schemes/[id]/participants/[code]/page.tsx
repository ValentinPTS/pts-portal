import Link from "next/link";
import { mayNow, requireCap } from "@/lib/access";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { listParticipants, withoutIdentity } from "@/lib/participants";
import { namesFor } from "@/lib/identities";
import { listCaseEvents } from "@/lib/case-events";
import { LAB_RECORDER, redactCaseEventForStaff } from "@/lib/redact";
import { addCaseEventAction, voidCaseEventAction } from "@/lib/actions";
import { requireStaff } from "@/lib/roles";
import { logActivity } from "@/lib/activity";
import LabInvoicePanel from "@/components/LabInvoicePanel";
import { acksOfParticipation, ackDone, ackMoment } from "@/lib/ack-model";
import MessageComposer from "@/components/MessageComposer";
import { sendParticipationMessageAction } from "@/lib/actions";
import { messageTargetLabel, messageReached } from "@/lib/messages-model";
import { openEntityUsers } from "@/lib/entity-users";
import { actorNow } from "@/lib/identities";
import { invoiceProblem } from "@/lib/announcement-model";
import { getServerT } from "@/lib/i18n-server";
import { DOCUMENTS } from "@/lib/documents";
import type { CaseEventKind } from "@/lib/types";
import { schemeNowMs, sofiaToday } from "@/lib/clock";
import { resultsDeadline, chainWindow, deadlineState, resultsSubmittedAt } from "@/lib/deadlines-model";
import { holidaySet } from "@/lib/holidays";
import { fmtSchemeDate } from "@/lib/scheme-dates";
import ExtensionForm from "@/components/ExtensionForm";

/** A held proforma or invoice as the panel shows it: its name, date and number — no more. */
const held = (d?: { name?: string; uploadedAt?: string; number?: string }) => (d ? { name: d.name, uploadedAt: d.uploadedAt, number: d.number } : undefined);

// Participant case file (Phase RT3) — the auditor's per-lab view, by CODE. Dated
// timeline of milestones (auto + manual), the identity (name revealed to managers
// only), and a link to the combined results. Owner-area page (gated by proxy.ts).
export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  applied: "var(--muted)", approved: "var(--success)", invoiced: "var(--info)",
  paid: "var(--info)", dispatched: "var(--blue)", received: "var(--teal)",
  submitted: "var(--amber)", scored: "var(--green-dark)",
};
const MANUAL_KINDS: CaseEventKind[] = [
  "docs_sent", "items_dispatched", "receipt_confirmed", "results_returned", "scored", "report_issued", "other",
];

function fmtDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : d;
}

export default async function CaseFilePage({
  params, searchParams,
}: {
  params: Promise<{ id: string; code: string }>;
  searchParams: Promise<{ reveal?: string; kind?: string; from?: string; void?: string; step?: string; msg?: string }>;
}) {
  await requireStaff(); // read gate: manager/staff/auditor only
  const { id, code: rawCode } = await params;
  await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  const code = decodeURIComponent(rawCode);
  const sp = await searchParams;
  // arriving from the traceability matrix: pre-select the clicked step + return there
  const preKind: CaseEventKind = MANUAL_KINDS.includes(sp.kind as CaseEventKind) ? (sp.kind as CaseEventKind) : "docs_sent";
  const returnTo = sp.from === "trace" ? `/schemes/${id}/traceability` : "";

  const s = await getScheme(id);
  if (!s) notFound();
  const coded = (await listParticipants(id)).find((x) => x.code === code);
  if (!coded) notFound();

  const { lang, tr } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const canReveal = await mayNow("names.view", id); // the scheme manager and the coding expert, here (Реш. 93, 2.4)
  // 5.10: who works with the participants here writes to them — once the scheme has started
  const canMessage = (await mayNow("participants.manage", id)) && s.status !== "draft";
  const revealed = canReveal && sp.reveal === "1";
  // who is behind this code only when a manager asks to see it — an opening, on record (2.3)
  const p = revealed ? (await namesFor(id, [coded]))[0] : withoutIdentity(coded);
  if (revealed) await logActivity("names.viewed", { schemeId: id, targetCode: code, subject: `participant:${code}`, summary: "Laboratory name shown for one code — its case file" });
  // 5.9: the acknowledgements and the declaration's ticks of this participation — the account by
  // name only when the names are revealed here (one opening, on record), else by its kind (review)
  const acks = coded ? acksOfParticipation(s, coded.id) : [];
  const ackUser = new Map<string, string>();
  const ackUserIds = [...new Set(acks.map((a) => a.by).filter((b) => b.startsWith("entityuser:")).map((b) => b.slice("entityuser:".length)))];
  if (revealed && ackUserIds.length) {
    const who = { actor: await actorNow(), purpose: "names.view" as const };
    for (const uid of ackUserIds) for (const u of await openEntityUsers(who, { userId: uid }).catch(() => [])) ackUser.set(`entityuser:${u.id}`, u.name);
    if (ackUser.size) await logActivity("names.viewed", { schemeId: id, targetCode: code, subject: `participant:${code}`, summary: `Who acknowledged or signed for one code shown by name (${ackUser.size})` });
  }

  // A non-manager never sees a lab's e-mail or the name of a file it uploaded (N4).
  // voided steps included: they stay in the file, struck through (part 0.9)
  const events = (await listCaseEvents(id, code, { includeVoided: true })).map((e) => (canReveal ? e : redactCaseEventForStaff(e)));
  const reported = s.scoring?.results?.[code] ?? {};
  const reportedCount = Object.keys(reported).length;
  const today = sofiaToday(schemeNowMs(s)); // the round's Bulgarian day (1.3)
  // this participant's deadlines (3.4), on the round's clock
  const nowMs = schemeNowMs(s);
  const rd = resultsDeadline(s, code);
  const resultsAt = resultsSubmittedAt(s, code, coded.status); // the first file, on the round's clock
  const resultsState = deadlineState(rd.at, resultsAt, nowMs);
  const stop = [...(s.chain?.stops ?? [])].reverse().find((x) => x.kind === "lab" && x.code === code && x.receivedAt);
  const win = s.type === "C" && stop ? chainWindow(s, stop, await holidaySet()) : null;
  const winState = win ? deadlineState(win.due, stop?.sentAt, nowMs) : "none";
  const canExtend = (await mayNow("order.manage", id)) && (s.status === "open" || s.status === "running");

  const labelStyle = { fontSize: 12, color: "var(--muted)" } as const;
  const inputCls = "w-full rounded px-2 py-1 text-sm";
  const inputStyle = { border: "1px solid var(--line)", background: "#fff" } as const;

  return (
    <div>
      <Link href={`/schemes/${id}/participants`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {tr("case.back")}
      </Link>

      {(sp.void === "reason" || sp.void === "failed") && (
        <div className="card p-3 mt-3 text-sm" style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>{tr(sp.void === "reason" ? "case.voidNeedsReason" : "case.voidFailed")}</div>
      )}
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{tr("case.title")}</h1>
        <span className="font-mono font-bold text-lg" style={{ color: "var(--green-dark)" }}>{code}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[p.status] ?? "var(--muted)" }}>● {tr(`pstatus.${p.status}`)}</span>
      </div>

      {/* identity */}
      <div className="card mt-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold" style={{ color: "var(--green-dark)" }}>{tr("case.identity")}</h2>
          {canReveal && (
            revealed
              ? <Link href={`/schemes/${id}/participants/${encodeURIComponent(code)}`} className="btn btn-sm" style={{ fontSize: 12 }}>{tr("case.hide")}</Link>
              : <Link href={`/schemes/${id}/participants/${encodeURIComponent(code)}?reveal=1`} className="btn btn-sm" style={{ fontSize: 12 }}>{tr("case.reveal")}</Link>
          )}
        </div>
        <div className="grid mt-2" style={{ gridTemplateColumns: "120px 1fr", gap: "6px 12px", fontSize: 14 }}>
          <div style={labelStyle}>{tr("case.code")}</div>
          <div className="font-mono font-bold" style={{ color: "var(--green-dark)" }}>{code}</div>
          <div style={labelStyle}>{tr("case.name")}</div>
          <div>
            {revealed
              ? <span>{p.labName}{p.country ? `, ${p.country}` : ""}{p.contact ? ` · ${p.contact}` : ""}{p.email ? ` · ${p.email}` : ""}</span>
              : <span style={{ color: "var(--muted)", fontStyle: "italic" }}>{tr("case.hiddenName")}</span>}
          </div>
        </div>
        {!canReveal && <p className="mt-2" style={labelStyle}>{tr("case.revealHint")}</p>}
      </div>

      {/* deadlines (3.4): the results deadline and, in a calibration chain, the window —
          with their extensions; overdue is a state, never a block (Zadanie §9) */}
      <div className="card mt-4 p-4" data-deadlines>
        <h2 className="font-bold" style={{ color: "var(--green-dark)" }}>{lang === "bg" ? "Срокове" : "Deadlines"}</h2>
        <div className="grid mt-2" style={{ gridTemplateColumns: "minmax(140px, 220px) 1fr", gap: "6px 12px", fontSize: 14 }}>
          <div style={labelStyle}>{lang === "bg" ? "За резултатите" : "For the results"}</div>
          <div data-deadline="resultsDue" data-state={resultsState}>
            {rd.at ? fmtSchemeDate(rd.at) : "—"}
            {rd.ext && <span style={labelStyle}> · {lang === "bg" ? `удължен по Заповед № ${rd.ext.orderNo}` : `extended by Order No. ${rd.ext.orderNo}`}</span>}
            {resultsState === "overdue" && <b style={{ color: "#8f2f2f" }}> · {lang === "bg" ? "просрочен" : "overdue"}</b>}
            {resultsState === "late" && <span style={{ color: "#9a6b22" }}> · {lang === "bg" ? "подадени след срока" : "submitted after the deadline"}</span>}
          </div>
          {win && (
            <>
              <div style={labelStyle}>{lang === "bg" ? "Уредът — да се предаде до" : "The instrument — to hand on by"}</div>
              <div data-deadline="chain" data-state={winState}>
                {fmtSchemeDate(win.due)}
                <span style={labelStyle}> · {win.ext ? (lang === "bg" ? `удължен по Заповед № ${win.ext.orderNo}` : `extended by Order No. ${win.ext.orderNo}`) : (lang === "bg" ? `${win.days} работни дни от получаването (${fmtSchemeDate(win.received)})` : `${win.days} working days from the receipt (${fmtSchemeDate(win.received)})`)}</span>
                {winState === "overdue" && <b style={{ color: "#8f2f2f" }}> · {lang === "bg" ? "просрочен" : "overdue"}</b>}
              </div>
            </>
          )}
        </div>
        {(s.extensions ?? []).filter((e) => e.code === code).length > 0 && (
          <ul className="text-sm mt-3" data-extensions style={{ paddingLeft: 18 }}>
            {(s.extensions ?? []).filter((e) => e.code === code).map((e) => (
              <li key={e.id}>{fmtSchemeDate(e.day)} · {e.key === "chain" ? (lang === "bg" ? "прозорецът" : "the window") : (lang === "bg" ? "резултатите" : "the results")} → <b>{fmtSchemeDate(e.until)}</b> · {lang === "bg" ? "Заповед №" : "Order No."} {e.orderNo} {lang === "bg" ? "от" : "of"} {fmtSchemeDate(e.orderDate)} — {e.reason}</li>
            ))}
          </ul>
        )}
        {canExtend && <ExtensionForm schemeId={id} code={code} lang={lang === "bg" ? "bg" : "en"} calibration={s.type === "C"} />}
      </div>

      {/* The proforma invoice is addressed to this laboratory by name, so only a
          manager may handle it (§4.2) — the same line the identity reveal draws. */}
      {canReveal && (
        <LabInvoicePanel
          schemeId={id}
          code={code}
          lang={lang}
          // only what the panel shows — never the storage path (a whole file in memory mode)
          // nor who uploaded it, into the page sent to the browser (review)
          proforma={held(s.labDocs?.[code]?.proforma)}
          invoice={held(s.labDocs?.[code]?.invoice)}
          paidAt={s.paidAt?.[code]}
          notHeld={s.status === "not_held"}
          // a proforma only after the second announcement, to one on its final list (5.2; Реш. 65)
          notYet={s.status === "not_held" ? undefined : invoiceProblem(s, coded!) ?? undefined}
        />
      )}

      {/* 5.9: what this participation acknowledged or signed (Реш. 117, 118) — the document, the
          edition, the moment; the account only as its kind, never a person's name by the code */}
      {acks.length > 0 && (() => {
        const at = ackMoment; // the day and the hour on Sofia's clock (review)
        const lg = lang === "bg" ? "bg" : "en";
        return (
          <section className="card p-4 mt-4" data-participant-acks={acks.length}>
            <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15, margin: 0 }}>{lg === "bg" ? "Потвърждения и декларация" : "Acknowledgements and declaration"}</h2>
            <ul className="text-sm mt-2" style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {acks.map((a) => {
                const d = DOCUMENTS.find((x) => x.key === a.docKey);
                return (
                  <li key={a.id} data-participant-ack={a.docKey} data-ack-kind={a.kind}>
                    <strong>{d ? (lg === "bg" ? d.nameBg : d.nameEn) : a.docKey}</strong>
                    {a.editionNo ? (lg === "bg" ? ` · ред. № ${a.editionNo}` : ` · ed. No. ${a.editionNo}`) : ""}
                    {" — "}{ackDone(lg, a.kind, at(a.at))}
                    {" · "}<span style={{ color: "var(--muted)" }} data-ack-account>{ackUser.get(a.by) ?? (a.by.startsWith("entityuser:") ? (lg === "bg" ? "потребител на организацията" : "a user of the organisation") : (lg === "bg" ? "акаунтът на лабораторията" : "the laboratory's account"))}</span>
                    {a.sha ? <span style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: 11 }}>{` · sha-256 ${a.sha.slice(0, 12)}…`}</span> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })()}

      {/* 5.10: a one-way message to this participation (Реш. 116; Реш. 22, 91 — e.g. its lateness) */}
      {canMessage && coded && (
        <MessageComposer action={sendParticipationMessageAction} hidden={{ schemeId: id, code }} lang={lang === "bg" ? "bg" : "en"}
          title={lang === "bg" ? "Съобщение до участието" : "Message to the participation"}
          to={lang === "bg" ? `до участие ${code}` : `to participation ${code}`}
          answer={sp.msg}
          // to it alone, and those to everyone that reached it (review)
          history={(s.messages ?? []).filter((m) => messageReached(m, coded.id)).reverse().map((m) => ({ id: m.id, at: ackMoment(m.at), to: m.to.kind === "all" ? (lang === "bg" ? "до всички участия" : "to every participation") : messageTargetLabel(m.to, lang === "bg" ? "bg" : "en", () => code), bg: m.bg, en: m.en }))} />
      )}

      {/* timeline */}
      <h2 className="text-lg font-bold mt-7 mb-2 pb-1" style={{ color: "var(--green-dark)", borderBottom: "2px solid var(--red)" }}>
        {tr("case.timeline")}
      </h2>
      <div className="card overflow-hidden">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <tbody>
            {events.length === 0 && (
              <tr><td className="p-3" style={{ color: "var(--muted)" }}>{tr("case.noEvents")}</td></tr>
            )}
            {events.map((e) => (
              <tr key={e.id} style={{ borderTop: "1px solid var(--line)", verticalAlign: "top", opacity: e.voidedAt ? 0.6 : 1 }}>
                <td className="p-2" style={{ width: 110, color: "var(--muted)", whiteSpace: "nowrap", textDecoration: e.voidedAt ? "line-through" : undefined }}>{fmtDate(e.at)}</td>
                <td className="p-2" style={{ textDecoration: e.voidedAt ? "line-through" : undefined }}>
                  <span style={{ fontWeight: 700, color: "var(--green-dark)" }}>{tr(`casekind.${e.kind}`)}</span>
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "#fff", background: e.source === "auto" ? "var(--green-light)" : "var(--info)", borderRadius: 999, padding: "1px 7px" }}>
                    {e.source === "auto" ? tr("case.auto") : tr("case.manual")}
                  </span>
                  {e.docKey && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--green-dark)", background: "var(--green-soft)", border: "1px solid var(--line)", borderRadius: 999, padding: "1px 8px" }}>
                      📄 {(() => { const d = DOCUMENTS.find((x) => x.key === e.docKey); return d ? (lang === "bg" ? d.nameBg : d.nameEn) : e.docKey; })()}
                    </span>
                  )}
                  {e.ref && <span style={{ marginLeft: 8 }}>· {e.ref}</span>}
                  {e.note && <div style={{ color: "var(--muted)", fontSize: 13 }}>{e.note}</div>}
                  {e.recordedBy && <div style={{ color: "var(--muted)", fontSize: 11 }}>{tr("case.recordedBy")}: {e.recordedBy === LAB_RECORDER ? tr("case.byLab") : e.recordedBy}</div>}
                  {e.voidedAt && (
                    <div style={{ color: "var(--red)", fontSize: 11, textDecoration: "none", display: "inline-block" }}>
                      {tr("case.voided")} {fmtDate(e.voidedAt.slice(0, 10))}{e.voidedBy ? ` · ${e.voidedBy}` : ""} — {e.voidReason}
                    </div>
                  )}
                </td>
                <td className="p-2" style={{ width: 210, textAlign: "right" }}>
                  {/* a manual step recorded by mistake is voided with a reason — never deleted */}
                  {canReveal && e.source === "manual" && !e.voidedAt && (
                    <form action={voidCaseEventAction} className="flex gap-1 justify-end">
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="schemeId" value={id} />
                      <input type="hidden" name="code" value={code} />
                      <input name="reason" required maxLength={300} placeholder={tr("case.voidReason")} className="rounded px-2 py-1" style={{ border: "1px solid var(--line)", fontSize: 11, width: 110 }} />
                      <button type="submit" className="btn btn-sm" style={{ fontSize: 11, padding: "3px 8px", borderColor: "var(--red)", color: "var(--red)" }}>{tr("case.void")}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* add a step */}
      <h3 id="add" className="font-bold mt-6 mb-1" style={{ color: "var(--green-dark)" }}>{tr("case.addStep")}</h3>
      <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>{tr("case.addHint")}</p>
      {/* a testing scheme's object goes out through «Доставки» — the shipment on record and the participation told (5.6) */}
      {s?.type === "T" && (
        <p className="text-xs mb-2" data-dispatch-via-deliveries={sp.step === "dispatch" ? "refused" : "1"} style={{ color: sp.step === "dispatch" ? "#8f2f2f" : "var(--muted)" }}>
          {sp.step === "dispatch" ? `${L("Изпращането не е записано тук.", "The dispatch was not recorded here.")} ` : ""}
          {L("Изпращането на обекта при изпитване се записва в ", "A testing object's dispatch is recorded in ")}<Link href={`/deliveries?scheme=${encodeURIComponent(id)}`}>{L("«Доставки»", "«Deliveries»")}</Link>{L(" — там е пратката и известието до участието.", " — the shipment and the notice to the participation are there.")}
        </p>
      )}
      <form action={addCaseEventAction} className="grid gap-3 items-end" style={{ gridTemplateColumns: "1.4fr 1fr 1.4fr auto" }}>
        <input type="hidden" name="schemeId" value={id} />
        <input type="hidden" name="code" value={code} />
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <label className="block"><span className="block mb-0.5" style={labelStyle}>{tr("case.kind")}</span>
          <select name="kind" className={inputCls} style={inputStyle} defaultValue={preKind}>
            {MANUAL_KINDS.filter((k) => !(k === "items_dispatched" && s?.type === "T")).map((k) => <option key={k} value={k}>{tr(`casekind.${k}`)}</option>)}
          </select></label>
        <label className="block"><span className="block mb-0.5" style={labelStyle}>{tr("case.date")}</span>
          <input name="at" type="date" defaultValue={today} className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block mb-0.5" style={labelStyle}>{tr("case.ref")}</span>
          <input name="ref" className={inputCls} style={inputStyle} /></label>
        <button type="submit" className="btn btn-primary">{tr("case.addButton")}</button>
        <label className="block" style={{ gridColumn: "1 / 3" }}><span className="block mb-0.5" style={labelStyle}>{tr("case.docKey")}</span>
          <select name="docKey" className={inputCls} style={inputStyle} defaultValue="">
            <option value=""></option>
            {DOCUMENTS.map((d) => <option key={d.key} value={d.key}>{lang === "bg" ? d.nameBg : d.nameEn}</option>)}
          </select></label>
        <label className="block" style={{ gridColumn: "3 / -1" }}><span className="block mb-0.5" style={labelStyle}>{tr("case.note")}</span>
          <input name="note" className={inputCls} style={inputStyle} /></label>
      </form>

      {/* files the lab uploaded from its portal (signed protocol / results sheet) */}
      <h2 className="text-lg font-bold mt-7 mb-2 pb-1" style={{ color: "var(--green-dark)", borderBottom: "2px solid var(--red)" }}>
        {tr("case.labFiles")}
      </h2>
      <div className="card p-4">
        {/* These are the lab's own signed files (its letterhead names it), so the
            links are manager-only (§4.2) — same boundary as the name reveal above.
            A non-manager sees only that files exist, never their content. */}
        {!canReveal ? (
          <p className="text-sm" style={labelStyle}>{tr("case.revealHint")}</p>
        ) : (
          <>
            {(["protocol", "results"] as const).map((slot) => {
              const up = s.labUploads?.[code]?.[slot];
              if (!up) return null;
              return (
                <div key={slot} className="flex items-center gap-3 flex-wrap" style={{ padding: "4px 0" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--green-dark)" }}>
                    📄 {tr(`casekind.${slot === "protocol" ? "receipt_confirmed" : "results_returned"}`)}
                  </span>
                  <span style={{ fontSize: 13 }}>{up.name}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{fmtDate(up.uploadedAt.slice(0, 10))} · {(up.size / 1_000_000).toFixed(1)} MB</span>
                  <a href={`/schemes/${id}/lab-uploads/${encodeURIComponent(code)}/${slot}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ fontSize: 12 }}>↗</a>
                  <a href={`/schemes/${id}/lab-uploads/${encodeURIComponent(code)}/${slot}?download=1`} className="btn btn-sm" style={{ fontSize: 12 }}>{tr("case.download")}</a>
                </div>
              );
            })}
            {!s.labUploads?.[code]?.protocol && !s.labUploads?.[code]?.results && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>{tr("case.labFilesNone")}</p>
            )}
          </>
        )}
      </div>

      {/* results */}
      <h2 className="text-lg font-bold mt-7 mb-2 pb-1" style={{ color: "var(--green-dark)", borderBottom: "2px solid var(--red)" }}>
        {tr("case.results")}
      </h2>
      <div className="card p-4">
        <p className="text-sm">
          {reportedCount > 0
            ? <span><strong>{reportedCount}</strong> · {tr("case.resultsReported")}</span>
            : <span style={{ color: "var(--muted)" }}>{tr("case.resultsNone")}</span>}
        </p>
        <Link href={`/schemes/${id}/results`} className="btn btn-sm mt-2 inline-block" style={{ fontSize: 13 }}>
          {tr("case.viewCombined")} →
        </Link>
      </div>
    </div>
  );
}
