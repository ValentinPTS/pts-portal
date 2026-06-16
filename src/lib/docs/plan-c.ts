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

  // §1 — distribution. Calibration is Sequential.
  const seq = s.distribution === "sequential";
  const s1 = `<p>${L("Distribution type:", "Вид на разпространение:")}
    <b>${!seq ? "☑" : "☐"} ${L("Simultaneous", "Едновременно")}</b> &nbsp; <b>${seq ? "☑" : "☐"} ${L("Sequential", "Последователно")}</b></p>`;

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
  const s10 = `<div class="cals">${s.schedule
    .map((it) => {
      const [d, m] = it.date.split(".");
      return `<div class="cal"><span class="bar"></span><div class="d">${d}.${m}</div><div class="lbl">${L(it.labelEn, it.labelBg)}</div></div>`;
    })
    .join("")}</div>`;

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
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Plan`, body);
}
