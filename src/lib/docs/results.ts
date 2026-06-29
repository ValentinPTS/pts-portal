import type { Scheme, Lang, ResultTable } from "../types";
import { esc, pick, wrapDoc, docHeader, footer } from "../doc-shell";
import { fText, fLines } from "../form-fields";

const FORM = "F 7.2.1-7";

// Specimen-column labels (I, II, III …).
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

// Small green caution triangle for the instruction bullets (SVG, not an emoji).
const ICO_WARN =
  `<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path d="M12 3 22.5 21H1.5z" fill="#5f7d52"/><rect x="11" y="9" width="2" height="6.2" fill="#fff"/><rect x="11" y="16.6" width="2" height="2" fill="#fff"/></svg>`;

const RS_CSS = `
  .rs-scheme{font-family:var(--sans);font-weight:700;color:var(--green-dark);font-size:11.5pt;margin:8px 0 14px;border-bottom:1px solid var(--line);padding-bottom:6px;}
  .rs-scheme .lbl{color:var(--ink);margin-right:6px;}
  .rs-field{margin:7px 0;font-family:var(--sans);} .rs-field .fl{font-weight:700;margin-right:6px;}
  .rs-field .assigned{color:var(--muted);font-size:8.5pt;font-style:italic;margin-left:6px;}
  .rs-warns{margin:14px 0 6px;}
  .rs-warn{display:flex;align-items:flex-start;gap:9px;margin:6px 0;font-family:var(--sans);font-size:9.5pt;color:var(--green-dark);font-weight:600;line-height:1.4;}
  .rs-warn svg{flex:0 0 auto;margin-top:2px;}
  .rs-tcap{font-family:var(--sans);font-weight:700;font-size:10.5pt;margin:16px 0 3px;}
  .rs-tcap .std{font-weight:400;font-style:italic;color:var(--muted);}
  table.rtable{border-collapse:collapse;width:100%;font-family:var(--sans);font-size:9.5pt;margin:2px 0 6px;}
  table.rtable th,table.rtable td{border:1px solid var(--green);padding:5px;text-align:center;vertical-align:middle;}
  table.rtable th{background:var(--green-soft);color:var(--green-dark);font-weight:700;}
  table.rtable td.ch,table.rtable th.ch{background:var(--green-soft);color:var(--green-dark);font-weight:700;width:20%;}
  table.rtable .ff-line{border-bottom:none;}
  table.rtable input.ff-line{width:100%;text-align:center;border:none;background:transparent;min-width:0;}
  table.rtable td .ff-line[data-empty="1"]{border-bottom:none;min-height:14px;}
  .rs-notes{font-size:8.5pt;color:var(--muted);margin:12px 0 4px;line-height:1.4;}
  .rs-remarks-l{font-family:var(--sans);font-weight:700;font-size:10pt;margin:16px 0 3px;}
  .rs-headlab{margin-top:24px;font-family:var(--sans);font-weight:700;font-size:10.5pt;text-align:center;}
  .rs-sign{display:flex;justify-content:space-between;gap:32px;margin-top:16px;}
  .rs-sign .col{flex:1;border-top:1px solid #999;padding-top:3px;text-align:center;font-size:9pt;color:var(--muted);font-family:var(--sans);}
`;

// One Results-Sheet table per characteristic; falls back to deriving from the
// scheme's high-level parameters when no explicit resultTables are defined.
function resultTablesFor(s: Scheme): ResultTable[] {
  if (s.resultTables && s.resultTables.length) return s.resultTables;
  return s.parameters.map((p) => ({
    nameEn: p.characteristicEn,
    nameBg: p.characteristicBg,
    standardEn: p.standardEn,
    standardBg: p.standardBg,
    specimens: parseInt((p.specimensEn.match(/\d+/) ?? ["3"])[0], 10) || 3,
    unit: "",
  }));
}

export function renderResults(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const assigned = L("/to be filled in by the PT Provider/", "/попълва се от РТ провайдъра/");

  const scheme = `<div class="rs-scheme"><span class="lbl">${L(
    "Number and Name of the PT Scheme:",
    "Номер и наименование на схемата за изпитване за пригодност:"
  )}</span> ${esc(s.number)} ${L(s.titleEn, s.titleBg)}</div>`;

  const field = (id: string, en: string, bg: string, note = "") =>
    `<div class="rs-field"><span class="fl">${L(en, bg)}</span> ${fText(id, 240)}${note ? ` <span class="assigned">${note}</span>` : ""}</div>`;

  const top = `${field("lab_code", "Laboratory Code:", "Код на лабораторията:", assigned)}
    ${field("item_code", "PT Item's code:", "Код на обекта на РТ схемата:", assigned)}
    ${field("lab_name", "Name of the Laboratory:", "Наименование на лабораторията:")}
    ${field("test_date", "Date/period of performing the tests:", "Дата/период на провеждане на изпитванията:")}`;

  const warn = (en: string, bg: string) => `<div class="rs-warn">${ICO_WARN}<span>${L(en, bg)}</span></div>`;
  const warnings = `<div class="rs-warns">
    ${warn("Please refer to the 'Instructions for Participants' (F 7.3.5-1).", "Вижте „Инструкция за участниците“ (Ф 7.3.5-1).")}
    ${warn("Complete the tables only for the parameters for which you have registered participation.", "Попълнете таблиците само за характеристиките, за които сте заявили участие.")}
    ${warn(
      `The PT items are provided solely for the purposes of the proficiency testing scheme, and the participant shall not assess them for conformity with the technical requirements applicable to the product.`,
      `Обектите се предоставят единствено за целите на схемата за изпитване за пригодност и участникът не следва да ги оценява за съответствие с техническите изисквания, приложими към продукта.`
    )}
  </div>`;

  const tables = resultTablesFor(s)
    .map((t, i) => {
      const n = Math.max(1, t.specimens);
      const specHead = ROMAN.slice(0, n).map((r) => `<th>${r}</th>`).join("");
      const unitCells = Array.from({ length: n + 2 }).map(() => `<th>${esc(t.unit)}</th>`).join("");
      const cells = Array.from({ length: n }).map((_, j) => `<td>${fText(`t${i}_s${j}`, 24)}</td>`).join("");
      return `<div class="rs-tcap">${L("Table", "Таблица")} ${i + 1} — ${L(t.nameEn, t.nameBg)} <span class="std">(* ${L(t.standardEn, t.standardBg)})</span></div>
    <table class="rtable"><thead>
      <tr><th class="ch" rowspan="3">${L("Characteristic", "Характеристика")}</th><th colspan="${n}">${L("Mean result for the PT item:", "Среден резултат за обекта:")}</th><th rowspan="2">${L("Final mean value", "Крайна средна стойност")}</th><th rowspan="2">${L("**Expanded Uncertainty (k=2, P≈95%)", "**Разширена неопределеност (k=2, P≈95%)")}</th></tr>
      <tr>${specHead}</tr>
      <tr>${unitCells}</tr>
    </thead><tbody>
      <tr><td class="ch">${L(t.nameEn, t.nameBg)}</td>${cells}<td>${fText(`t${i}_mean`, 40)}</td><td>${fText(`t${i}_unc`, 40)}</td></tr>
    </tbody></table>`;
    })
    .join("\n");

  const notes = `<div class="rs-notes">* ${L(
    "The tests shall be performed in accordance with the latest valid version of the specified standard method. At the time of issue, EN 1338:2003 together with its corrigendum AC:2006 is in force.",
    "Изпитванията се извършват съгласно последната валидна версия на посочения стандартен метод. Към момента на издаване в сила е следната версия: БДС EN 1338:2005, както и официалната поправка БДС EN 1338:2005+AC:2006."
  )}</div>
    <div class="rs-notes">** ${L(
      "Per ISO/IEC 17025:2017 the laboratory shall be able to evaluate measurement uncertainty. If the expanded uncertainty is not reported, no ζ-score will be determined for that participant. The expanded uncertainty shall be reported in accordance with Clause 6 of the Instruction for Participants.",
      "Съгласно БДС EN ISO/IEC 17025:2018 лабораторията трябва да може да оценява неопределеността на измерването. Ако разширената неопределеност не е докладвана, за съответния участник не се определя ζ-оценка. Разширената неопределеност се докладва съгласно т. 6 от Инструкцията за участниците."
    )}</div>`;

  const remarks = `<div class="rs-remarks-l">${L("Remarks / comments (if applicable):", "Забележки / коментари (ако е приложимо):")}</div>${fLines("remarks", 2)}`;

  const head = `<div class="rs-headlab">${L("Head of Laboratory:", "Ръководител на лабораторията:")}</div>
    <div class="rs-sign">
      <div class="col">${fText("sig_date", 150)}<br>${L("Date", "Дата")}</div>
      <div class="col">${fText("sig_name", 220)}<br>${L("Name, Surname", "Име, фамилия")}</div>
    </div>`;

  const body = [
    docHeader(s, lang, "RESULTS SHEET", "ЛИСТ С РЕЗУЛТАТИ"),
    `<div class="body">${scheme}${top}${warnings}${tables}${notes}${remarks}${head}</div>`,
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Results Sheet`, body, RS_CSS);
}
