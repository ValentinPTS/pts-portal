import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, cover, heading, footer } from "../doc-shell";

const FORM = "F 4.2-2";

export function renderDeclaration(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  const intro = `<p>${L(
    `As a participant in proficiency testing No. ${s.number}, organized by PT Provider PTS Bulgaria at PTS Bulgaria Ltd, I declare:`,
    `Като участник в изпитване за пригодност № ${s.number}, организирана от организатора PTS Bulgaria към „ПТС България“ ООД, декларирам:`
  )}</p>`;

  const clauses = `<ol>
    <li>${L(
      "I shall not request or obtain information from other participants or third parties related to this proficiency testing scheme until its completion.",
      "Няма да изисквам или получавам информация от други участници или трети лица, свързана с настоящото изпитване за пригодност, до неговото приключване."
    )}</li>
    <li>${L(
      "I shall not disclose any information related to this proficiency testing scheme until its completion.",
      "Няма да разпространявам информация, свързана с настоящото изпитване за пригодност, до неговото приключване."
    )}</li>
    <li>${L(
      "I shall bear responsibility under the Criminal Code of the country of which I am a citizen for any falsely declared circumstances.",
      "За невярно декларирани обстоятелства нося отговорност съгласно Наказателния кодекс на държавата, на която съм гражданин."
    )}</li>
  </ol>`;

  const headName = `<div class="fld"><span class="fl">${L(
    "Head of the laboratory:",
    "Ръководител на лабораторията:"
  )}</span> <span class="blank"></span></div>`;

  const signature = `<div class="sig">
    <div class="col">${L("Date", "Дата")}</div>
    <div class="col">${L("Name and Surname", "Име и Фамилия")}</div>
  </div>`;

  const body = [
    cover(s, lang, "CONFIDENTIALITY DECLARATION", "ДЕКЛАРАЦИЯ ЗА КОНФИДЕНЦИАЛНОСТ", { withImage: false }),
    heading("I DECLARE", "ДЕКЛАРИРАМ", lang),
    `<div class="body">${intro}${clauses}${headName}${signature}</div>`,
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Declaration`, body);
}
