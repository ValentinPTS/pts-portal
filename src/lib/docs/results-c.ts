import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, docHeader, footer } from "../doc-shell";
import { fText, fLines } from "../form-fields";

const FORM = "F 7.2.1-7";

// Small green caution triangle for the instruction bullets (SVG, not an emoji).
const ICO_WARN =
  `<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path d="M12 3 22.5 21H1.5z" fill="#5f7d52"/><rect x="11" y="9" width="2" height="6.2" fill="#fff"/><rect x="11" y="16.6" width="2" height="2" fill="#fff"/></svg>`;

export const RS_CSS = `
  .rs-scheme{font-family:var(--sans);font-weight:700;color:var(--green-dark);font-size:11.5pt;margin:8px 0 14px;border-bottom:1px solid var(--line);padding-bottom:6px;}
  .rs-scheme .lbl{color:var(--ink);margin-right:6px;}
  .rs-field{margin:7px 0;font-family:var(--sans);} .rs-field .fl{font-weight:700;margin-right:6px;}
  .rs-field .assigned{color:var(--muted);font-size:8.5pt;font-style:italic;margin-left:6px;}
  .rs-warns{margin:14px 0 6px;}
  .rs-warn{display:flex;align-items:flex-start;gap:9px;margin:6px 0;font-family:var(--sans);font-size:9.5pt;color:var(--green-dark);font-weight:600;line-height:1.4;}
  .rs-warn svg{flex:0 0 auto;margin-top:2px;}
  .rs-tcap{font-family:var(--sans);font-weight:700;font-size:10.5pt;margin:16px 0 3px;}
  table.rtable{border-collapse:collapse;width:100%;font-family:var(--sans);font-size:9.5pt;margin:2px 0 6px;}
  table.rtable th,table.rtable td{border:1px solid var(--green);padding:5px;text-align:center;vertical-align:middle;}
  table.rtable th{background:var(--green-soft);color:var(--green-dark);font-weight:700;}
  table.rtable td.pt{background:var(--green-soft);color:var(--green-dark);font-weight:700;width:28%;}
  table.rtable .ff-line{border-bottom:none;}
  table.rtable input.ff-line{width:100%;text-align:center;border:none;background:transparent;min-width:0;}
  table.rtable td .ff-line[data-empty="1"]{border-bottom:none;min-height:16px;min-width:0;}
  .rs-notes{font-size:8.5pt;color:var(--muted);margin:12px 0 4px;line-height:1.4;}
  .rs-remarks-l{font-family:var(--sans);font-weight:700;font-size:10pt;margin:16px 0 3px;}
  .rs-headlab{margin-top:24px;font-family:var(--sans);font-weight:700;font-size:10.5pt;text-align:center;}
  .rs-sign{display:flex;justify-content:space-between;gap:32px;margin-top:16px;}
  .rs-sign .col{flex:1;border-top:1px solid #999;padding-top:3px;text-align:center;font-size:9pt;color:var(--muted);font-family:var(--sans);}
`;

// Calibration Results Sheet — same chrome as the testing one (Workstream 2),
// keeping the calibration-specific tables: one per load direction, one row per
// calibration point (result X_lab + expanded uncertainty). Improvised until the
// real calibration Results Sheet is provided.
export function renderResultsC(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const c = s.calibration;
  const unit = c ? esc(c.unit) : "";
  const assigned = L("/to be filled in by the PT Provider/", "/попълва се от РТ провайдъра/");

  const scheme = `<div class="rs-scheme"><span class="lbl">${L(
    "Number and Name of the PT Scheme:",
    "Номер и наименование на схемата за изпитване за пригодност:"
  )}</span> ${esc(s.number)} ${L(s.titleEn, s.titleBg)}</div>`;

  const field = (id: string, en: string, bg: string, note = "") =>
    `<div class="rs-field"><span class="fl">${L(en, bg)}</span> ${fText(id, 240)}${note ? ` <span class="assigned">${note}</span>` : ""}</div>`;

  const top = `${field("lab_code", "Laboratory Code:", "Код на лабораторията:", assigned)}
    ${field("item_code", "PT Item's code:", "Код на обекта на РТ схемата:", assigned)}
    ${c ? `<div class="rs-field"><span class="fl">${L("PT item (travelling device):", "Обект (пътуващо устройство):")}</span> ${L(c.deviceEn, c.deviceBg)}</div>` : ""}
    ${field("lab_name", "Name of the Laboratory:", "Наименование на лабораторията:")}
    ${field("cal_date", "Date/period of performing the calibration:", "Дата/период на провеждане на калибрирането:")}`;

  const warn = (en: string, bg: string) => `<div class="rs-warn">${ICO_WARN}<span>${L(en, bg)}</span></div>`;
  const warnings = `<div class="rs-warns">
    ${warn("Please refer to the 'Instructions for the Participants' (F 7.3.5-1).", "Вижте „Инструкция за участниците“ (Ф 7.3.5-1).")}
    ${warn("Report a result and expanded uncertainty for every calibration point and load direction for which you registered.", "Докладвайте резултат и разширена неопределеност за всяка точка на калибриране и посока на натоварване, за които сте заявили участие.")}
    ${warn("The travelling device is provided solely for the purposes of the proficiency testing scheme; calibrate it in accordance with your own procedure (ISO 376).", "Пътуващото устройство се предоставя единствено за целите на схемата за изпитване за пригодност; калибрирайте го съгласно собствената си методика (ISO 376).")}
  </div>`;

  const directionsEn = c ? c.directionsEn : [];
  const directionsBg = c ? c.directionsBg : [];
  const points = c ? c.points : [];

  const tables =
    directionsEn.length && points.length
      ? directionsEn
          .map((dirEn, i) => {
            const dirBg = directionsBg[i] ?? dirEn;
            const rows = points
              .map(
                (pt, j) => `<tr>
        <td class="pt">${esc(pt)}${unit ? ` ${unit}` : ""}</td>
        <td>${fText(`result_${i}_${j}`, 24)}</td>
        <td>${fText(`unc_${i}_${j}`, 24)}</td>
      </tr>`
              )
              .join("\n");
            return `<div class="rs-tcap">${L(`Table ${i + 1} — ${dirEn} force`, `Таблица ${i + 1} — ${dirBg} сила`)}</div>
    <table class="rtable"><thead><tr>
      <th>${L(`Calibration point (${unit})`, `Точка на калибриране (${unit})`)}</th>
      <th>${L(`Result X_lab (${unit})`, `Резултат X_lab (${unit})`)}</th>
      <th>${L("**Expanded Uncertainty U (k=2, P≈95%)", "**Разширена неопределеност U (k=2, P≈95%)")}</th>
    </tr></thead><tbody>
${rows}
    </tbody></table>`;
          })
          .join("\n")
      : `<p class="muted">${L(
          "Calibration points / load directions are not set for this scheme yet — add them in Edit scheme data, then the result tables appear here.",
          "Точките на калибриране / посоките на натоварване още не са зададени за тази схема — добавете ги в редактирането на данните, след което таблиците ще се появят тук."
        )}</p>`;

  const notes = `<div class="rs-notes">* ${L(
    "Calibration is performed per the laboratory's own procedure — ISO 376 (direct comparison). Each calibration point is loaded according to the method; report the mean result per point.",
    "Калибрирането се извършва по собствената методика на лабораторията — ISO 376 (пряко сравнение). Всяка точка се натоварва съгласно метода; докладвайте средния резултат за точката."
  )}</div>
    <div class="rs-notes">** ${L(
      "If the expanded uncertainty U is not reported for a point, an Eₙ-score cannot be calculated for it. The expanded uncertainty shall be reported in accordance with Clause 6 of the Instruction for Participants.",
      "Ако разширената неопределеност U не е докладвана за дадена точка, за нея не може да се изчисли Eₙ-оценка. Разширената неопределеност се докладва съгласно т. 6 от Инструкцията за участниците."
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
