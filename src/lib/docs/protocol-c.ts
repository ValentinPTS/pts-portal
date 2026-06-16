import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, cover, footer } from "../doc-shell";

const FORM = "F 7.3.4-1";

// Calibration variant of the PT Item Receipt protocol. Unlike the testing
// protocol it has NO "PT Item's code" field (a single travelling device is
// identified by the lab code alone) and presents the receipt statement as two
// SEPARATE lines, each showing its two options openly (not inline dropdowns).
export function renderProtocolC(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  // Labelled blank fields (lab fills these in by hand / on screen).
  const field = (en: string, bg: string) =>
    `<div class="fld"><span class="fl">${L(en, bg)}</span> <span class="blank"></span></div>`;

  const fields = [
    field("Name of the Laboratory:", "Наименование на лабораторията:"),
    field("Code of the Laboratory:", "Код на лабораторията:"),
    field("Date of receipt:", "Дата на получаване:"),
  ].join("");

  // Confirmation sentence — scheme number pulled from the Scheme.
  const confirm = `<p>${L(
    "I hereby confirm the receipt of the PT item for the purpose of proficiency testing No.",
    "С настоящото потвърждавам получаването на обекта за целите на изпитване за пригодност №"
  )} ${esc(s.number)}.</p>`;

  // Two separate statement lines, each with its options shown openly.
  const opt = (en: string, bg: string) => `<span class="selbox">${L(en, bg)}</span>`;

  const line1 = `<p>${L("The PT item has been received:", "Обектът на изпитването за пригодност е получен:")}
    ${opt("WITHOUT DAMAGES", "БЕЗ ПОВРЕДИ")} / ${opt("DAMAGED", "ПОВРЕДЕН")}</p>`;

  const line2 = `<p>${L("The PT item is:", "Обектът на изпитването за пригодност е:")}
    ${opt("FIT", "ГОДЕН")} / ${opt("UNFIT", "НЕГОДЕН")}
    ${L(
      "for conducting the relevant laboratory activities.",
      "за провеждане на съответните лабораторни дейности."
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
    `<div class="body">${fields}${confirm}${line1}${line2}${remarks}${signature}</div>`,
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Protocol`, body);
}
