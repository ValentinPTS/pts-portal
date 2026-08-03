"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadLabDocAction, removeLabDocAction, setParticipantPaidAction } from "@/lib/actions";

// The proforma invoice for ONE participation, and the "платена" note beside it.
//
// Two deliberately unconnected things sit here because they are one job on the
// screen. Putting the invoice in the slot sends it — the laboratory can download
// it immediately and is told. Ticking платена records that the money arrived, and
// does nothing else: it does not release the invoice, does not move the round on,
// and does not have to follow the invoice in time. Payment is settled outside the
// app by the accountant; this is the owner's own note of who still owes.

const ACCEPT = "application/pdf,image/png,image/jpeg";

export default function LabInvoicePanel({
  schemeId, code, lang, fileName, uploadedAt, paidAt,
}: {
  schemeId: string;
  code: string;
  lang: "bg" | "en";
  fileName?: string;
  uploadedAt?: string;
  paidAt?: string;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  // Optimistic, so the tick responds at once instead of after a round-trip.
  const [paid, setPaid] = useState(!!paidAt);

  const base = `/schemes/${schemeId}/lab-docs/${encodeURIComponent(code)}/proforma`;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm(L(
      "Качването изпраща проформата на тази лаборатория веднага — тя ще я види в портала и ще получи известие. Да продължа ли?",
      "Uploading sends the proforma to this laboratory straight away — it will see the invoice in its portal and be notified. Continue?",
    ))) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("schemeId", schemeId);
    fd.append("code", code);
    fd.append("slot", "proforma");
    fd.append("file", file);
    const r = await uploadLabDocAction(fd);
    setBusy(false);
    if (r?.error) { alert(r.error); return; }
    router.refresh();
  }

  function remove() {
    if (!window.confirm(L(
      "Да премахна ли проформата? Лабораторията няма да може да я изтегли повече.",
      "Remove the proforma? The laboratory will no longer be able to download it.",
    ))) return;
    setBusy(true);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("schemeId", schemeId);
      fd.append("code", code);
      fd.append("slot", "proforma");
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

  return (
    <div className="card mt-4 p-4" style={{ opacity: busy ? 0.6 : 1 }}>
      <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onFile} />
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-bold" style={{ color: "var(--green-dark)", flex: 1 }}>
          {L("Проформа фактура и плащане", "Proforma invoice & payment")}
        </h2>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer", fontWeight: 700, color: paid ? "var(--green-dark)" : "var(--muted)" }}>
          <input type="checkbox" checked={paid} onChange={(e) => togglePaid(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--green-dark)" }} />
          {L("Платена", "Paid")}
          {paid && paidAt ? <span style={{ fontWeight: 400, color: "var(--muted)" }}>· {fmt(paidAt)}</span> : null}
        </label>
      </div>

      <div className="flex items-center gap-8 mt-3 flex-wrap" style={{ fontSize: 13 }}>
        {fileName ? (
          <>
            <a href={base} target="_blank" rel="noopener" className="btn btn-sm" style={{ fontSize: 12 }}>◱ {fileName}</a>
            <a href={`${base}?download=1`} target="_blank" rel="noopener" className="btn btn-sm" style={{ fontSize: 12 }}>⬇ {L("Свали", "Download")}</a>
            <button className="btn btn-sm" style={{ fontSize: 12 }} onClick={() => fileRef.current?.click()}>⟳ {L("Замени", "Replace")}</button>
            <button className="btn btn-sm" style={{ fontSize: 12, borderColor: "var(--red)", color: "var(--red)" }} onClick={remove}>🗑 {L("Премахни", "Remove")}</button>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              {L("изпратена", "sent")} {fmt(uploadedAt)}
            </span>
          </>
        ) : (
          <>
            <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} onClick={() => fileRef.current?.click()}>
              ＋ {L("Качи проформа", "Upload proforma")}
            </button>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              {L("Качването я изпраща на лабораторията веднага.", "Uploading sends it to the laboratory straight away.")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
