import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, cover, footer } from "../doc-shell";
import { fText, fRadio } from "../form-fields";

const FORM = "F 7.3.4-1";

// Calibration variant of the PT Item Receipt protocol. Unlike the testing
// protocol it has NO "PT Item's code" field (a single travelling device is
// identified by the lab code alone) and presents the receipt statement as two
// SEPARATE lines, each showing its two options openly.
export function renderProtocolC(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  // Labelled fillable blank fields (the lab completes these on screen).
  const field = (id: string, en: string, bg: string) =>
    `<div class="fld"><span class="fl">${L(en, bg)}</span> ${fText(id, 280)}</div>`;

  const fields = [
    field("lab_name", "Name of the Laboratory:", "Наименование на лабораторията:"),
    field("lab_code", "Code of the Laboratory:", "Код на лабораторията:"),
    field("date_receipt", "Date of receipt:", "Дата на получаване:"),
  ].join("");

  // Confirmation sentence — scheme number pulled from the Scheme.
  const confirm = `<p>${L(
    "I hereby confirm the receipt of the PT item for the purpose of proficiency testing No.",
    "С настоящото потвърждавам получаването на обекта за целите на изпитване за пригодност №"
  )} ${esc(s.number)}.</p>`;

  // Two separate statement lines, each a single-choice selection.
  const line1 = `<p>${L("The PT item has been received:", "Обектът на изпитването за пригодност е получен:")}
    ${fRadio("condition", [["undamaged", L("WITHOUT DAMAGES", "БЕЗ ПОВРЕДИ")], ["damaged", L("DAMAGED", "ПОВРЕДЕН")]])}</p>`;

  const line2 = `<p>${L("The PT item is:", "Обектът на изпитването за пригодност е:")}
    ${fRadio("suitability", [["fit", L("FIT", "ГОДЕН")], ["unfit", L("UNFIT", "НЕГОДЕН")]])}
    ${L(
      "for conducting the relevant laboratory activities.",
      "за провеждане на съответните лабораторни дейности."
    )}</p>`;

  // Remarks / comments (free text).
  const remarks = `<div class="fld"><span class="fl">${L(
    "Remarks / comments, if necessary:",
    "Забележки / коментари, ако е необходимо:"
  )}</span> ${fText("remarks", 360)}</div>`;

  // Signature block: Accepted by / Date / Name and Surname.
  const signature = `<p class="muted">${L("Accepted by:", "Получил:")}</p>
    <div class="sig">
      <div class="col">${fText("sig_date", 140)}<br>${L("Date", "Дата")}</div>
      <div class="col">${fText("sig_name", 200)}<br>${L("Name and Surname", "Име и фамилия")}</div>
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
