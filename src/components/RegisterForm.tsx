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
            <label className="block text-sm mt-2" style={{ color: "var(--muted)" }}>
              {L("Documents (up to 3 files, PDF/JPG/PNG, max 5 MB each)", "Документи (до 3 файла, PDF/JPG/PNG, до 5 MB всеки)")} *
              <input name="documents" type="file" multiple required accept=".pdf,.png,.jpg,.jpeg,.webp"
                className="w-full mt-1 text-sm" />
            </label>
          </div>
        )}

        <button type="submit" className="btn btn-primary mt-5 w-full justify-center" disabled={!sel}>
          {L("Submit application", "Изпращане на заявка")}
        </button>
        <p className="text-xs mt-4 text-center" style={{ color: "var(--muted)" }}>
          {L("Already have an account?", "Вече имате акаунт?")}{" "}
          <a href="/lab/login" style={{ color: "var(--green-dark)", fontWeight: 600 }}>{L("Laboratory sign-in", "Вход за лаборатории")}</a>
        </p>
      </form>
    </div>
  );
}
