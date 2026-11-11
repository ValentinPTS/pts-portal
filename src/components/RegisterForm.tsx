"use client";

import { useActionState, useState } from "react";
import { submitRegistrationAction, type RegistrationFormState } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";
import { EU_COUNTRIES, NEAR_COUNTRIES, isEu, registrationProblemText } from "@/lib/registration-model";
import { POSITION_SUGGESTIONS } from "@/lib/entity-users-model";

// The public registration (plan part 9.1): the three levels at once — the legal entity, its first
// laboratory and the person registering, who becomes the profile's administrator. In the EU the ЕИК
// and the VAT number are checked; outside it the papers are attached. Every submission ends on the
// same page with the same words (a neutral answer). The privacy section M4 is linked (Реш. 152).

const OTHER = "__other__";
const input = "w-full rounded px-3 py-2 mt-1";
const inputStyle = { border: "1px solid var(--line)", background: "#fff" } as const;

// A mistake comes back with what was typed (9.1 review): the fields are made again from it (keyed by
// the answer), so nothing is typed twice — but the files, which a browser never gives back.
export default function RegisterForm({ privacy }: { privacy: string | null }) {
  const [state, formAction] = useActionState<RegistrationFormState, FormData>(submitRegistrationAction, {});
  return <RegisterFields key={state.at ?? 0} state={state} formAction={formAction} privacy={privacy} />;
}

const KNOWN = new Set([...EU_COUNTRIES, ...NEAR_COUNTRIES].map((c) => c.code));

function RegisterFields({ state, formAction, privacy }: { state: RegistrationFormState; formAction: (fd: FormData) => void; privacy: string | null }) {
  const { lang } = useLang();
  const bg = lang === "bg";
  const v = state.values ?? {};
  const typedCountry = (v.country ?? "").toUpperCase();
  const [sel, setSel] = useState(typedCountry ? (KNOWN.has(typedCountry) ? typedCountry : OTHER) : "");
  const [otherCode, setOtherCode] = useState(typedCountry && !KNOWN.has(typedCountry) ? typedCountry : "");
  const errorCode = state.error;
  const [docNames, setDocNames] = useState<string[]>([]);
  // a document over 5 MB (or more than 3) refused before sending: a body over the server's limit broke the
  // whole registration with the framework's own words, and what was typed was lost (round 2, R2U-3)
  const [docProblem, setDocProblem] = useState<string | null>(null);
  const isOther = sel === OTHER;
  const country = isOther ? otherCode.trim().toUpperCase() : sel;
  const eu = !!country && isEu(country);
  const outside = !!sel && !eu;

  const L = (en: string, bgTxt: string) => (bg ? bgTxt : en);
  const errText: Record<string, string> = {
    missing: L("Please fill in the required fields.", "Моля, попълнете задължителните полета."),
    filetype: L("Documents must be PDF, PNG, JPG or WEBP.", "Документите трябва да са PDF, PNG, JPG или WEBP."),
    filesize: L("Each document must be under 5 MB.", "Всеки документ трябва да е под 5 MB."),
    docs: L("Please attach at least one document.", "Моля, прикачете поне един документ."),
    later: L("Too many registrations from this address in a short time — please try again in 15 minutes.", "Твърде много регистрации от този адрес за кратко време — опитайте отново след 15 минути."),
  };
  const problem = errorCode ? (errText[errorCode] ?? (() => { const t = registrationProblemText(errorCode); return t ? L(t.en, t.bg) : null; })()) : null;
  const field = (name: string, label: string, opts: { required?: boolean; max?: number; type?: string; list?: string; help?: string } = {}) => (
    <label className="block text-sm mt-3" style={{ color: "var(--muted)" }}>
      {label}{opts.required ? " *" : ""}
      <input name={name} type={opts.type ?? "text"} required={opts.required} maxLength={opts.max ?? 200} list={opts.list} defaultValue={v[name] ?? ""} className={input} style={inputStyle} />
      {opts.help && <span className="block text-xs mt-1">{opts.help}</span>}
    </label>
  );
  const legend = (t: string) => <legend className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15 }}>{t}</legend>;

  return (
    <div className="card p-6 mx-auto mt-8" style={{ maxWidth: 680 }}>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>
        {L("Register your organisation", "Регистрация на организация")}
      </h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
        {L(
          "The organisation, its laboratory and you — you become the profile's administrator. Every registration is reviewed before the profile is made; you will receive an e-mail when it is.",
          "Организацията, нейната лаборатория и Вие — ставате администратор на профила. Всяка регистрация се преглежда, преди профилът да бъде създаден; ще получите писмо, когато бъде.",
        )}
      </p>

      {problem && <p role="alert" data-register-error={errorCode} className="text-sm mt-3" style={{ color: "var(--red)" }}>{problem}</p>}

      <form action={formAction} className="mt-4" data-register-form>
        {/* honeypot — real people never fill this; bots do. Hidden from view + a11y. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
        <input type="hidden" name="country" value={country} />

        <fieldset data-register-level="entity" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px 14px" }}>
          {legend(L("The organisation (the legal entity)", "Организацията (юридическото лице)"))}
          {field("orgName", L("Name", "Наименование"), { required: true })}
          <label className="block text-sm mt-3" style={{ color: "var(--muted)" }}>
            {L("Country", "Държава")} *
            <select required value={sel} onChange={(e) => setSel(e.target.value)} className={input} style={inputStyle} data-register-country>
              <option value="" disabled>{L("Select…", "Изберете…")}</option>
              <optgroup label={L("The EU", "ЕС")}>{EU_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{L(c.en, c.bg)}</option>)}</optgroup>
              <optgroup label={L("Outside the EU", "Извън ЕС")}>{NEAR_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{L(c.en, c.bg)}</option>)}</optgroup>
              <option value={OTHER}>{L("Other (outside the EU)", "Друга (извън ЕС)")}</option>
            </select>
          </label>
          {isOther && (
            <label className="block text-sm mt-3" style={{ color: "var(--muted)" }}>
              {L("The country's two-letter code (ISO 3166, e.g. US, JP)", "Кодът на държавата от две букви (ISO 3166, напр. US, JP)")} *
              <input value={otherCode} onChange={(e) => setOtherCode(e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 2))} required pattern="[A-Za-z]{2}" className={input} style={inputStyle} />
            </label>
          )}
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {field("eik", country === "BG" ? L("ЕИК", "ЕИК") : L("ЕИК / registration number", "ЕИК / регистрационен номер"), { required: true, max: 20 })}
            {field("vat", L("VAT № (e.g. BG123…)", "ДДС № (напр. BG123…)"), { max: 20 })}
          </div>
          {field("address", L("Address for correspondence", "Адрес за кореспонденция"), { required: true, max: 300 })}
          {field("officialEmail", L("The organisation's official e-mail", "Официален e-mail на организацията"), { required: true, type: "email", max: 254, help: L("The notices to the organisation go here.", "Тук отиват уведомленията до организацията.") })}
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {field("mol", L("МОЛ (the person responsible)", "МОЛ"), { max: 120 })}
            <label className="block text-sm mt-3" style={{ color: "var(--muted)" }}>
              {L("Language of documents and letters", "Език на документите и писмата")}
              <select name="language" defaultValue={v.language === "en" || v.language === "bg" ? v.language : bg ? "bg" : "en"} className={input} style={inputStyle}>
                <option value="bg">Български</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset data-register-level="laboratory" className="mt-4" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px 14px" }}>
          {legend(L("The laboratory", "Лабораторията"))}
          {field("labName", L("Name, as on the accreditation certificate", "Наименование, както е в сертификата за акредитация"), { required: true })}
          {field("deliveryAddress", L("Delivery address (where the objects go)", "Адрес за доставка (където отиват обектите)"), { required: true, max: 300 })}
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {field("accreditationBody", L("Accreditation body (if any)", "Орган по акредитация (ако имате)"), { max: 120 })}
            {field("accreditationNo", L("Accreditation certificate № (if any)", "Сертификат за акредитация № (ако имате)"), { max: 60 })}
          </div>
        </fieldset>

        <fieldset data-register-level="person" className="mt-4" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px 14px" }}>
          {legend(L("You — the profile's administrator", "Вие — администратор на профила"))}
          <datalist id="register-positions">{POSITION_SUGGESTIONS.map((p) => <option key={p.bg} value={L(p.en, p.bg)} />)}</datalist>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {field("contactPerson", L("Name", "Име"), { required: true, max: 120 })}
            {field("email", L("Login e-mail", "E-mail за вход"), { required: true, type: "email", max: 254 })}
            {field("position", L("Position (information only)", "Длъжност (за сведение)"), { max: 120, list: "register-positions" })}
            {field("phone", L("Phone", "Телефон"), { max: 40 })}
          </div>
        </fieldset>

        {/* EU — ЕИК + VAT (checked once submitted). */}
        {eu && (
          <div className="mt-4 p-3 rounded" style={{ background: "var(--green-soft)", border: "1px solid var(--line)" }}>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {L(
                "EU laboratory — we verify your ЕИК and VAT automatically. A person still reviews the registration before approval. Accreditation is not a condition for registering.",
                "Лаборатория в ЕС — проверяваме ЕИК и ДДС автоматично. Регистрацията се преглежда от служител преди одобрение. Акредитацията не е условие за регистрация.",
              )}
            </p>
          </div>
        )}

        {/* outside the EU — supporting documents (private upload). */}
        {outside && (
          <div className="mt-4 p-3 rounded" style={{ background: "var(--green-soft)", border: "1px solid var(--line)" }}>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {L(
                "Outside the EU — please attach your business registration and, if you have one, your accreditation certificate / scope. PTS verifies these manually.",
                "Извън ЕС — моля, прикачете фирмена регистрация и, ако имате, сертификат за акредитация / обхват. PTS ги проверява ръчно.",
              )}
            </p>
            <div className="text-sm mt-2" style={{ color: "var(--ink)", fontWeight: 600 }}>
              {L("Supporting documents", "Придружаващи документи")} *
            </div>
            <label style={{ display: "block", marginTop: 6, cursor: "pointer", textAlign: "center", border: "2px dashed var(--green-line)", borderRadius: 12, background: "#fff", padding: "20px 16px" }}>
              <input name="documents" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setDocNames(files.map((f) => f.name));
                  const say = files.length > 3 ? L("Attach 3 files at most.", "Прикачете най-много 3 файла.")
                    : files.some((f) => f.size > 5_000_000) ? L("Each document must be under 5 MB — choose a smaller file.", "Всеки документ трябва да е под 5 MB — изберете по-малък файл.") : null;
                  e.currentTarget.setCustomValidity(say ?? "");
                  setDocProblem(say);
                }}
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--green-dark)" }}>
                {docNames.length
                  ? L(`${docNames.length} file(s) selected — click to change`, `${docNames.length} избран(и) — кликнете за промяна`)
                  : L("Click to attach files", "Кликнете, за да прикачите файлове")}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                {L("PDF, JPG or PNG · up to 3 files · max 5 MB each", "PDF, JPG или PNG · до 3 файла · до 5 MB всеки")}
              </div>
            </label>
            {docProblem && <div role="alert" data-register-doc-problem style={{ marginTop: 6, fontSize: 13, color: "var(--red)" }}>{docProblem}</div>}
            {docNames.length > 0 && (
              <ul style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, listStyle: "none", padding: 0 }}>
                {docNames.slice(0, 3).map((n, i) => <li key={i} style={{ fontSize: 13, background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px" }}>{n}</li>)}
                {docNames.length > 3 && <li style={{ fontSize: 12, color: "var(--red)" }}>{L("Only the first 3 files are kept.", "Пазят се само първите 3 файла.")}</li>}
              </ul>
            )}
          </div>
        )}

        <p className="text-xs mt-4" data-register-privacy style={{ color: "var(--muted)" }}>
          {L("How we process personal data (section M4): ", "Как обработваме личните данни (раздел М4): ")}
          {privacy
            ? <a href={privacy} target="_blank" rel="noopener" style={{ color: "var(--green-dark)", textDecoration: "underline" }}>{privacy}</a>
            : <span>{L("‹section M4 — not linked yet›", "‹раздел М4 — още не е свързан›")}</span>}
        </p>

        <button type="submit" className="btn btn-primary mt-4 w-full justify-center" style={{ padding: "14px 16px", fontSize: 16, fontWeight: 700 }}
          disabled={!country || (isOther && country.length !== 2) || (outside && docNames.length === 0)}>
          {L("Submit the registration", "Изпращане на регистрацията")}
        </button>
        <p className="text-xs text-center mt-2" style={{ color: "var(--muted)" }}>
          {L("No profile is made until the registration is reviewed and approved.", "Профил се създава едва след като регистрацията бъде прегледана и одобрена.")}
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
