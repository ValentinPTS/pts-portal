"use client";

import { useRef, useState, type CSSProperties, type FormEvent } from "react";
import { submitApplicationAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";

type Param = { standard: string; characteristic: string };

// Field + its styles live at MODULE scope on purpose. A component DEFINED INSIDE
// another component is a brand-new type on every render, so React remounts every
// input whenever `step` changes — silently CLEARING whatever the user typed. Once
// the fields are cleared, the final submit posts an empty labName/email and the
// server bounces back to /apply/[id] (which reloads the wizard at step 1 — the bug
// that looked like "step 3 sends me to step 1"). Hoisting Field out keeps the inputs
// mounted and their values intact across steps.
const inputStyle: CSSProperties = {
  width: "100%", background: "#e9eef0", border: "1px solid #2b3422", borderRadius: 10,
  padding: "12px 14px", color: "#10140d", fontSize: "1rem",
};
const labelStyle: CSSProperties = { display: "block", marginBottom: 6, color: "#cdd6c2", fontSize: "0.95rem" };

function Field({ name, label, req, type = "text" }: { name: string; label: string; req?: boolean; type?: string }) {
  return (
    <label className="block">
      <span style={labelStyle}>
        {label} {req && <span style={{ color: "var(--green-light)" }}>*</span>}
      </span>
      <input name={name} type={type} style={inputStyle} />
    </label>
  );
}

export default function ApplyWizard({
  schemeId,
  number,
  titleBg,
  titleEn,
  objectBg,
  objectEn,
  params,
}: {
  schemeId: string;
  number: string;
  titleBg: string;
  titleEn: string;
  objectBg: string;
  objectEn: string;
  params: Param[];
}) {
  const { lang } = useLang();
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);

  // Per-step validation → a specific, translated message (or null when the step is
  // OK). We do NOT rely on the browser's native HTML5 validation: the hidden
  // (display:none) steps make an invalid field "not focusable", which silently blocks
  // the whole submit (the reason "Изпрати" appeared to do nothing). The form carries
  // `noValidate`, and this runs on both Next and the final Submit.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function fieldVal(name: string): string {
    const el = formRef.current?.elements.namedItem(name) as HTMLInputElement | null;
    return el?.value.trim() ?? "";
  }
  function validateStep(stepNo: number): string | null {
    if (stepNo === 1) {
      if (fieldVal("labName").length < 2) return L("Въведете име на лабораторията (поне 2 символа).", "Enter the laboratory name (at least 2 characters).");
      if (fieldVal("manager").length < 2) return L("Въведете ръководител.", "Enter the manager’s name.");
      if (fieldVal("contactPerson").length < 2) return L("Въведете лице за контакт.", "Enter a contact person.");
      if (!EMAIL_RE.test(fieldVal("email"))) return L("Въведете валиден имейл адрес.", "Enter a valid e-mail address.");
      if (fieldVal("phone").length < 3) return L("Въведете телефон за връзка.", "Enter a contact phone number.");
    }
    if (stepNo === 2) {
      if (fieldVal("deliveryAddress").length < 2) return L("Въведете адрес за доставка на пробите.", "Enter the delivery address for the samples.");
      if (fieldVal("postalCode").length < 2) return L("Въведете пощенски код.", "Enter the postal code.");
    }
    if (stepNo === 3) {
      const any = params.some((_, i) => parseInt(fieldVal(`sel_${i}`) || "0", 10) > 0);
      if (!any) return L("Изберете поне един обект (брой участия > 0).", "Select at least one item (participations > 0).");
    }
    return null;
  }

  function next() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError("");
    setStep((s) => Math.min(3, s + 1));
  }
  function back() {
    setError("");
    setStep((s) => Math.max(1, s - 1));
  }

  // Final submit — validate EVERY step; on the first problem, jump to that step and
  // show the message instead of dispatching the server action.
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    for (const s of [1, 2, 3]) {
      const err = validateStep(s);
      if (err) { e.preventDefault(); setStep(s); setError(err); return; }
    }
    // all steps valid → let the form dispatch submitApplicationAction
  }

  const steps = [
    L("Основна информация", "Basic information"),
    L("Детайли", "Details"),
    L("Обекти на изпитването", "Test items"),
  ];

  return (
    <div>
      <div className="flex items-center justify-center gap-3">
        <h1 className="text-4xl font-bold text-center">{L("Заявка за участие", "Application to participate")}</h1>
      </div>
      <div className="text-center mt-1" style={{ color: "#aab59c" }}>
        № {number} — {L(titleBg, titleEn)}
      </div>
      <div className="mx-auto mt-3" style={{ width: 60, height: 3, background: "var(--green)" }} />

      {/* step indicator */}
      <div
        className="flex items-center mt-6"
        style={{ background: "#26301c", borderRadius: 40, padding: 6, gap: 4 }}
      >
        {steps.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          return (
            <div
              key={n}
              className="flex items-center gap-3"
              style={{
                flex: 1,
                justifyContent: "center",
                padding: "12px 10px",
                borderRadius: 32,
                background: active ? "var(--green)" : "transparent",
                color: active ? "#10140d" : "#cdd6c2",
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: active ? "#10140d" : "#3a472f",
                  color: active ? "#fff" : "#cdd6c2",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.85rem",
                }}
              >
                {n}
              </span>
              <span className="text-sm">{label}</span>
            </div>
          );
        })}
      </div>

      <form ref={formRef} action={submitApplicationAction} onSubmit={handleSubmit} noValidate className="mt-8">
        <input type="hidden" name="schemeId" value={schemeId} />
        {/* honeypot — hidden from humans; bots fill it and get silently dropped */}
        <input
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
        />

        {/* STEP 1 */}
        <div style={{ display: step === 1 ? "block" : "none" }}>
          <h2 className="text-2xl font-bold text-center mb-6">{L("Основна информация", "Basic information")}</h2>
          <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field name="labName" label={L("Име на изпитвателна лаборатория", "Testing laboratory name")} req />
            <Field name="accreditationCert" label={L("Сертификат за акредитация", "Accreditation certificate")} />
            <Field name="manager" label={L("Ръководител", "Manager")} req />
            <Field name="contactPerson" label={L("Лице за контакт", "Contact person")} req />
            <Field name="email" label={L("E-mail за контакт", "Contact e-mail")} req type="email" />
            <Field name="phone" label={L("Телефон за връзка", "Contact phone")} req />
          </div>
        </div>

        {/* STEP 2 */}
        <div style={{ display: step === 2 ? "block" : "none" }}>
          <h2 className="text-2xl font-bold text-center mb-6">{L("Моля, въведете данни за фактура", "Invoice details")}</h2>
          <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field name="companyName" label={L("Име на дружеството", "Company name")} />
            <Field name="registeredAddress" label={L("Адрес по регистрация", "Registered address")} />
            <Field name="eik" label={L("ЕИК", "Company ID (ЕИК)")} />
            <Field name="vat" label={L("ДДС номер", "VAT number")} />
            <Field name="mol" label={L("МОЛ", "Responsible person (МОЛ)")} />
            <Field name="deliveryAddress" label={L("Адрес за доставка на пробите", "Delivery address for the samples")} req />
            <Field name="postalCode" label={L("Пощенски код", "Postal code")} req />
          </div>
        </div>

        {/* STEP 3 */}
        <div style={{ display: step === 3 ? "block" : "none" }}>
          <h2 className="text-2xl font-bold text-center mb-2">{L("Брой участия на обект", "Number of participations per item")}</h2>
          <p className="text-center mb-6" style={{ color: "#aab59c" }}>
            {L("Въведете брой участия за всяка заявена характеристика (0 = без заявка).", "Enter the number of participations for each requested characteristic (0 = not requested).")}
          </p>
          <div style={{ background: "#1b2016", border: "1px solid #36422c", borderRadius: 14, overflow: "hidden" }}>
            <div
              className="text-center"
              style={{ background: "var(--green-dark)", color: "#fff", fontWeight: 800, padding: "12px", textTransform: "uppercase", letterSpacing: 1 }}
            >
              {L(objectBg, objectEn)}
            </div>
            <div className="grid gap-x-8 gap-y-5 p-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {params.map((p, i) => (
                <div key={i} className="flex items-start gap-3">
                  <input
                    name={`sel_${i}`}
                    type="number"
                    min="0"
                    defaultValue="0"
                    style={{ width: 64, background: "#e9eef0", border: "1px solid #2b3422", borderRadius: 8, padding: "8px 10px", color: "#10140d", textAlign: "center" }}
                  />
                  <div style={{ color: "#e7ece1", fontSize: "0.95rem" }}>
                    <div style={{ color: "var(--green-light)", fontWeight: 700 }}>{p.standard}</div>
                    <div style={{ color: "#cdd6c2" }}>{p.characteristic}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 text-center" style={{ color: "#f0a8a8" }}>
            {error}
          </div>
        )}

        {/* navigation */}
        <div className="flex items-center mt-8" style={{ gap: 12 }}>
          {step > 1 && (
            <button type="button" onClick={back} className="btn" style={{ background: "transparent", color: "var(--green-light)", borderColor: "var(--green)" }}>
              {L("Назад", "Back")}
            </button>
          )}
          <div style={{ marginLeft: "auto" }}>
            {step < 3 ? (
              <button type="button" onClick={next} className="btn btn-primary">
                {step === 1 ? L("Напред към детайли", "Next: details") : L("Напред към тестовете", "Next: test items")}
              </button>
            ) : (
              <button type="submit" className="btn btn-primary">
                {L("Изпрати заявката", "Submit application")}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
