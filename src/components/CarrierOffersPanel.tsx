"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCarrierOfferAction, removeCarrierOfferAction, sendCarrierOffersAction, recordCarrierChoiceAction, cancelCarrierChoiceAction } from "@/lib/actions";
import type { CarrierRecord } from "@/lib/carrier-model";

// The carriers' offers for one participation (plan part 9.5; Реш. 128) — PTS enters them (up to five),
// withdraws one before a choice, sends them to the laboratory (a notice held for release, 1.8), and may
// record the choice the laboratory sent by e-mail, and cancel a choice with its reason. The choice is
// once; a withdrawn offer and a cancelled choice stay on record.
const eur = (c: number, lang: "bg" | "en") => `${(c / 100).toFixed(2).replace(".", lang === "bg" ? "," : ".")} €`;
export default function CarrierOffersPanel({ lang, schemeId, participantId, rec }: { lang: "bg" | "en"; schemeId: string; participantId: string; rec: CarrierRecord | null }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { error: string }>, after?: () => void) => start(async () => { setError(null); const r = await fn(); if ("error" in r) setError(r.error); else { after?.(); router.refresh(); } });
  const offers = (rec?.offers ?? []).filter((o) => !o.withdrawnAt);
  const withdrawn = (rec?.offers ?? []).filter((o) => o.withdrawnAt);
  const [reason, setReason] = useState("");
  const chosen = rec?.choice ? offers.find((o) => o.id === rec.choice!.offerId) : undefined;
  const field = { border: "1px solid var(--line)", borderRadius: 6, padding: "3px 6px", fontSize: 12.5 } as const;
  return (
    <details className="mt-1" data-carrier-offers={participantId} open={!chosen && offers.length > 0}>
      <summary className="text-xs" style={{ cursor: "pointer", fontWeight: 700, color: "#7a5416" }}>
        {chosen ? L(`превозвач: ${chosen.carrier}, ${eur(chosen.cents, lang)}${rec?.choice?.byPts ? " (записан от PTS)" : ""}`, `carrier: ${chosen.carrier}, ${eur(chosen.cents, lang)}${rec?.choice?.byPts ? " (recorded by PTS)" : ""}`) : L(`оферти на превозвачи (${offers.length})`, `carriers' offers (${offers.length})`)}
      </summary>
      <div style={{ display: "grid", gap: 4, marginTop: 4, fontSize: 12.5 }}>
        {offers.map((o) => (
          <div key={o.id} data-carrier-offer={o.id} data-carrier-chosen={chosen?.id === o.id ? "1" : "0"} className="flex gap-2 items-center" style={{ flexWrap: "wrap" }}>
            <b>{o.carrier}</b> · {eur(o.cents, lang)}{o.days ? ` · ${o.days} ${L("дни", "days")}` : ""}{o.note ? ` · ${o.note}` : ""}
            {!chosen && <button type="button" className="btn btn-sm" data-carrier-remove={o.id} disabled={pending} onClick={() => run(() => removeCarrierOfferAction(schemeId, participantId, o.id))}>{L("Оттегли", "Withdraw")}</button>}
            {!chosen && <button type="button" className="btn btn-sm" data-carrier-record={o.id} disabled={pending} onClick={() => { if (window.confirm(L("Да се запише ли тази оферта като избора на лабораторията (изпратен на PTS)? Изборът е еднократен.", "Record this offer as the laboratory's choice (sent to PTS)? The choice is once."))) run(() => recordCarrierChoiceAction(schemeId, participantId, o.id)); }}>{L("Запиши като избор на лабораторията", "Record as the laboratory's choice")}</button>}
          </div>
        ))}
        {!chosen && offers.length < 5 && (
          <form data-carrier-add={participantId} className="flex gap-2 items-center" style={{ flexWrap: "wrap" }}
            onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const el = e.currentTarget; run(() => addCarrierOfferAction(schemeId, participantId, { carrier: fd.get("carrier"), price: fd.get("price"), days: fd.get("days"), note: fd.get("note") }), () => el.reset()); }}>
            <input name="carrier" required maxLength={80} placeholder={L("превозвач", "carrier")} style={field} />
            <input name="price" required placeholder={L("цена, €", "price, €")} style={{ ...field, width: 90 }} />
            <input name="days" placeholder={L("дни", "days")} style={{ ...field, width: 60 }} />
            <input name="note" maxLength={200} placeholder={L("бележка", "note")} style={field} />
            <button type="submit" className="btn btn-sm" disabled={pending}>{L("Добави оферта", "Add an offer")}</button>
          </form>
        )}
        {!chosen && offers.length > 0 && (
          <div className="flex gap-2 items-center" style={{ flexWrap: "wrap" }}>
            <button type="button" className="btn btn-sm btn-primary" data-carrier-send={participantId} disabled={pending} onClick={() => run(() => sendCarrierOffersAction(schemeId, participantId))}>{rec?.sent ? L("Изпрати офертите отново", "Send the offers again") : L("Изпрати офертите на лабораторията", "Send the offers to the laboratory")}</button>
            {rec?.sent
              ? <span className="text-xs" data-carrier-sent style={{ color: "var(--muted)" }}>{L(`изпратени ${rec.sent.at.slice(0, 10)} — лабораторията ги вижда, щом известието бъде освободено в «Известия»`, `sent ${rec.sent.at.slice(0, 10)} — the laboratory sees them once the notice is released in «Notices»`)}</span>
              : <span className="text-xs" data-carrier-unsent style={{ color: "#7a5416" }}>{L("не са изпратени (или са променени след изпращането)", "not sent (or changed since)")}</span>}
          </div>
        )}
        {chosen && (
          <div className="flex gap-2 items-center" style={{ flexWrap: "wrap" }} data-carrier-cancel={participantId}>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={L("причина за промяната", "the reason for the change")} style={{ ...field, minWidth: 220 }} />
            <button type="button" className="btn btn-sm" disabled={pending} onClick={() => { if (window.confirm(L("Да се отмени ли изборът на превозвач? Участието отново чака избор; нужни са нови оферти.", "Cancel the carrier's choice? The participation waits for its choice again; new offers are needed."))) run(() => cancelCarrierChoiceAction(schemeId, participantId, reason)); }}>{L("Отмени избора", "Cancel the choice")}</button>
          </div>
        )}
        {(withdrawn.length > 0 || (rec?.cancelled?.length ?? 0) > 0) && (
          <div className="text-xs" style={{ color: "var(--muted)" }} data-carrier-history>
            {withdrawn.map((o) => <div key={o.id}>{L("оттеглена", "withdrawn")}: {o.carrier} · {eur(o.cents, lang)} · {o.withdrawnAt?.slice(0, 10)}</div>)}
            {(rec?.cancelled ?? []).map((c, i) => <div key={i}>{L("отменен избор", "choice cancelled")}: {c.cancelledAt.slice(0, 10)} — {c.reason}</div>)}
          </div>
        )}
        {error && <div role="alert" data-carrier-error style={{ color: "#8f2f2f" }}>{error}</div>}
      </div>
    </details>
  );
}
