import type { Scheme, Lang, Clause } from "../types";
import { esc, pick, wrapDoc, sec, footer } from "../doc-shell";
import { reportResultsTesting } from "../scoring";

const FORM = "F 7.4.3-1";
const cl = (lang: Lang, c?: Clause) => (c ? esc(pick(lang, c.en, c.bg)) : "");

// Extra styling for this document only: the accreditation marks on the custom
// cover and the clearly-labelled "results pending" placeholder block. Kept here
// (not in the shared shell) because they are specific to the Final Report.
const REPORT_CSS = `
  .marks{display:flex;gap:22px;justify-content:center;align-items:center;margin:14px 0;}
  .marks .ilac{height:80px;}
  .snasbox{border:1px solid var(--ink);padding:6px 12px;text-align:center;font-family:var(--sans);}
  .snasbox img{height:38px;display:block;margin:0 auto 4px;}
  .snasbox .regno{font-size:9.5pt;color:var(--ink);}
  .provider{margin-top:30px;font-family:var(--sans);font-weight:700;font-size:10pt;line-height:1.5;}
  .provider .blue{color:#3b6fb0;}
  .pending{border:1px dashed var(--green-dark);background:var(--green-soft);border-radius:6px;padding:10px 12px;margin:8px 0;color:var(--green-dark);font-family:var(--sans);font-size:10pt;}
`;

export function renderReport(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const C = (k: string) => `<p>${cl(lang, s.clauses[k])}</p>`;

  // The placeholder rendered wherever participant results would appear. A live
  // scheme has no submitted/scored data yet, so we never invent numbers.
  const pending = `<div class="pending">${L(
    "Results and performance scores are generated automatically once participants submit and the data is scored.",
    "Резултатите и оценките за представяне се генерират автоматично след като участниците подадат данни и те бъдат обработени статистически."
  )}</div>`;

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

  // ---- §2 Scope, test items & methods (from s.parameters) ----
  const s2 = `<p>${L(
    `The proficiency testing covers the object: ${s.objectEn}. The characteristics, applied standard methods, ranges of expected values and the number of specimens are listed below.`,
    `Изпитването за пригодност обхваща обекта: ${s.objectBg}. Характеристиките, приложените стандартни методи, обхватите на очакваните стойности и броят на пробите са посочени по-долу.`
  )}</p>
    <table class="ptable"><thead><tr>
      <th>${L("Standard", "Стандарт")}</th><th>${L("Characteristic", "Характеристика")}</th>
      <th>${L("Range of expected values", "Обхват на очакваните стойности")}</th><th>${L("Specimens", "Брой проби")}</th>
    </tr></thead><tbody>${s.parameters
      .map(
        (pr) => `<tr><td>${L(pr.standardEn, pr.standardBg)}</td><td>${L(pr.characteristicEn, pr.characteristicBg)}</td>
        <td>${L(pr.rangeEn, pr.rangeBg)}</td><td>${L(pr.specimensEn, pr.specimensBg)}</td></tr>`
      )
      .join("")}</tbody></table>
    <div class="note">* ${L(
      "The tests were carried out according to the latest valid version of the specified standard method.",
      "Изпитванията са проведени по последната валидна версия на посочения стандартен метод."
    )}</div>`;

  // ---- §3 Activities by external providers (from s.partner) ----
  const p = s.partner;
  const s3 = `<p>${L(
    "The following activities were performed by an external provider on behalf of PTS Bulgaria.",
    "Следните дейности са извършени от външен доставчик от името на PTS Bulgaria."
  )}</p>
    <div class="partner">
      ${p.logo ? `<img src="${p.logo}" alt="">` : ""}
      <div><b>${L(p.nameEn, p.nameBg)}</b><div class="muted">${L(p.locationEn, p.locationBg)}</div>
      <ul>${(lang === "bg" ? p.servicesBg : p.servicesEn).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    </div>`;

  // ---- §4 Organization & implementation (team) ----
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
      `The number and type of participants, the production, quality control, storage and distribution of the PT items followed the approved Proficiency Testing Plan. At least ${s.minParticipants} participating laboratories were expected.`,
      `Броят и видът на участниците, производството, контролът на качеството, съхранението и разпространението на обектите за изпитване следваха одобрения План на изпитване за пригодност. Очакваха се най-малко ${s.minParticipants} участващи лаборатории.`
    )}</p>`;

  // ---- §5 Normative basis ----
  const s5 = `<p>${L(
    `This proficiency testing was planned, conducted and evaluated in accordance with ${s.standard}, supported by ISO 13528 for the statistical methods. The scheme is operated under accreditation by SNAS (ILAC-MRA), Reg. No. ${s.regNo}.`,
    `Настоящото изпитване за пригодност е планирано, проведено и оценено в съответствие с ${s.standard}, подкрепено от ISO 13528 за статистическите методи. Схемата се провежда при акредитация от SNAS (ILAC-MRA), Рег. № ${s.regNo}.`
  )}</p>`;

  // ---- §6 Confidentiality & publicity ----
  const s6 = C("confidentiality") + C("publicity");

  // ---- §7 Participants (placeholder — no results yet) ----
  const s7 = `<p>${L(
    "Each participant is identified solely by a unique random laboratory code; identities are confidential and known only to PTS Bulgaria staff.",
    "Всеки участник се идентифицира единствено чрез уникален случаен лабораторен код; самоличността е конфиденциална и известна само на служителите на PTS Bulgaria."
  )}</p>${pending}`;

  // ---- §8 Results processing (method description from the scheme) ----
  const s8 = `<h3 class="sub">${L("8.1 Homogeneity and stability", "8.1 Хомогенност и стабилност")}</h3>
    ${C("homogeneity")}
    <h3 class="sub">${L("8.2 Assigned value and its uncertainty", "8.2 Приета стойност и нейната неопределеност")}</h3>
    <p>${L(
      `The assigned value is determined as the ${s.assignedValueMethodEn}. Its standard uncertainty and the standard deviation for proficiency assessment are derived from the participants' results in accordance with ISO 13528.`,
      `Приетата стойност се определя като ${s.assignedValueMethodBg}. Нейната стандартна неопределеност и стандартното отклонение за оценка на пригодността се извеждат от резултатите на участниците съгласно ISO 13528.`
    )}</p>
    ${C("traceability")}
    <h3 class="sub">${L("8.3 Screening for outliers", "8.3 Откриване на отдалечени стойности (бегълци)")}</h3>
    <p>${L(s.scoresEn, s.scoresBg)}</p>
    <h3 class="sub">${L("8.4 z-scores and ζ-scores", "8.4 z-оценки и ζ-оценки")}</h3>
    <p>${L(
      "Each participant's performance is expressed as a z-score (using the standard deviation for proficiency assessment) and a ζ-score (using the participant's reported uncertainty together with the uncertainty of the assigned value). A result is satisfactory when the absolute value of the score is below 2, of warning when between 2 and 3, and unsatisfactory when 3 or above.",
      "Представянето на всеки участник се изразява чрез z-оценка (използваща стандартното отклонение за оценка на пригодността) и ζ-оценка (използваща докладваната от участника неопределеност заедно с неопределеността на приетата стойност). Резултатът е удовлетворителен при абсолютна стойност на оценката под 2, предупредителен между 2 и 3 и неудовлетворителен при 3 и повече."
    )}</p>`;

  // ---- §9 Results & evaluation (real z/ζ tables once scored; else placeholder) ----
  const scored9 = reportResultsTesting(s, lang);
  const s9 = `<p>${L(
    "For each characteristic, this section presents the assigned value with its uncertainty, the per-laboratory reported results and z- and ζ-scores, together with the corresponding result and score charts.",
    "За всяка характеристика този раздел представя приетата стойност с нейната неопределеност, докладваните по лаборатории резултати и z- и ζ-оценки, заедно със съответните графики на резултатите и оценките."
  )}</p>${scored9 || pending}`;

  // ---- §10 Conclusion ----
  const s10 = `<p>${L(
    `The proficiency testing for ${s.objectEn} was conducted in accordance with ${s.standard} and the approved Proficiency Testing Plan. The assigned values and the participants' performance scores are evaluated against the criteria described in section 8. The overall outcome is summarized once all participant data have been received and statistically processed.`,
    `Изпитването за пригодност за ${s.objectBg} е проведено в съответствие с ${s.standard} и одобрения План на изпитване за пригодност. Приетите стойности и оценките за представяне на участниците се оценяват спрямо критериите, описани в раздел 8. Цялостният резултат се обобщава след получаване и статистическа обработка на всички данни на участниците.`
  )}</p>
    ${C("feedback")}`;

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
      <li>${L(
        `Standard methods applied for the characteristics under test (see section 2).`,
        `Стандартни методи, приложени за изпитваните характеристики (вж. раздел 2).`
      )}</li>
      <li>${L("Proficiency Testing Plan", "План на изпитване за пригодност")} (F 7.2.1-1) — ${esc(s.number)}.</li>
    </ul>`;

  const body = [
    cover,
    sec(1, "Introduction and objectives", "Въведение и цели", lang,
      `<p>${L(
        `This Final Report presents the organization, conduct and statistical evaluation of proficiency testing scheme ${s.number} — ${s.titleEn}. The objective of the scheme is to provide participating laboratories with an objective, independent assessment of their performance in the tested characteristics and to support the demonstration and continual improvement of their technical competence.`,
        `Настоящият Окончателен доклад представя организацията, провеждането и статистическата оценка на схемата за изпитване за пригодност ${s.number} — ${s.titleBg}. Целта на схемата е да предостави на участващите лаборатории обективна, независима оценка на тяхното представяне по изпитваните характеристики и да подпомогне доказването и непрекъснатото подобряване на тяхната техническа компетентност.`
      )}</p>`),
    sec(2, "Scope, test items and methods", "Обхват, обекти за изпитване и методи", lang, s2),
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

  return wrapDoc(lang, `${s.number} — Final Report`, body, REPORT_CSS);
}
