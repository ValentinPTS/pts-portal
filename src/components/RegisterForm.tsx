"use client";

import { useState } from "react";
import { submitLabApplicationAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";

// EU-27 (VIES-covered). Selecting one shows the ЕИК/VAT fields; "Other" switches to
// the document-upload path for laboratories outside the EU.
const EU_COUNTRIES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark", "Estonia",
  "Finland", "France", "Germany", "Greece", "Hungary", "Ireland", "Italy", "Latvia",
  "Lithuania", "Luxembourg", "Malta", "Netherlands", "Poland", "Portugal", "Romania",
  "Slovakia", "Slovenia", "Spain", "Sweden",
];
const OTHER = "__other__";

const input = "w-full rounded px-3 py-2 mt-1";
const inputStyle = { border: "1px solid var(--line)", background: "#fff" } as const;

export default function RegisterForm({ errorCode }: { errorCode?: string }) {
  const { lang } = useLang();
  const bg = lang === "bg";
  const [sel, setSel] = useState("");
  const [otherCountry, setOtherCountry] = useState("");
  const [docNames, setDocNames] = useState<string[]>([]);
  const isOther = sel === OTHER;
  const region = isOther ? "non_eu" : "eu";
  const country = isOther ? otherCountry : sel;

  const L = (en: string, bgTxt: string) => (bg ? bgTxt : en);
  const errText: Record<string, string> = {
    missing: L("Please fill in the required fields.", "Моля, попълнете задължителните полета."),
    filetype: L("Documents must be PDF, PNG, JPG or WEBP.", "Документите трябва да са PDF, PNG, JPG или WEBP."),
    filesize: L("Each document must be under 5 MB.", "Всеки документ трябва да е под 5 MB."),
    docs: L("Please attach at least one document.", "Моля, прикачете поне един документ."),
  };

  return (
    <div className="card p-6 mx-auto mt-8" style={{ maxWidth: 620 }}>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>
        {L("Apply for a laboratory account", "Заявка за акаунт на лаборатория")}
      </h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
        {L(
          "Tell us about your laboratory. PTS reviews every request before an account is created — you'll be contacted once it's approved.",
          "Разкажете ни за Вашата лаборатория. PTS преглежда всяка заявка преди създаване на акаунт — ще се свържем с Вас след одобрение.",
        )}
      </p>

      {errorCode && errText[errorCode] && (
        <p className="text-sm mt-3" style={{ color: "var(--red)" }}>{errText[errorCode]}</p>
      )}

      <form action={submitLabApplicationAction} className="mt-4">
        {/* honeypot — real people never fill this; bots do. Hidden from view + a11y. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
        <input type="hidden" name="region" value={region} />
        <input type="hidden" name="country" value={country} />

        <label className="block text-sm" style={{ color: "var(--muted)" }}>
          {L("Laboratory / organisation name", "Име на лаборатория / организация")} *
          <input name="orgName" required maxLength={200} className={input} style={inputStyle} />
        </label>

        <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="block text-sm" style={{ color: "var(--muted)" }}>
            {L("Contact person", "Лице за контакт")} *
            <input name="contactPerson" required maxLength={160} className={input} style={inputStyle} />
          </label>
          <label className="block text-sm" style={{ color: "var(--muted)" }}>
            {L("Phone", "Телефон")}
            <input name="phone" maxLength={60} className={input} style={inputStyle} />
          </label>
        </div>

        <label className="block text-sm mt-3" style={{ color: "var(--muted)" }}>
          {L("E-mail (this becomes the login)", "Имейл (той става потребител за вход)")} *
          <input name="email" type="email" required maxLength={200} className={input} style={inputStyle} />
        </label>

        <label className="block text-sm mt-3" style={{ color: "var(--muted)" }}>
          {L("Country", "Държава")} *
          <select required value={sel} onChange={(e) => setSel(e.target.value)} className={input} style={inputStyle}>
            <option value="" disabled>{L("Select…", "Изберете…")}</option>
            {EU_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value={OTHER}>{L("Other (outside EU)", "Друга (извън ЕС)")}</option>
          </select>
        </label>

        {isOther && (
          <label className="block text-sm mt-3" style={{ color: "var(--muted)" }}>
            {L("Country name", "Име на държавата")} *
            <input value={otherCountry} onChange={(e) => setOtherCountry(e.target.value)} required maxLength={80} className={input} style={inputStyle} />
          </label>
        )}

        <label className="block text-sm mt-3" style={{ color: "var(--muted)" }}>
          {L("Registered address", "Адрес на регистрация")}
          <input name="address" maxLength={300} className={input} style={inputStyle} />
        </label>

        <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="block text-sm" style={{ color: "var(--muted)" }}>
            {L("Accreditation body", "Орган по акредитация")}
            <input name="accreditationBody" maxLength={160} className={input} style={inputStyle} />
          </label>
          <label className="block text-sm" style={{ color: "var(--muted)" }}>
            {L("Accreditation certificate №", "Сертификат за акредитация №")}
            <input name="accreditationNo" maxLength={120} className={input} style={inputStyle} />
          </label>
        </div>

        {/* EU path — ЕИК + VAT (verified automatically once submitted). */}
        {sel && !isOther && (
          <div className="mt-4 p-3 rounded" style={{ background: "var(--green-soft)", border: "1px solid var(--line)" }}>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {L(
                "EU laboratory — we verify your ЕИК and VAT automatically. A person still reviews your accreditation before approval.",
                "Лаборатория в ЕС — проверяваме ЕИК и ДДС автоматично. Акредитацията се преглежда от служител преди одобрение.",
              )}
            </p>
            <div className="grid gap-3 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="block text-sm" style={{ color: "var(--muted)" }}>
                {L("ЕИК / company id", "ЕИК / фирмен номер")}
                <input name="eik" maxLength={20} className={input} style={inputStyle} />
              </label>
              <label className="block text-sm" style={{ color: "var(--muted)" }}>
                {L("VAT № (e.g. BG123…)", "ДДС № (напр. BG123…)")}
                <input name="vat" maxLength={20} className={input} style={inputStyle} />
              </label>
            </div>
          </div>
        )}

        {/* non-EU path — supporting documents (private upload). */}
        {isOther && (
          <div className="mt-4 p-3 rounded" style={{ background: "var(--green-soft)", border: "1px solid var(--line)" }}>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {L(
                "Outside the EU — please attach your accreditation certificate / scope and business registration. PTS verifies these manually.",
                "Извън ЕС — моля, прикачете сертификат за акредитация / обхват и фирмена регистрация. PTS ги проверява ръчно.",
              )}
            </p>
            <div className="text-sm mt-2" style={{ color: "var(--ink)", fontWeight: 600 }}>
              {L("Supporting documents", "Придружаващи документи")} *
            </div>
            {/* Custom drop area — the native file input is visually hidden but still
                submits its files; clicking anywhere in the label opens the picker. */}
            <label
              style={{
                display: "block", marginTop: 6, cursor: "pointer", textAlign: "center",
                border: "2px dashed var(--green-line)", borderRadius: 12, background: "#fff", padding: "20px 16px",
              }}
            >
              <input
                name="documents" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => setDocNames(Array.from(e.target.files ?? []).map((f) => f.name))}
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}
              />
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--green-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 6px", display: "block" }}>
                <path d="M12 16V4M8 8l4-4 4 4" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--green-dark)" }}>
                {docNames.length
                  ? L(`${docNames.length} file(s) selected — click to change`, `${docNames.length} избран(и) — кликнете за промяна`)
                  : L("Click to attach files", "Кликнете, за да прикачите файлове")}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                {L("PDF, JPG or PNG · up to 3 files · max 5 MB each", "PDF, JPG или PNG · до 3 файла · до 5 MB всеки")}
              </div>
            </label>
            {docNames.length > 0 && (
              <ul style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, listStyle: "none", padding: 0 }}>
                {docNames.slice(0, 3).map((n, i) => (
                  <li key={i} style={{ fontSize: 13, color: "var(--ink)", background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green-light)" strokeWidth="2" style={{ flexShrink: 0 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
                    </svg>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n}</span>
                  </li>
                ))}
                {docNames.length > 3 && (
                  <li style={{ fontSize: 12, color: "var(--red)" }}>{L("Only the first 3 files are kept.", "Пазят се само първите 3 файла.")}</li>
                )}
              </ul>
            )}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary mt-6 w-full justify-center"
          style={{ padding: "14px 16px", fontSize: 16, fontWeight: 700 }}
          disabled={!sel || (isOther && docNames.length === 0)}
        >
          {L("Submit application", "Изпращане на заявка")}
        </button>
        <p className="text-xs text-center mt-2" style={{ color: "var(--muted)" }}>
          {L(
            "No account is created until PTS reviews and approves your request.",
            "Акаунт се създава едва след като PTS прегледа и одобри заявката.",
          )}
        </p>

        <div className="mt-5 pt-4 text-center" style={{ borderTop: "1px solid var(--line)" }}>
          <span className="text-sm" style={{ color: "var(--muted)" }}>{L("Already have an account?", "Вече имате акаунт?")}</span>{" "}
          <a href="/lab/login" className="text-sm" style={{ color: "var(--green-dark)", fontWeight: 700, textDecoration: "underline" }}>
            {L("Laboratory sign-in", "Вход за лаборатории")}
          </a>
        </div>
      </form>
    </div>
  );
}
