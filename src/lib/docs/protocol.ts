import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, cover, footer } from "../doc-shell";

const FORM = "F 7.3.4-1";

export function renderProtocol(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  // Labelled blank fields (lab fills these in by hand / on screen).
  const field = (en: string, bg: string) =>
    `<div class="fld"><span class="fl">${L(en, bg)}</span> <span class="blank"></span></div>`;

  const fields = [
    field("Name of the Laboratory:", "Наименование на лабораторията:"),
    field("Laboratory Code:", "Лабораторен код:"),
    field("PT Item's code:", "Код на обекта на РТ схемата:"),
    field("Date of receipt:", "Дата на получаване:"),
  ].join("");

  // Confirmation sentence — scheme number pulled from the Scheme.
  const confirm = `<p>${L(
    "I hereby confirm the receipt of the PT item for the purpose of proficiency testing No.",
    "Потвърждавам получаването на обекта за целите на изпитване за пригодност №"
  )} ${esc(s.number)}.</p>`;

  // Combined statement with two inline option boxes (select-look via .selbox).
  const opt = (en: string, bg: string) => `<span class="selbox">${L(en, bg)}</span>`;
  const statement = `<p>${L("The PT item has been received", "Обектът на изпитването за пригодност е получен")}
    ${opt("undamaged", "неповредена")} / ${opt("damaged", "повредена")}
    ${L("and is", "и е")}
    ${opt("suitable", "годна")} / ${opt("not suitable", "негодна")}
    ${L(
      "for the purpose of conducting the relevant laboratory activities.",
      "за целите на провеждане на съответните лабораторни дейности."
    )}</p>`;

  // Remarks / comments (blank line for free text).
  const remarks = `<div class="fld"><span class="fl">${L(
    "Remarks / comments, if necessary:",
    "Забележки / коментари, ако е необходимо:"
  )}</span> <span class="blank"></span></div>`;

  // Signature block: Accepted by / Date / Name and Surname.
  const signature = `<p class="muted">${L("Accepted by:", "Получил:")}</p>
    <div class="sig">
      <div class="col">${L("Date", "Дата")}</div>
      <div class="col">${L("Name and Surname", "Име и фамилия")}</div>
    </div>`;

  const body = [
    cover(
      s,
      lang,
      "PROTOCOL FOR PT ITEM RECEIPT",
      "ПРОТОКОЛ ЗА ПОЛУЧАВАНЕ НА ОБЕКТ НА ИЗПИТВАНЕ ЗА ПРИГОДНОСТ",
      { withImage: false }
    ),
    `<div class="body">${fields}${confirm}${statement}${remarks}${signature}</div>`,
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Protocol`, body);
}
