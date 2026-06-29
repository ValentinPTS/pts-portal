import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, docHeader, footer } from "../doc-shell";
import { fText } from "../form-fields";

const FORM = "F 4.2-2";

const DEC_CSS = `
  .dec-field{display:flex;align-items:flex-end;gap:14px;margin:11px 0;}
  .dec-field .lbl{flex:0 0 40%;text-align:right;font-family:var(--sans);font-weight:700;font-size:11pt;}
  .dec-field .ln{flex:1;}
  .dec-field .ff-line{width:100%;min-width:0;}
  .dec-hint{margin:3px 0 14px 40%;padding-left:14px;font-style:italic;color:var(--muted);font-size:10pt;text-align:center;}
  .dec-intro{text-align:center;margin:30px 0 6px;line-height:1.7;font-size:11.5pt;}
  .dec-intro .em{color:var(--green-dark);font-weight:700;}
  .dec-declare{text-align:center;font-family:var(--sans);font-weight:800;font-size:13.5pt;letter-spacing:1.5px;margin:16px 0 12px;}
  .dec-list{margin:8px 0;padding-left:24px;} .dec-list li{margin:11px 0;text-align:justify;line-height:1.55;}
  .dec-sign{display:flex;justify-content:space-between;gap:40px;margin-top:52px;}
  .dec-sign .col{flex:0 0 42%;text-align:center;}
  .dec-sign .col .ff-line{min-width:0;width:100%;border-bottom-color:#999;}
  .dec-sign .col .cap{display:block;margin-top:3px;font-family:var(--sans);font-size:9.5pt;color:var(--muted);}
`;

export function renderDeclaration(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  const fields = `
    <div class="dec-field"><span class="lbl">${L("The undersigned (full name):", "Долуподписаният (име, презиме, фамилия):")}</span><span class="ln">${fText("head_name", 180)}</span></div>
    <div class="dec-hint">${L("Head of Laboratory", "Ръководител на лабораторията")}</div>
    <div class="dec-field"><span class="lbl">${L("Organization:", "Организация:")}</span><span class="ln">${fText("org", 180)}</span></div>
    <div class="dec-field"><span class="lbl">${L("Country:", "Държава:")}</span><span class="ln">${fText("country", 180)}</span></div>`;

  const intro = `<div class="dec-intro">${L(
    "As a participant in the proficiency testing scheme",
    "В качеството си на участник в изпитване за пригодност"
  )} <span class="em">№ ${esc(s.number)}</span>,<br>${L("organized by", "организирано от")} <span class="em">${L(
    "PT Provider PTS Bulgaria at PTS Bulgaria Ltd",
    "PTS Bulgaria при „ПТС България“ ООД"
  )}</span>,</div>`;

  const declare = `<div class="dec-declare">${L("I DECLARE:", "ДЕКЛАРИРАМ:")}</div>`;

  // Fixed clause text (no user input) — bold key phrases inline to match the original.
  const clauses = `<ol class="dec-list">
    <li>${lang === "bg"
      ? `<b>Няма да</b> изисквам или получавам информация от други участници или трети лица, свързана с настоящото изпитване за пригодност, до неговото приключване.`
      : `I <b>shall not</b> request or obtain information from other participants or third parties related to this proficiency testing scheme until its completion.`}</li>
    <li>${lang === "bg"
      ? `<b>Няма да</b> разпространявам информация, свързана с настоящото изпитване за пригодност, до неговото приключване.`
      : `I <b>shall not</b> disclose any information related to this proficiency testing scheme until its completion.`}</li>
    <li>${lang === "bg"
      ? `За невярно декларирани обстоятелства <b>нося отговорност</b> съгласно Наказателния кодекс на държавата, на която съм гражданин.`
      : `I <b>shall</b> bear responsibility under the Criminal Code of the country of which I am a citizen for any falsely declared circumstances.`}</li>
  </ol>`;

  const signature = `<div class="dec-sign">
    <div class="col">${fText("sig_date", 150)}<span class="cap">${L("Date", "Дата")}</span></div>
    <div class="col">${fText("sig_name", 240)}<span class="cap">${L("Name, Surname", "Име, фамилия")}</span></div>
  </div>`;

  const body = [
    docHeader(s, lang, "CONFIDENTIALITY DECLARATION", "ДЕКЛАРАЦИЯ ЗА КОНФИДЕНЦИАЛНОСТ"),
    `<div class="body">${fields}${intro}${declare}${clauses}${signature}</div>`,
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Declaration`, body, DEC_CSS);
}
