import type { Scheme, Lang, Clause } from "../types";
import { esc, pick, wrapDoc, cover, sec, footer } from "../doc-shell";

const FORM = "F 7.2.1-1";
const cl = (lang: Lang, c?: Clause) => (c ? esc(pick(lang, c.en, c.bg)) : "");

export function renderPlan(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const C = (k: string) => `<p>${cl(lang, s.clauses[k])}</p>`;

  const sim = s.distribution === "simultaneous";
  const s1 = `<p>${L("Distribution type:", "Вид на разпространение:")}
    <b>${sim ? "☑" : "☐"} ${L("Simultaneous", "Едновременно")}</b> &nbsp; <b>${!sim ? "☑" : "☐"} ${L("Sequential", "Последователно")}</b></p>`;

  const s2 = `<div class="team">${s.team
    .map((m) => `<div class="role"><span class="rl">${L(m.roleEn, m.roleBg)}</span><span class="nm">${esc(m.name)}</span></div>`)
    .join("")}</div>`;

  const p = s.partner;
  const s3 = `<div class="partner">
      ${p.logo ? `<img src="${p.logo}" alt="">` : ""}
      <div><b>${L(p.nameEn, p.nameBg)}</b><div class="muted">${L(p.locationEn, p.locationBg)}</div>
      <ul>${(lang === "bg" ? p.servicesBg : p.servicesEn).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    </div>`;

  const s6 = `<table class="ptable"><thead><tr>
      <th>${L("Standard", "Стандарт")}</th><th>${L("Characteristic", "Характеристика")}</th>
      <th>${L("Range of expected values", "Обхват на очакваните стойности")}</th><th>${L("Specimens", "Брой проби")}</th>
    </tr></thead><tbody>${s.parameters
      .map(
        (pr) => `<tr><td>${L(pr.standardEn, pr.standardBg)}</td><td>${L(pr.characteristicEn, pr.characteristicBg)}</td>
        <td>${L(pr.rangeEn, pr.rangeBg)}</td><td>${L(pr.specimensEn, pr.specimensBg)}</td></tr>`
      )
      .join("")}</tbody></table>
    <div class="note">* ${L("The tests will be carried out according to the latest valid version of the specified standard method!", "Изпитванията ще се проведат по последната валидна версия на посочения стандартен метод!")}</div>`;

  const s10 = `<div class="cals">${s.schedule
    .map((it) => {
      const [d, m] = it.date.split(".");
      return `<div class="cal"><span class="bar"></span><div class="d">${d}.${m}</div><div class="lbl">${L(it.labelEn, it.labelBg)}</div></div>`;
    })
    .join("")}</div>`;

  const s14 = `<p><b>${L("Assigned value:", "Приета стойност:")}</b> ${L(s.assignedValueMethodEn, s.assignedValueMethodBg)}</p>
    <p><b>${L("Performance scores:", "Оценки за представяне:")}</b> ${L(s.scoresEn, s.scoresBg)}</p>`;

  const s21 = `<p>${cl(lang, s.clauses.financial)}</p>
    <table class="ptable"><thead><tr>
      <th>${L("Characteristic", "Характеристика")}</th><th>${L("First sample", "Първа проба")}</th><th>${L("Each additional sample", "Всяка следваща проба")}</th>
    </tr></thead><tbody>${s.prices
      .map((r) => `<tr><td>${L(r.characteristicEn, r.characteristicBg)}</td><td>${esc(r.first)}</td><td>${esc(r.additional)}</td></tr>`)
      .join("")}</tbody></table>
    <div class="example">${L("Example scheme data — official prices are set per scheme in the Application (F 7.2.1-3).", "Примерни данни — официалните цени се определят за всяка схема в Заявката (Ф 7.2.1-3).")}</div>`;

  const body = [
    cover(s, lang, "PROFICIENCY TESTING PLAN", "ПЛАН НА ИЗПИТВАНЕ ЗА ПРИГОДНОСТ", { withImage: true }),
    sec(1, "Type of the proficiency testing scheme", "Вид на схемата за изпитване за пригодност", lang, s1),
    sec(2, "Personnel involved in the scheme", "Персонал, участващ в схемата за изпитване за пригодност", lang, s2),
    sec(3, "Information about external providers", "Информация за услуги, доставени от външни доставчици", lang, s3),
    sec(4, "Criteria for participation", "Критерии за участие", lang, C("criteria")),
    sec(5, "Number and type of expected participants", "Брой и вид на очакваните участници", lang, `<p>${L(`At least ${s.minParticipants} laboratories.`, `Най-малко ${s.minParticipants} лаборатории.`)} ${cl(lang, s.clauses.expected)}</p>`),
    sec(6, "Selection of methods, parameters and range of expected values", "Избор на методи, характеристики и обхват на очакваните стойности", lang, s6),
    sec(7, "Potential major sources of errors", "Потенциални основни източници на грешки", lang, C("errors")),
    sec(8, "Production, quality control, storage and distribution", "Производство, контрол на качеството, съхранение и разпространение", lang, C("production")),
    sec(9, "Confidentiality", "Конфиденциалност", lang, C("confidentiality")),
    sec(10, "Time schedule", "График на схемата", lang, s10),
    sec(11, "Storage, handling, dispatch and disposal", "Съхранение, манипулиране, изпращане и изхвърляне", lang, C("storage")),
    sec(12, "Homogeneity and stability methods", "Методи за определяне на хомогенността и стабилността", lang, C("homogeneity")),
    sec(13, "Reporting of results", "Докладване на резултатите", lang, C("reporting")),
    sec(14, "Statistical analysis and evaluation criteria", "Статистически анализ и критерии за оценка", lang, s14),
    sec(15, "Origin, traceability and uncertainty of the assigned value", "Произход, проследимост и неопределеност на приетата стойност", lang, C("traceability")),
    sec(16, "Treatment of results from different methods", "Обработване на резултати по различни методи", lang, C("differentMethods")),
    sec(17, "Publicity of information and final report", "Публичност на информацията и окончателния доклад", lang, C("publicity")),
    sec(18, "Actions for lost, delayed or damaged items", "Действия при загубен, забавен или повреден обект", lang, C("lostDamaged")),
    sec(19, "Feedback and communication", "Обратна връзка и комуникация", lang, C("feedback")),
    sec(20, "Applying for participation", "Заявяване на участие", lang, C("applying")),
    sec(21, "Financial conditions", "Финансови условия", lang, s21),
    sec(22, "Contacts", "Контакти", lang, C("contacts")),
    // closing signature block, as on the real template's last page
    `<div class="sig" style="margin-top:44px;gap:60px"><div class="col" style="max-width:190px">${pick(lang, "Date", "Дата")}</div><div class="col" style="max-width:360px">${pick(lang, "Head of the proficiency testing scheme", "Ръководител на схемата за изпитване за пригодност")}</div></div>`,
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Plan`, body);
}
