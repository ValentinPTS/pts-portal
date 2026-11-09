"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadLabDocAction, removeLabDocAction, setParticipantPaidAction } from "@/lib/actions";

// The proforma and the original invoice for ONE participation, each with its number, and the
// «платена» note beside them (plan part 5.8; Реш. 35, 36, 96).
//
// The portal issues no invoice and makes no number: both are made in the accounting software,
// and their numbers typed here as they are there. The proforma after the second announcement
// (Реш. 65); the original invoice only after the payment — «Неплатена оригинална фактура не
// съществува» (Реш. 35). Putting a document in its slot sends it — every user of the
// organisation sees it and is told. Ticking «платена» records that the money arrived and does
// nothing else: it holds nothing back (Реш. 96).

const ACCEPT = "application/pdf,image/png,image/jpeg";
type Slot = "proforma" | "invoice";
interface Held { name?: string; uploadedAt?: string; number?: string }

export default function LabInvoicePanel({
  schemeId, code, lang, proforma, invoice, paidAt, notHeld = false, notYet,
}: {
  schemeId: string;
  code: string;
  lang: "bg" | "en";
  proforma?: Held;
  invoice?: Held;
  paidAt?: string;
  // the scheme is not held: nothing is invoiced (О9, Реш. 129, part 3.2)
  notHeld?: boolean;
  // not invoiced yet: before the second announcement, or not on its final list (5.2; Реш. 65)
  notYet?: "before-second" | "not-final";
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  // Optimistic, so the tick responds at once instead of after a round-trip.
  const [paid, setPaid] = useState(!!paidAt);
  const [numbers, setNumbers] = useState<Record<Slot, string>>({ proforma: proforma?.number ?? "", invoice: invoice?.number ?? "" });
  const [pending, setPendingSlot] = useState<Slot>("proforma");

  const base = (slot: Slot) => `/schemes/${schemeId}/lab-docs/${encodeURIComponent(code)}/${slot}`;
  const label = (slot: Slot) => (slot === "proforma" ? L("Проформа фактура", "Proforma invoice") : L("Оригинална фактура", "Original invoice"));

  function pick(slot: Slot) {
    if (!numbers[slot].trim()) { alert(L("Първо напишете номера на документа от счетоводния софтуер.", "First type the document's number from the accounting software.")); return; }
    setPendingSlot(slot);
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const slot = pending;
    if (!window.confirm(L(
      `Качването изпраща ${slot === "proforma" ? "проформата" : "фактурата"} (№ ${numbers[slot].trim()}) на участието веднага — всички потребители на организацията ще я видят в портала и ще получат известие. Да продължа ли?`,
      `Uploading sends the ${slot === "proforma" ? "proforma" : "invoice"} (No. ${numbers[slot].trim()}) to the participation straight away — every user of the organisation will see it in the portal and be told. Continue?`,
    ))) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("schemeId", schemeId);
    fd.append("code", code);
    fd.append("slot", slot);
    fd.append("number", numbers[slot].trim());
    fd.append("file", file);
    const r = await uploadLabDocAction(fd);
    setBusy(false);
    if (r?.error) { alert(r.error); return; }
    router.refresh();
  }

  function remove(slot: Slot) {
    if (!window.confirm(L(
      `Да премахна ли ${slot === "proforma" ? "проформата" : "фактурата"}? Участието няма да може да я изтегли повече (файлът се пази).`,
      `Remove the ${slot === "proforma" ? "proforma" : "invoice"}? The participation will no longer be able to download it (the file is kept).`,
    ))) return;
    setBusy(true);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("schemeId", schemeId);
      fd.append("code", code);
      fd.append("slot", slot);
      const r = await removeLabDocAction(fd);
      setBusy(false);
      if (r?.error) { alert(r.error); return; }
      router.refresh();
    });
  }

  function togglePaid(next: boolean) {
    setPaid(next);
    startTransition(async () => {
      const r = await setParticipantPaidAction(schemeId, code, next);
      if (r?.error) { setPaid(!next); alert(r.error); return; }
      router.refresh();
    });
  }

  const fmt = (iso?: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
    return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
  };

  const row = (slot: Slot, held: Held | undefined, enabled: boolean, why?: string) => (
    <div className="flex items-center gap-3 mt-3 flex-wrap" style={{ fontSize: 13 }} data-invoice-slot={slot} data-invoice-held={held?.name ? "1" : "0"}>
      <b style={{ minWidth: 150 }}>{label(slot)}</b>
      {held?.name ? (
        <>
          <span data-doc-number-held={slot}>№ {held.number || "—"}</span>
          <a href={base(slot)} target="_blank" rel="noopener" className="btn btn-sm" style={{ fontSize: 12 }}>◱ {held.name}</a>
          <a href={`${base(slot)}?download=1`} target="_blank" rel="noopener" className="btn btn-sm" style={{ fontSize: 12 }}>⬇ {L("Свали", "Download")}</a>
          <button className="btn btn-sm" style={{ fontSize: 12, borderColor: "var(--red)", color: "var(--red)" }} onClick={() => remove(slot)}>🗑 {L("Премахни", "Remove")}</button>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>{L("изпратена", "sent")} {fmt(held.uploadedAt)}</span>
        </>
      ) : enabled ? (
        <>
          <label className="flex items-center gap-1" style={{ fontSize: 12, color: "var(--muted)" }}>№
            <input data-doc-number={slot} value={numbers[slot]} maxLength={40} onChange={(e) => setNumbers((n) => ({ ...n, [slot]: e.target.value }))}
              aria-label={L(`Номер на ${slot === "proforma" ? "проформата" : "фактурата"} от счетоводния софтуер`, `The ${slot === "proforma" ? "proforma's" : "invoice's"} number from the accounting software`)}
              style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "3px 6px", fontSize: 13, width: 150 }} />
          </label>
          <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} onClick={() => pick(slot)}>＋ {slot === "proforma" ? L("Качи проформа", "Upload proforma") : L("Качи фактура", "Upload invoice")}</button>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>{L("Качването я изпраща на участието веднага.", "Uploading sends it to the participation straight away.")}</span>
        </>
      ) : (
        <span data-invoice-not-yet={slot} style={{ color: "var(--muted)", fontSize: 12 }}>{why}</span>
      )}
    </div>
  );

  const proformaWhy = notHeld ? L("Схемата не се състои — нищо не се фактурира.", "The scheme is not held — nothing is invoiced.")
    : notYet === "before-second" ? L("Проформа се издава само след второто обявяване (Реш. 65).", "A proforma is issued only after the second announcement (Реш. 65).")
    : notYet === "not-final" ? L("Участието не е в окончателния списък — не продължава и не се фактурира.", "The participation is not on the final list — it goes no further and is not invoiced.") : undefined;

  return (
    <div className="card mt-4 p-4" style={{ opacity: busy ? 0.6 : 1 }}>
      <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onFile} />
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-bold" style={{ color: "var(--green-dark)", flex: 1 }}>
          {L("Проформа, фактура и плащане", "Proforma, invoice & payment")}
        </h2>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer", fontWeight: 700, color: paid ? "var(--green-dark)" : "var(--muted)" }}>
          <input type="checkbox" checked={paid} onChange={(e) => togglePaid(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--green-dark)" }} />
          {L("Платена", "Paid")}
          {paid && paidAt ? <span style={{ fontWeight: 400, color: "var(--muted)" }}>· {fmt(paidAt)}</span> : null}
        </label>
      </div>
      {/* the proforma — refused before the second announcement or off the list, said so */}
      {(proforma?.name || !proformaWhy)
        ? row("proforma", proforma, true)
        : <div className="mt-3" style={{ fontSize: 13 }}><span {...(notHeld ? { "data-not-invoiced": "" } : { "data-not-invoiced-yet": notYet })} style={{ color: "var(--muted)", fontSize: 12 }}>{proformaWhy}</span></div>}
      {/* the original invoice — only after the payment (Реш. 35) */}
      {!notHeld && (proforma?.name || invoice?.name) && row("invoice", invoice, paid, L("Оригиналната фактура се качва след плащането — отбележете «Платена» (Реш. 35).", "The original invoice is uploaded after the payment — mark «Paid» (Реш. 35)."))}
    </div>
  );
}
