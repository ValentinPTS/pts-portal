import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, cover, heading, footer } from "../doc-shell";
import { fText } from "../form-fields";

const FORM = "F 7.2.1-7";

// Calibration variant of the Results Sheet. One device travels lab → lab; the
// participant reports a result + expanded uncertainty per calibration point,
// for each force direction (tension / compression). See poc/calibration-
// results-sheet-preview.html and TESTING-vs-CALIBRATION.md.
export function renderResultsC(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  // `calibration` is optional in the type — guard so absent data renders blank.
  const c = s.calibration;
  const unit = c ? esc(c.unit) : "";

  const assigned = L("— assigned by PTS —", "— попълва се от РТ провайдъра —");

  // Top fields — Laboratory Code is assigned by the provider; PT item is the
  // travelling device (its name shown as a hint).
  const topFields = `<div class="fld"><span class="fl">${L(
    "Laboratory Code:",
    "Лабораторен код:"
  )}</span> ${fText("lab_code", 200)} <span class="muted">${assigned}</span></div>
    <div class="fld"><span class="fl">${L(
      "PT Item:",
      "Обект:"
    )}</span> ${fText("item", 200)} <span class="muted">${
    c ? L(c.deviceEn, c.deviceBg) : ""
  }</span></div>`;

  // One results table per force direction (e.g. Table 1 — Tension Force,
  // Table 2 — Compression Force). Each table has one row per calibration point;
  // the participant fills the result + expanded uncertainty for each.
  const directionsEn = c ? c.directionsEn : [];
  const directionsBg = c ? c.directionsBg : [];
  const points = c ? c.points : [];

  const pointCol = L(`Calibration point (${c ? c.unit : ""})`, `Точка на калибриране (${c ? c.unit : ""})`);
  const resultCol = L(`Result X_lab (${c ? c.unit : ""})`, `Резултат X_lab (${c ? c.unit : ""})`);
  const uncCol = L(
    "Expanded uncertainty U (k=2, P≈95%)",
    "Разширена неопределеност U (k=2, P≈95%)"
  );

  const tables = directionsEn
    .map((dirEn, i) => {
      const dirBg = directionsBg[i] ?? dirEn;
      const rows = points
        .map(
          (pt, j) => `<tr>
        <td>${esc(pt)}${unit ? ` ${unit}` : ""}</td>
        <td>${fText(`result_${i}_${j}`, 150)}</td>
        <td>${fText(`unc_${i}_${j}`, 150)}</td>
      </tr>`
        )
        .join("\n");
      return `<h3 class="sub">${L(
        `Table ${i + 1} — ${dirEn} Force`,
        `Таблица ${i + 1} — ${dirBg} сила`
      )}</h3>
    <table class="ptable"><thead><tr>
      <th>${pointCol}</th>
      <th>${resultCol}</th>
      <th>${uncCol}</th>
    </tr></thead><tbody>
${rows}
    </tbody></table>`;
    })
    .join("\n");

  // Method note + uncertainty note — bilingual, from the POC.
  const notes = `<div class="note">* ${L(
    "Calibration per the laboratory's own procedure — ISO 376 (direct comparison). Each calibration point is loaded according to the method; report the mean result per point.",
    "Калибриране по собствената методика на лабораторията — ISO 376 (пряко сравнение). Всяка точка се натоварва съгласно метода; докладвайте средния резултат за точката."
  )}</div>
    <div class="note">** ${L(
      "If the expanded uncertainty U is not reported for a point, an Eₙ-score cannot be calculated for it.",
      "Ако разширената неопределеност U не е докладвана за дадена точка, за нея не може да се изчисли Eₙ-оценка."
    )}</div>`;

  const body = [
    cover(s, lang, "RESULTS SHEET", "ЛИСТ С РЕЗУЛТАТИ", { withImage: false }),
    heading("RESULTS", "РЕЗУЛТАТИ", lang),
    `<div class="body">${topFields}${tables}${notes}</div>`,
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Results Sheet`, body);
}
