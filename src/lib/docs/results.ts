import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, cover, heading, footer } from "../doc-shell";

const FORM = "F 7.2.1-7";

export function renderResults(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  const assigned = L("— to be assigned by PTS —", "— попълва се от РТ провайдъра —");

  // Top blank fields — values are assigned by the provider, not entered here.
  const topFields = `<div class="fld"><span class="fl">${L(
    "Laboratory Code:",
    "Код на лабораторията:"
  )}</span> <span class="blank"></span> <span class="muted">${assigned}</span></div>
    <div class="fld"><span class="fl">${L(
      "PT Item's code:",
      "Код на обекта на РТ схемата:"
    )}</span> <span class="blank"></span> <span class="muted">${assigned}</span></div>`;

  // One small result-entry table per parameter.
  const tables = s.parameters
    .map(
      (pr) => `<h3 class="sub">${L(pr.characteristicEn, pr.characteristicBg)} — ${L(
        pr.standardEn,
        pr.standardBg
      )}</h3>
    <table class="ptable"><thead><tr>
      <th>${L("Specimen / Determination", "Проба / Определяне")}</th>
      <th>${L("Reported result", "Докладван резултат")}</th>
      <th>${L("Expanded uncertainty U (k=2, P≈95%)", "Разширена неопределеност U (k=2, P≈95%)")}</th>
    </tr></thead><tbody><tr>
      <td>${L(pr.characteristicEn, pr.characteristicBg)}</td>
      <td><span class="blank"></span></td>
      <td><span class="blank"></span></td>
    </tr></tbody></table>`
    )
    .join("\n");

  // Standard notes — copied verbatim (EN + BG) from poc/results-sheet-preview.html.
  const notes = `<div class="note">* ${L(
    "The tests shall be performed in accordance with the latest valid version of the specified standard method. At the time of issue, EN 1338:2003 together with its corrigendum AC:2006 is in force.",
    "Изпитванията се извършват съгласно последната валидна версия на посочения стандартен метод. Към момента на издаване в сила е следната версия: БДС EN 1338:2005, както и официалната поправка БДС EN 1338:2005+AC:2006."
  )}</div>
    <div class="note">** ${L(
      "Per ISO/IEC 17025:2017 the laboratory shall be able to evaluate measurement uncertainty. If the expanded uncertainty is not reported, no ζ-score will be determined for that participant. The expanded uncertainty shall be reported in accordance with Clause 6 of the Instruction for Participants.",
      "Съгласно БДС EN ISO/IEC 17025:2018 лабораторията трябва да може да оценява неопределеността на измерването. Ако разширената неопределеност не е докладвана, за съответния участник не се определя ζ-оценка. Разширената неопределеност се докладва съгласно т. 6 от Инструкцията за участниците."
    )}</div>`;

  const body = [
    cover(s, lang, "RESULTS SHEET", "ЛИСТ С РЕЗУЛТАТИ", { withImage: false }),
    heading("RESULTS", "РЕЗУЛТАТИ", lang),
    `<div class="body">${topFields}${tables}${notes}</div>`,
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Results Sheet`, body);
}
