import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, sec, footer, coverImgTag } from "../doc-shell";
import { reportResultsCalibration } from "../scoring";

const FORM = "F 7.4.3-1";

// Extra styling for this document only: the accreditation marks on the custom
// cover, the Eₙ formula/criterion call-outs and the clearly-labelled "results
// pending" placeholder. Kept here (not in the shared shell) because they are
// specific to the Calibration Final Report.
export const REPORT_C_CSS = `
  .marks{display:flex;gap:22px;justify-content:center;align-items:center;margin:14px 0;}
  .marks .ilac{height:80px;}
  .snasbox{border:1px solid var(--ink);padding:6px 12px;text-align:center;font-family:var(--sans);}
  .snasbox img{height:38px;display:block;margin:0 auto 4px;}
  .snasbox .regno{font-size:9.5pt;color:var(--ink);}
  .provider{margin-top:30px;font-family:var(--sans);font-weight:700;font-size:10pt;line-height:1.5;}
  .provider .blue{color:#3b6fb0;}
  .cover .coverimg{max-height:42mm;margin:12px auto;}
  .pending{border:1px dashed var(--green-dark);background:var(--green-soft);border-radius:6px;padding:10px 12px;margin:8px 0;color:var(--green-dark);font-family:var(--sans);font-size:10pt;}
  .formula{background:var(--green-soft);border-left:3px solid var(--green);padding:8px 12px;font-family:var(--sans);margin:8px 0;}
  .crit{display:flex;gap:10px;margin:8px 0;}
  .crit .a{flex:1;background:#eaf3e6;border:1px solid var(--green);border-radius:6px;padding:6px 10px;font-family:var(--sans);font-size:10pt;}
  .crit .n{flex:1;background:#f6e7e7;border:1px solid var(--red);border-radius:6px;padding:6px 10px;font-family:var(--sans);font-size:10pt;}
`;

export function renderReportC(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  // GUARD: a non-calibration (or partially seeded) scheme may have no
  // `calibration` block — render blanks rather than crash.
  const c = s.calibration;
  const blank = `<span class="blank"></span>`;
  const cv = (en?: string, bg?: string) =>
    en === undefined && bg === undefined ? blank : esc(pick(lang, en ?? "", bg ?? ""));

  // The placeholder rendered wherever per-participant data would appear. A live
  // scheme has no submitted/scored data yet, so we never invent numbers.
  const pending = `<div class="pending">${L(
    "Results and Eₙ scores are generated automatically once participants submit and the data is processed.",
    "Резултатите и оценките Eₙ се генерират автоматично след подаване на данни от участниците и обработката им."
  )}</div>`;

  const device = c ? cv(c.deviceEn, c.deviceBg) : blank;
  const unit = c ? esc(c.unit) : "";
  const points = c && c.points.length ? esc(c.points.join(", ")) : "";
  const refLab = c ? cv(c.referenceLabEn, c.referenceLabBg) : blank;
  const refLabLoc = c ? cv(c.referenceLabLocEn, c.referenceLabLocBg) : blank;
  const directions = c ? (lang === "bg" ? c.directionsBg : c.directionsEn) : [];

  // ---- COVER (custom: copy of cover() markup + accreditation marks) ----
  const cover = `<div class="cover">
    <div class="head"><img class="logo" src="/brand/logo.png" alt="PTS Bulgaria"><img class="tag" src="/brand/tagline.png" alt=""></div>
    <img class="emb" src="/brand/embroidery-border.png" alt="">
    <div class="marks">
      <img class="ilac" src="/brand/ilac-mra.jpg" alt="ilac-MRA">
      <div class="snasbox"><img src="/brand/snas.png" alt="SNAS"><div class="regno">${L("Reg. No.", "Рег. №")} ${esc(s.regNo)}</div></div>
    </div>
    <div class="docttl">${L("FINAL REPORT", "ОКОНЧАТЕЛЕН ДОКЛАД")}</div>
    <div class="schemeno">${L("ON PROFICIENCY TESTING No.", "ОТ ИЗПИТВАНЕ ЗА ПРИГОДНОСТ №")} ${esc(s.number)}</div>
    <div class="schemettl">${L(s.titleEn, s.titleBg)}</div>
    ${coverImgTag(s)}
    <div class="provider">
      <div>${L("PT Provider PTS Bulgaria at", "Организатор на изпитване за пригодност PTS Bulgaria към")}</div>
      <div>Proficiency Testing Solutions Bulgaria Ltd</div>
      <div>${L("36, Despot Slav St., Smolyan, Republic of Bulgaria", "ул. „Деспот Слав“ 36, гр. Смолян, Република България")}</div>
      <div class="blue">office@ptsbg.eu &nbsp; www.ptsbg.eu</div>
    </div>
    <div class="sig">
      <div class="col">${esc(s.revisionDate)}<br>${L("Date", "Дата")}</div>
      <div class="col">&nbsp;<br>${L("PT Scheme Manager", "Ръководител на схемата")}</div>
    </div>
  </div>`;

  // ---- §1 Introduction and objectives ----
  const s1 = `<p>${L(
    `This Final Report presents the organization, conduct and evaluation of calibration proficiency testing scheme ${s.number} — ${s.titleEn}. In a calibration scheme a single artefact circulates from one participant to the next, each laboratory calibrates it, and every laboratory's result is assessed against the reference value provided by an independent reference laboratory. The objective is to give participating calibration laboratories an objective, independent assessment of their performance and to support the demonstration and continual improvement of their technical competence.`,
    `Настоящият Окончателен доклад представя организацията, провеждането и оценката на схемата за изпитване за пригодност чрез калибриране ${s.number} — ${s.titleBg}. При схема чрез калибриране един артефакт обикаля от един участник към следващия, всяка лаборатория го калибрира, а резултатът на всяка лаборатория се оценява спрямо референтната стойност, предоставена от независима референтна лаборатория. Целта е да се предостави на участващите калибровъчни лаборатории обективна, независима оценка на тяхното представяне и да се подпомогне доказването и непрекъснатото подобряване на тяхната техническа компетентност.`
  )}</p>`;

  // ---- §2 Scope and PT item ----
  const s2 = `<p>${L(
    `The proficiency testing covers the object: ${s.objectEn}. The PT item, the calibration points and the unit of measurement are listed below.`,
    `Изпитването за пригодност обхваща обекта: ${s.objectBg}. Обектът за изпитване, точките на калибриране и мерната единица са посочени по-долу.`
  )}</p>
    <table class="ptable"><tbody>
      <tr><th>${L("PT item (device)", "Обект за изпитване (устройство)")}</th><td>${device}</td></tr>
      <tr><th>${L("Calibration points", "Точки на калибриране")} (${unit})</th><td>${points}</td></tr>
      <tr><th>${L("Unit of measurement", "Мерна единица")}</th><td>${unit}</td></tr>
      <tr><th>${L("Load directions", "Видове натоварване")}</th><td>${directions.length ? esc(directions.join(", ")) : blank}</td></tr>
    </tbody></table>`;

  // ---- §3 Activities performed by external providers (the reference lab) ----
  const s3 = `<p>${L(
    "The reference (assigned) values for this scheme were established by an external reference laboratory acting on behalf of PTS Bulgaria. The reference laboratory calibrated the travelling device before and after circulation.",
    "Референтните (приети) стойности за тази схема са установени от външна референтна лаборатория, действаща от името на PTS Bulgaria. Референтната лаборатория калибрира пътуващото устройство преди и след обиколката."
  )}</p>
    <div class="partner">
      <div><b>${refLab}</b><div class="muted">${refLabLoc}</div>
      <ul><li>${L(
        "Calibration of the travelling device before and after circulation (reference values and uncertainties).",
        "Калибриране на пътуващото устройство преди и след обиколката (референтни стойности и неопределености)."
      )}</li>
      <li>${L(
        "Assessment of the stability of the travelling device.",
        "Оценка на стабилността на пътуващото устройство."
      )}</li></ul></div>
    </div>`;

  // ---- §4 Organization and implementation (sequential circulation) ----
  const s4 = `<p>${L(
    "The scheme was organized and implemented by the personnel of PTS Bulgaria, in accordance with the documented procedures of the proficiency testing provider.",
    "Схемата е организирана и проведена от персонала на PTS Bulgaria, съгласно документираните процедури на организатора на изпитване за пригодност."
  )}</p>
    <div class="team">${s.team
      .map(
        (m) => `<div class="role"><span class="rl">${L(m.roleEn, m.roleBg)}</span><span class="nm">${esc(m.name)}</span></div>`
      )
      .join("")}</div>
    <p>${L(
      `The PT item circulates sequentially: a single device travels from one participant to the next, in the order recorded in the List of Registered Participants. Each participant calibrates the device under the specified conditions, reports the results and forwards the device to the next laboratory. At least ${s.minParticipants} participating laboratory was expected, since the reference laboratory provides the assigned value.`,
      `Обектът за изпитване се разпространява последователно: едно устройство пътува от един участник към следващия, по реда, записан в Списъка на регистрираните участници. Всеки участник калибрира устройството при определените условия, докладва резултатите и препраща устройството към следващата лаборатория. Очакваше се най-малко ${s.minParticipants} участваща лаборатория, тъй като референтната лаборатория предоставя приетата стойност.`
    )}</p>`;

  // ---- §5 Normative basis ----
  const method = c ? cv(c.methodEn, c.methodBg) : blank;
  const s5 = `<p>${L(
    `This proficiency testing was planned, conducted and evaluated in accordance with ${s.standard}, supported by ISO 13528 for the statistical methods and by the applicable calibration method (${c ? pick(lang, c.methodEn, c.methodBg) : ""}). The scheme is operated under accreditation by SNAS (ILAC-MRA), Reg. No. ${s.regNo}.`,
    `Настоящото изпитване за пригодност е планирано, проведено и оценено в съответствие с ${s.standard}, подкрепено от ISO 13528 за статистическите методи и от приложимия метод за калибриране (${c ? pick(lang, c.methodEn, c.methodBg) : ""}). Схемата се провежда при акредитация от SNAS (ILAC-MRA), Рег. № ${s.regNo}.`
  )}</p>
    <p class="muted">${L("Calibration method", "Метод за калибриране")}: ${method}.</p>`;

  // ---- §6 Confidentiality and publicity ----
  const s6 = `<p>${L(
    "Each participant is assigned a unique random laboratory code. The identity of participants is known only to PTS Bulgaria staff, and participants sign a Confidentiality Declaration before the scheme starts.",
    "На всеки участник се присвоява уникален случаен лабораторен код. Самоличността на участниците е известна само на служителите на PTS Bulgaria, а участниците подписват Декларация за конфиденциалност преди старта на схемата."
  )}</p>
    <p>${L(
      "Participant identities and performance are confidential. Information on the certificates issued for the scheme is published in the Register section of www.ptsbg.eu.",
      "Самоличността и представянето на участниците са конфиденциални. Информация за издадените за схемата сертификати се публикува в раздел „Регистър“ на www.ptsbg.eu."
    )}</p>`;

  // ---- §7 Participants (placeholder — no results yet) ----
  const s7 = `<p>${L(
    "Each participant is identified solely by a unique random laboratory code; identities are confidential and known only to PTS Bulgaria staff. The list of participating laboratory codes and the order of circulation are recorded once registration closes.",
    "Всеки участник се идентифицира единствено чрез уникален случаен лабораторен код; самоличността е конфиденциална и известна само на служителите на PTS Bulgaria. Списъкът с кодовете на участващите лаборатории и редът на обиколката се записват след приключване на регистрацията."
  )}</p>${pending}`;

  // ---- §8 Processing of the results ----
  const stabilityFormula = c ? esc(c.stabilityFormula) : "";
  const s8 = `<h3 class="sub">${L("8.1 Stability of the travelling device", "8.1 Стабилност на пътуващото устройство")}</h3>
    <p>${L(
      "The stability of the travelling device is assessed by the reference laboratory, which calibrates the device before and after circulation. The stability contribution to the uncertainty is evaluated as a rectangular distribution from the difference between the two reference calibrations:",
      "Стабилността на пътуващото устройство се оценява от референтната лаборатория, която калибрира устройството преди и след обиколката. Приносът на стабилността към неопределеността се оценява като правоъгълно разпределение от разликата между двете референтни калибрирания:"
    )}</p>
    <div class="formula"><b>${stabilityFormula || blank}</b></div>
    <h3 class="sub">${L("8.2 Assigned (reference) values and their uncertainties", "8.2 Приети (референтни) стойности и техните неопределености")}</h3>
    <p>${L(
      `The assigned value at each calibration point is provided by the reference laboratory: ${s.assignedValueMethodEn} Its expanded uncertainty U_ref combines the calibration uncertainty of the reference laboratory with the stability contribution u_stab. The reference values are traceable to national/international standards through the reference laboratory's calibration.`,
      `Приетата стойност за всяка точка на калибриране се предоставя от референтната лаборатория: ${s.assignedValueMethodBg} Нейната разширена неопределеност U_ref съчетава неопределеността при калибриране на референтната лаборатория с приноса на стабилността u_stab. Референтните стойности са проследими до национални/международни еталони чрез калибрирането на референтната лаборатория.`
    )}</p>
    <h3 class="sub">${L("8.3 The Eₙ criterion", "8.3 Критерият Eₙ")}</h3>
    <p>${L(
      "Each participant's performance is expressed as an Eₙ number, comparing the deviation of the laboratory's result from the reference value against the combined expanded uncertainty of the laboratory and the reference. Each calibration point and each load direction are scored separately.",
      "Представянето на всеки участник се изразява чрез число Eₙ, което сравнява отклонението на резултата на лабораторията от референтната стойност с комбинираната разширена неопределеност на лабораторията и референцията. Всяка точка на калибриране и всяка посока на натоварване се оценяват поотделно."
    )}</p>
    <div class="formula"><b>Eₙ = (X_LAB − X_REF) / √(U_LAB² + U_REF²)</b></div>
    <div class="crit">
      <div class="a">${L(
        "|Eₙ| ≤ 1.00 → satisfactory (A) — no action signal",
        "|Eₙ| ≤ 1,00 → удовлетворително (A) — няма сигнал за действие"
      )}</div>
      <div class="n">${L(
        "|Eₙ| > 1.00 → unsatisfactory (N) — action signal",
        "|Eₙ| > 1,00 → неудовлетворително (N) — сигнал за действие"
      )}</div>
    </div>
    <p class="muted">${c ? cv(c.enCriterionEn, c.enCriterionBg) : blank}</p>`;

  // ---- §9 Results and evaluation (per-participant Eₙ tables, placeholder) ----
  const directionList = directions.length
    ? directions
    : [pick(lang, "Tension", "Опън"), pick(lang, "Compression", "Натиск")];
  const s9 = `<p>${L(
    `For each participant and each load direction, this section presents an Eₙ table: per calibration point the laboratory's result X_LAB with its expanded uncertainty U_LAB, the reference value X_REF with U_REF, the difference D = X_LAB − X_REF, the resulting Eₙ and the satisfactory/unsatisfactory (A/N) verdict.`,
    `За всеки участник и всяка посока на натоварване този раздел представя таблица Eₙ: за всяка точка на калибриране резултата на лабораторията X_LAB с неговата разширена неопределеност U_LAB, референтната стойност X_REF с U_REF, разликата D = X_LAB − X_REF, полученото Eₙ и заключението удовлетворително/неудовлетворително (A/N).`
  )}</p>
    ${
      reportResultsCalibration(s, lang) ||
      directionList
        .map(
          (d) => `<h3 class="sub">${esc(d)} — ${L("Eₙ scores per participant", "Оценки Eₙ по участник")}</h3>${pending}`
        )
        .join("")
    }`;

  // ---- §10 Conclusion ----
  const s10 = `<p>${L(
    `The calibration proficiency testing for ${s.objectEn} was conducted in accordance with ${s.standard} and the approved Proficiency Testing Plan. Each participant's results are evaluated against the reference values using the Eₙ criterion described in section 8, separately for each calibration point and load direction. The overall outcome is summarized once all participant data have been received and processed.`,
    `Изпитването за пригодност чрез калибриране за ${s.objectBg} е проведено в съответствие с ${s.standard} и одобрения План на изпитване за пригодност. Резултатите на всеки участник се оценяват спрямо референтните стойности чрез критерия Eₙ, описан в раздел 8, поотделно за всяка точка на калибриране и посока на натоварване. Цялостният резултат се обобщава след получаване и обработка на всички данни на участниците.`
  )}</p>
    <p>${L(
      "After the Final Report, participants receive a Feedback Sheet to assess satisfaction, needs and expectations.",
      "След окончателния доклад участниците получават Формуляр за обратна връзка за оценка на удовлетвореност, потребности и очаквания."
    )}</p>`;

  // ---- §11 References ----
  const s11 = `<ul>
      <li>${esc(s.standard)} — ${L(
        "Conformity assessment — General requirements for the competence of proficiency testing providers",
        "Оценяване на съответствието — Общи изисквания за компетентността на организаторите на изпитване за пригодност"
      )}</li>
      <li>ISO 13528 — ${L(
        "Statistical methods for use in proficiency testing by interlaboratory comparison",
        "Статистически методи за използване при изпитване за пригодност чрез междулабораторни сравнения"
      )}</li>
      <li>${c ? cv(c.methodEn, c.methodBg) : L("Calibration method applied to the PT item (see section 5).", "Метод за калибриране, приложен към обекта за изпитване (вж. раздел 5).")}</li>
      <li>${L("Proficiency Testing Plan", "План на изпитване за пригодност")} (F 7.2.1-1) — ${esc(s.number)}.</li>
    </ul>`;

  const body = [
    cover,
    sec(1, "Introduction and objectives", "Въведение и цели", lang, s1),
    sec(2, "Scope and PT item", "Обхват и обект за изпитване", lang, s2),
    sec(3, "Activities performed by external providers", "Дейности, извършени от външни доставчици", lang, s3),
    sec(4, "Organization and implementation", "Организация и провеждане", lang, s4),
    sec(5, "Normative basis", "Нормативна основа", lang, s5),
    sec(6, "Confidentiality and publicity", "Конфиденциалност и публичност", lang, s6),
    sec(7, "Participants", "Участници", lang, s7),
    sec(8, "Processing of the results", "Обработка на резултатите", lang, s8),
    sec(9, "Results and evaluation", "Резултати и оценка", lang, s9),
    sec(10, "Conclusion", "Заключение", lang, s10),
    sec(11, "References", "Използвани източници", lang, s11),
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Calibration Final Report`, body, REPORT_C_CSS);
}
