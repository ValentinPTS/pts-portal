"use client";

import { useActionState } from "react";
import { lookupCertificateAction, type CertLookupState } from "@/lib/actions";

// The portal's lookup page's form (plan part 10.4; D20 option B; Реш. 55, 56, 115): the number (filled in
// from a QR code's link) and the code its holder types — never in a link; posted, never a GET.
export default function CertificateLookup({ number, lang }: { number: string; lang: "bg" | "en" }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const [state, action, pending] = useActionState<CertLookupState, FormData>(lookupCertificateAction, { state: "idle" });
  const field = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #36422c", background: "#f4f6f1", color: "#10140d", fontSize: 16 } as const;
  return (
    <div>
      <form action={action} data-cert-form style={{ display: "grid", gap: 12, maxWidth: 460, margin: "0 auto" }}>
        <label>{L("Номер на сертификата", "The certificate's number")}<input name="number" defaultValue={state.state === "idle" ? number : state.number} maxLength={60} required autoComplete="off" style={field} /></label>
        <label>{L("Код на лабораторията (от сертификата)", "The laboratory's code (from the certificate)")}<input name="code" maxLength={40} required autoComplete="off" style={field} /></label>
        <button type="submit" className="btn btn-primary" disabled={pending} data-cert-submit>{L("Провери", "Check")}</button>
      </form>
      {state.state !== "idle" && (
        <div className="mt-6 mx-auto" style={{ maxWidth: 560 }} data-cert-result={state.state} role="status">
          {state.state === "valid" ? (
            <div style={{ background: "#1b2016", border: "1px solid #36422c", borderRadius: 14, padding: "16px 20px" }}>
              <div style={{ fontWeight: 700, fontSize: 20, color: "var(--green-light)" }}>{L("Валиден", "Valid")}</div>
              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", marginTop: 10 }}>
                <dt>{L("Лаборатория", "Laboratory")}</dt><dd data-cert-lab>{state.answer.laboratory}</dd>
                <dt>{L("Вид", "Kind")}</dt><dd>{L(state.answer.kind.bg, state.answer.kind.en)}{state.answer.activity ? ` · ${L(state.answer.activity.bg, state.answer.activity.en)}` : ""}</dd>
                <dt>{L("Обект", "Object")}</dt><dd>{L(state.answer.object.bg || state.answer.object.en, state.answer.object.en || state.answer.object.bg)}</dd>
                <dt>{L("Характеристики", "Characteristics")}</dt><dd>{state.answer.characteristics.map((c) => L(c.bg || c.en, c.en || c.bg)).join(" · ")}</dd>
                <dt>{L("Номер", "Number")}</dt><dd data-cert-no>{state.answer.number}</dd>
                <dt>{L("Дата", "Date")}</dt><dd>{state.answer.date}</dd>
              </dl>
            </div>
          ) : (
            <p style={{ color: "#f0c98a", textAlign: "center" }}>{state.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
