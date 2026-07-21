import type { Scheme, Lang, Clause } from "../types";
import { esc, pick, wrapDoc, cover, sec, footer } from "../doc-shell";

const FORM = "F 7.2.1-1";
const cl = (lang: Lang, c?: Clause) => (c ? esc(pick(lang, c.en, c.bg)) : "");

// Calibration variant of the 22-section Plan. One device travels lab → lab
// (sequential); each lab is scored against a reference laboratory via Eₙ.
export function renderPlanC(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const C = (k: string) => `<p>${cl(lang, s.clauses[k])}</p>`;

  // `calibration` is optional in the type — guard so absent fields render blank.
  const c = s.calibration;
  const cU = c ? esc(c.unit) : "";

  // §1 — distribution. Calibration is Sequential. Rendered exactly like the printed
  // template: two full option paragraphs (Annex A definitions), the scheme's own
  // type ticked. p.opt = hanging box + tight lines.
  const seq = s.distribution === "sequential";
  const box = (on: boolean) => `<span class="ff-box${on ? " on" : ""}">${on ? "✓" : ""}</span>&nbsp;`;
  const s1 =
    `<p class="opt">${box(!seq)}${L(
      "Simultaneous PT scheme - subsamples from a source of material are distributed simultaneously to participants for concurrent testing. (A.2.2 of Annex A of ISO/IEC 17043:2023)",
      "Едновременна схема за РТ - подпроби от един източник на материал, които се разпространяват едновременно до участниците за едновременно изпитване. (т. А.2.2 от Приложение А на ISO/IEC 17043:2023)"
    )}</p>` +
    `<p class="opt">${box(seq)}${L(
      "Sequential PT scheme - a proficiency test item is distributed successively from one participant to the next, or occasionally returned to the proficiency testing provider for rechecking. (A.2.3 of Annex A of ISO/IEC 17043:2023)",
      "Последователна схема за РТ - обект на изпитване за пригодност, който се разпространява последователно от един участник към следващия, или понякога се връща обратно към организатора на изпитването за пригодност за повторна проверка. (т. А.2.3 от Приложение А на ISO/IEC 17043:2023)"
    )}</p>`;

  // §2 — team grid (includes a Technical Expert in the seed data).
  const s2 = `<div class="team">${s.team
    .map((m) => `<div class="role"><span class="rl">${L(m.roleEn, m.roleBg)}</span><span class="nm">${esc(m.name)}</span></div>`)
    .join("")}</div>`;

  // §3 — external providers = the REFERENCE LABORATORY (not a sampling partner).
  const s3 = `<div class="partner">
      <div><b>${c ? L(c.referenceLabEn, c.referenceLabBg) : ""}</b>
      <div class="muted">${c ? L(c.referenceLabLocEn, c.referenceLabLocBg) : ""}</div>
      <ul>
        <li>${L("Calibration of the PT item before and after the participant measurements.", "Калибриране на обекта преди и след измерванията от участниците.")}</li>
        <li>${L("The reference-laboratory results set the reference values and their uncertainties.", "Резултатите от референтната лаборатория определят референтните стойности и неопределеностите им.")}</li>
      </ul></div>
    </div>`;

  // §6 — calibration POINTS table (device, points + unit, method). No standard/specimens columns.
  const points = c ? c.points.map((pt) => esc(pt)).join(", ") : "";
  const s6 = `<table class="ptable"><tbody>
      <tr><th>${L("Quantity", "Величина")}</th><td>${c ? L(c.quantityEn, c.quantityBg) : ""}</td></tr>
      <tr><th>${L("PT item (device)", "Обект (устройство)")}</th><td>${c ? L(c.deviceEn, c.deviceBg) : ""}</td></tr>
      <tr><th>${L("Calibration points", "Точки на калибриране")}</th><td>${points}${points && cU ? ` ${cU}` : ""}</td></tr>
      <tr><th>${L("Method", "Метод")}</th><td>${c ? L(c.methodEn, c.methodBg) : ""}</td></tr>
    </tbody></table>`;

  // §10 — green calendars from the schedule (same as plan.ts).
  // §10 as a real TABLE (one styled cell per date, side by side) so the owner can
  // use every table tool on it — resize, tighter rows, merge, add/remove columns.
  const s10 = `<table style="width:100%;border-collapse:separate;border-spacing:8px 0"><tbody><tr>${s.schedule
    .map((it) => {
      const dm = it.date.includes(".") ? it.date.split(".").slice(0, 2).join(".") : it.date || "—";
      return `<td style="width:${Math.round(100 / Math.max(1, s.schedule.length))}%;border:1px solid #88a77b;border-radius:8px;padding:0;text-align:center;vertical-align:top;overflow:hidden"><div style="height:10px;background:#88a77b"></div><div style="font-family:'Sofia Sans Condensed',Arial,sans-serif;font-weight:700;color:#9e2b2b;font-size:13pt;padding:4px 2px 0">${esc(dm)}</div><div style="font-size:8pt;color:#6b6b6b;padding:2px 4px 6px;line-height:1.15">${L(it.labelEn, it.labelBg)}</div></td>`;
    })
    .join("")}</tr></tbody></table>`;

  // §12 — stability of the travelling device + the formula.
  const s12 = `<p>${cl(lang, s.clauses.homogeneity)}</p>${c ? `<div class="note">${esc(c.stabilityFormula)}</div>` : ""}`;

  // §14 — the Eₙ criterion + assigned-value method and scores.
  const s14 = `<p><b>${L("Assigned value:", "Приета стойност:")}</b> ${L(s.assignedValueMethodEn, s.assignedValueMethodBg)}</p>
    <p><b>${L("Performance scores:", "Оценки за представяне:")}</b> ${L(s.scoresEn, s.scoresBg)}</p>
    ${c ? `<p><b>${L("Performance criterion (Eₙ):", "Критерий за оценка (Eₙ):")}</b> ${L(c.enCriterionEn, c.enCriterionBg)}</p>` : ""}`;

  const body = [
    cover(s, lang, "PROFICIENCY TESTING PLAN", "ПЛАН НА ИЗПИТВАНЕ ЗА ПРИГОДНОСТ", { withImage: true }),
    sec(1, "Type of the proficiency testing scheme", "Вид на схемата за изпитване за пригодност", lang, s1),
    sec(2, "Personnel involved in the scheme", "Персонал, участващ в схемата за изпитване за пригодност", lang, s2),
    sec(3, "Information about external providers", "Информация за услуги, доставени от външни доставчици", lang, s3),
    sec(4, "Criteria for participation", "Критерии за участие", lang, C("criteria")),
    sec(5, "Number and type of expected participants", "Брой и вид на очакваните участници", lang, `<p>${L(`Minimum ${s.minParticipants}, maximum 5 laboratories.`, `Минимум ${s.minParticipants}, максимум 5 лаборатории.`)} ${cl(lang, s.clauses.expected)}</p>`),
    sec(6, "Selection of method, measured quantity and calibration points", "Избор на метод, измервана величина и точки на калибриране", lang, s6),
    sec(7, "Potential major sources of errors", "Потенциални основни източници на грешки", lang, C("errors")),
    sec(8, "Production, quality control, storage and distribution", "Производство, контрол на качеството, съхранение и разпространение", lang, C("production")),
    sec(9, "Confidentiality", "Конфиденциалност", lang, C("confidentiality")),
    sec(10, "Time schedule", "График на схемата", lang, s10),
    sec(11, "Storage, handling, dispatch and disposal", "Съхранение, манипулиране, изпращане и изхвърляне", lang, C("storage")),
    sec(12, "Homogeneity and stability methods", "Методи за определяне на хомогенността и стабилността", lang, s12),
    sec(13, "Reporting of results", "Докладване на резултатите", lang, C("reporting")),
    sec(14, "Statistical analysis and evaluation criteria", "Статистически анализ и критерии за оценка", lang, s14),
    sec(15, "Origin, traceability and uncertainty of the assigned value", "Произход, проследимост и неопределеност на приетата стойност", lang, C("traceability")),
    sec(16, "Treatment of results from different methods", "Обработване на резултати по различни методи", lang, C("differentMethods")),
    sec(17, "Publicity of information and final report", "Публичност на информацията и окончателния доклад", lang, C("publicity")),
    sec(18, "Actions for lost, delayed or damaged items", "Действия при загубен, забавен или повреден обект", lang, C("lostDamaged")),
    sec(19, "Feedback and communication", "Обратна връзка и комуникация", lang, C("feedback")),
    sec(20, "Applying for participation", "Заявяване на участие", lang, C("applying")),
    sec(21, "Financial conditions", "Финансови условия", lang, C("financial")),
    sec(22, "Contacts", "Контакти", lang, C("contacts")),
    // closing signature block, as on the real template's last page
    `<div class="sig" style="margin-top:44px;gap:60px"><div class="col" style="max-width:190px;border-top:none"><p style="margin:0;min-height:17px;border-bottom:2px solid var(--green-dark)"><br></p>${pick(lang, "Date", "Дата")}</div><div class="col" style="max-width:360px;border-top:none"><p style="margin:0;min-height:17px;border-bottom:2px solid var(--green-dark)"><br></p>${pick(lang, "Head of the proficiency testing scheme", "Ръководител на схемата за изпитване за пригодност")}</div></div>`,
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Plan`, body);
}
