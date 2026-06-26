import type { Scheme, Lang, Block, Participant } from "./types";
import { esc, pick, wrapDoc, cover, footer } from "./doc-shell";
import { reportResultsTesting, reportResultsCalibration } from "./scoring";

// ── The snippet library (step 1: built-in starters; step 2 adds save-your-own) ──
export interface Element {
  id: string;
  name: string;
  category: string;
  bg: string;
  en: string;
}

export const LIBRARY: Element[] = [
  {
    id: "confidentiality", name: "Confidentiality", category: "General",
    en: "Each participant is assigned a unique random laboratory code. The identity of participants is known only to PTS Bulgaria staff. Participants sign a Confidentiality Declaration.",
    bg: "На всеки участник се присвоява уникален случаен лабораторен код. Самоличността на участниците е известна само на служителите на PTS Bulgaria. Участниците подписват Декларация за конфиденциалност.",
  },
  {
    id: "publicity", name: "Publicity / Register", category: "General",
    en: "Participant identities and performance are confidential. Information on issued certificates is published in the Register section of www.ptsbg.eu.",
    bg: "Самоличността и представянето на участниците са конфиденциални. Информация за издадените сертификати се публикува в раздел „Регистър“ на www.ptsbg.eu.",
  },
  {
    id: "homogeneity", name: "Homogeneity & stability", category: "Plan",
    en: "Homogeneity and stability of the PT items are assessed by the provider in accordance with ISO 13528 before distribution.",
    bg: "Хомогенността и стабилността на обектите се оценяват от организатора съгласно ISO 13528 преди разпространението.",
  },
  {
    id: "traceability", name: "Assigned value & traceability", category: "Report",
    en: "The assigned value and its uncertainty are determined from the participants' results; metrological traceability is ensured through the applied standard methods.",
    bg: "Приетата стойност и нейната неопределеност се определят от резултатите на участниците; метрологичната проследимост е осигурена чрез приложените стандартни методи.",
  },
  {
    id: "scores", name: "z / ζ score criterion", category: "Report",
    en: "Each participant's performance is expressed as a z-score and a ζ-score. A result is satisfactory when the absolute value of the score is below 2, of warning when between 2 and 3, and unsatisfactory when 3 or above.",
    bg: "Представянето на всеки участник се изразява чрез z-оценка и ζ-оценка. Резултатът е удовлетворителен при абсолютна стойност под 2, предупредителен между 2 и 3 и неудовлетворителен при 3 и повече.",
  },
  {
    id: "feedback", name: "Feedback note", category: "Report",
    en: "After the Final Report, participants receive a Feedback Sheet to assess satisfaction, needs and expectations.",
    bg: "След окончателния доклад участниците получават Формуляр за обратна връзка за оценка на удовлетвореност, потребности и очаквания.",
  },
];

// ── Auto-fields the owner can drop in (always reflect the live scheme) ──
export const FIELDS: { key: string; en: string; bg: string }[] = [
  { key: "header", en: "Scheme header (№, title, object)", bg: "Заглавна част (№, заглавие, обект)" },
  { key: "parameters", en: "Characteristics table", bg: "Таблица с характеристики" },
  { key: "schedule", en: "Schedule / calendar", bg: "График" },
  { key: "prices", en: "Prices table", bg: "Таблица с цени" },
  { key: "team", en: "Team", bg: "Екип" },
  { key: "partner", en: "External provider / partner", bg: "Външен доставчик / партньор" },
  { key: "participants", en: "Participants (codes)", bg: "Участници (кодове)" },
  { key: "scores", en: "Results & scores", bg: "Резултати и оценки" },
];

// ── Fillable-form building blocks (the "Form elements" panel group): insert + restyle ──
// These are the pieces the form documents are made of — text blanks, checkboxes,
// choices, a signature block, and the form tables — so the owner can drop them into
// any document and adjust how they look. They use the same .ff-* / .ptable / .sig
// markup the forms use, so they render identically in the editor and the PDF.
export const FORM_ELEMENTS: { id: string; nameEn: string; nameBg: string; bg: string; en: string }[] = [
  {
    id: "fe_line", nameEn: "Text blank", nameBg: "Поле за текст",
    en: `<p><b>Label:</b> <span class="ff-line" data-empty="1" style="min-width:240px"></span></p>`,
    bg: `<p><b>Етикет:</b> <span class="ff-line" data-empty="1" style="min-width:240px"></span></p>`,
  },
  {
    id: "fe_check", nameEn: "Checkbox option", nameBg: "Поле за отметка",
    en: `<p><span class="ff-opt"><span class="ff-box"></span><span>Option</span></span></p>`,
    bg: `<p><span class="ff-opt"><span class="ff-box"></span><span>Опция</span></span></p>`,
  },
  {
    id: "fe_choice", nameEn: "Yes / No / Other", nameBg: "Да / Не / Друго",
    en: `<p><span class="ff-opt"><span class="ff-rb"></span><span>Yes</span></span> &nbsp; <span class="ff-opt"><span class="ff-rb"></span><span>No</span></span> &nbsp; <span class="ff-opt"><span class="ff-rb"></span><span>Other</span></span></p>`,
    bg: `<p><span class="ff-opt"><span class="ff-rb"></span><span>Да</span></span> &nbsp; <span class="ff-opt"><span class="ff-rb"></span><span>Не</span></span> &nbsp; <span class="ff-opt"><span class="ff-rb"></span><span>Друго</span></span></p>`,
  },
  {
    id: "fe_sig", nameEn: "Signature block", nameBg: "Поле за подпис",
    en: `<div class="sig"><div class="col"><span class="ff-line" style="min-width:140px"></span><br>Date</div><div class="col"><span class="ff-line" style="min-width:200px"></span><br>Name and Surname</div></div>`,
    bg: `<div class="sig"><div class="col"><span class="ff-line" style="min-width:140px"></span><br>Дата</div><div class="col"><span class="ff-line" style="min-width:200px"></span><br>Име и Фамилия</div></div>`,
  },
  {
    id: "fe_table", nameEn: "Blank table (3 columns)", nameBg: "Празна таблица (3 колони)",
    en: `<table class="ptable"><thead><tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr></thead><tbody><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></tbody></table>`,
    bg: `<table class="ptable"><thead><tr><th>Колона 1</th><th>Колона 2</th><th>Колона 3</th></tr></thead><tbody><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></tbody></table>`,
  },
  {
    id: "fe_results", nameEn: "Results table", nameBg: "Таблица с резултати",
    en: `<table class="ptable"><thead><tr><th>Specimen / Determination</th><th>Reported result</th><th>Expanded uncertainty U (k=2, P≈95%)</th></tr></thead><tbody><tr><td></td><td><span class="ff-line" style="min-width:120px"></span></td><td><span class="ff-line" style="min-width:120px"></span></td></tr></tbody></table>`,
    bg: `<table class="ptable"><thead><tr><th>Проба / Определяне</th><th>Докладван резултат</th><th>Разширена неопределеност U (k=2, P≈95%)</th></tr></thead><tbody><tr><td></td><td><span class="ff-line" style="min-width:120px"></span></td><td><span class="ff-line" style="min-width:120px"></span></td></tr></tbody></table>`,
  },
  {
    id: "fe_participation", nameEn: "Participation table", nameBg: "Таблица за участие",
    en: `<table class="ptable"><thead><tr><th>Test item / Method</th><th>Characteristic</th><th>Participation</th></tr></thead><tbody><tr><td></td><td></td><td><span class="ff-opt"><span class="ff-box"></span></span></td></tr></tbody></table>`,
    bg: `<table class="ptable"><thead><tr><th>Обект / Метод</th><th>Характеристика</th><th>Участие</th></tr></thead><tbody><tr><td></td><td></td><td><span class="ff-opt"><span class="ff-box"></span></span></td></tr></tbody></table>`,
  },
];

export function renderFieldHtml(s: Scheme, key: string, lang: Lang, participants: Participant[] = []): string {
  return fieldHtml(s, key, lang, participants);
}

function fieldHtml(s: Scheme, key: string, lang: Lang, participants: Participant[]): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  switch (key) {
    case "header":
      return `<div class="body"><p><b>${L("Proficiency testing", "Изпитване за пригодност")} № ${esc(s.number)}</b><br>
        ${L(s.titleEn, s.titleBg)}<br><span class="muted">${L("Object", "Обект")}: ${L(s.objectEn, s.objectBg)}</span></p></div>`;
    case "parameters":
      return `<table class="ptable"><thead><tr><th>${L("Standard", "Стандарт")}</th><th>${L("Characteristic", "Характеристика")}</th><th>${L("Range", "Обхват")}</th><th>${L("Specimens", "Проби")}</th></tr></thead><tbody>${s.parameters
        .map((p) => `<tr><td>${L(p.standardEn, p.standardBg)}</td><td>${L(p.characteristicEn, p.characteristicBg)}</td><td>${L(p.rangeEn, p.rangeBg)}</td><td>${L(p.specimensEn, p.specimensBg)}</td></tr>`)
        .join("")}</tbody></table>`;
    case "schedule":
      return `<table class="ptable"><thead><tr><th>${L("Date", "Дата")}</th><th>${L("Stage", "Етап")}</th></tr></thead><tbody>${s.schedule
        .map((it) => `<tr><td>${esc(it.date)}</td><td>${L(it.labelEn, it.labelBg)}</td></tr>`)
        .join("")}</tbody></table>`;
    case "prices":
      return `<table class="ptable"><thead><tr><th>${L("Characteristic", "Характеристика")}</th><th>${L("First sample", "Първа проба")}</th><th>${L("Each additional", "Всяка следваща")}</th></tr></thead><tbody>${s.prices
        .map((p) => `<tr><td>${L(p.characteristicEn, p.characteristicBg)}</td><td>${esc(p.first)}</td><td>${esc(p.additional)}</td></tr>`)
        .join("")}</tbody></table>`;
    case "team":
      return `<div class="team">${s.team
        .map((m) => `<div class="role"><span class="rl">${L(m.roleEn, m.roleBg)}</span><span class="nm">${esc(m.name)}</span></div>`)
        .join("")}</div>`;
    case "partner": {
      const p = s.partner;
      return `<div class="partner">${p.logo ? `<img src="${esc(p.logo)}" alt="">` : ""}<div><b>${L(p.nameEn, p.nameBg)}</b><div class="muted">${L(p.locationEn, p.locationBg)}</div><ul>${(lang === "bg" ? p.servicesBg : p.servicesEn).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div>`;
    }
    case "participants":
      return participants.length
        ? `<table class="ptable"><thead><tr><th>№</th><th>${L("Code", "Код")}</th><th>${L("Laboratory", "Лаборатория")}</th></tr></thead><tbody>${participants
            .map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.code)}</td><td>${esc(p.labName)}</td></tr>`)
            .join("")}</tbody></table>`
        : `<p class="muted">${L("No participants yet.", "Все още няма участници.")}</p>`;
    case "scores": {
      const html = s.type === "C" ? reportResultsCalibration(s, lang) : reportResultsTesting(s, lang);
      return html || `<p class="muted">${L("No scores entered yet.", "Все още няма въведени резултати.")}</p>`;
    }
    default:
      return "";
  }
}

// Render the owner-composed blocks into the branded document HTML (preview + PDF).
export function renderComposed(
  s: Scheme,
  blocks: Block[],
  lang: Lang,
  docTitleEn: string,
  docTitleBg: string,
  participants: Participant[] = []
): string {
  const body = blocks
    .map((b) => {
      if (b.type === "heading") return `<h2 class="sec">${esc(pick(lang, b.en ?? "", b.bg ?? ""))}</h2>`;
      if (b.type === "text")
        return `<div class="body"><p>${esc(pick(lang, b.en ?? "", b.bg ?? "")).replace(/\n/g, "<br>")}</p></div>`;
      if (b.type === "field") return fieldHtml(s, b.field ?? "", lang, participants);
      return "";
    })
    .join("\n");

  const inner = cover(s, lang, docTitleEn, docTitleBg) + body + footer(s, "draft");
  return wrapDoc(lang, `${s.number} — ${pick(lang, docTitleEn, docTitleBg)}`, inner);
}
