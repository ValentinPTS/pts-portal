import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, cover, footer } from "../doc-shell";
import { fRating, fCheck, fRadio, fText, fLines } from "../form-fields";

const FORM = "F 8.6-2";

// Feedback Sheet (Лист за обратна връзка) — F 8.6-2. A faithful printable version
// of the provider's end-of-scheme satisfaction survey (originally a Google Form).
// Same for testing and calibration; the scheme number is substituted. The controls
// are real fillable fields (lib/form-fields.ts): 1–5 ratings, Yes/No/Other, free text.
const EXTRA_CSS = `
  .subj{font-family:var(--sans);font-size:10.5pt;margin:2px 0 14px;}
  .subj b{color:var(--green-dark);}
  .fbintro{background:var(--green-soft);border-radius:6px;padding:9px 12px;margin:6px 0 12px;font-family:var(--sans);font-size:10pt;}
  .fbq{margin:16px 0;page-break-inside:avoid;}
  .fbq .qn{font-family:var(--sans);font-weight:700;font-size:10.5pt;}
  .fbq .help{font-style:italic;color:var(--muted);font-size:9.5pt;margin:3px 0;}
  .fbq .scalewrap{display:flex;justify-content:center;margin:10px 0 4px;}
  .opt-row{margin:5px 0;}
`;

export function renderFeedback(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  // "suggest products for next year" — derive next year from the scheme number YY
  const ym = s.number.match(/(\d{2})\//);
  const nextYear = ym ? 2000 + parseInt(ym[1], 10) + 1 : new Date().getFullYear() + 1;

  const rating = (id: string) => `<div class="scalewrap">${fRating(id, L("Bad", "Лошо"), L("Excellent", "Отлично"))}</div>`;
  const yesNoCb = (id: string) =>
    `<div class="opt-row">${fCheck(`${id}_yes`, L("Yes", "Да"))}</div>` +
    `<div class="opt-row">${fCheck(`${id}_no`, L("No", "Не"))}</div>` +
    `<div class="opt-row">${fCheck(`${id}_other`, `${L("Other", "Друго")}:`)} ${fText(`${id}_other_text`, 240)}</div>`;
  const yesNoRb = (id: string) =>
    `<div class="opt-row">${fRadio(id, [["yes", L("Yes", "Да")], ["no", L("No", "Не")], ["other", L("Other", "Друго")]], true)}</div>` +
    `<div class="opt-row">${L("Other", "Друго")}: ${fText(`${id}_other_text`, 240)}</div>`;

  const q = (n: number, en: string, bg: string, control: string, help?: [string, string]) => `
    <div class="fbq">
      <div class="qn">${n}. ${L(en, bg)}</div>
      ${help ? `<div class="help">${L(help[0], help[1])}</div>` : ""}
      ${control}
    </div>`;

  const survey = `
    ${q(1,
      `How do you assess the level of communication during the conduct of Proficiency Testing № ${s.number}?`,
      `Как преценявате нивото на комуникация по време на провеждането на изпитване за пригодност № ${s.number}?`,
      rating("q1"))}
    ${q(2, "How do you assess the level of service provided?", "Как преценявате нивото на предоставената услуга?", rating("q2"))}
    ${q(3,
      "Would you use the services of PT provider PTS Bulgaria (PTS Bulgaria Ltd) again, especially after accreditation?",
      "Бихте ли използвали отново услугите на РТ провайдър PTS Bulgaria при „ПТС България“ ООД, особено след получаване на акредитация?",
      yesNoCb("q3"))}
    ${q(4,
      "Did you receive your auto-generated certificate of participation by email?",
      "Получихте ли по имейл Вашия автоматично генериран сертификат за участие?",
      yesNoRb("q4"),
      ["Write your email and laboratory name in case you have not received your certificate of participation.",
       "Напишете имейл и име на лабораторията, в случай че не сте получили своя сертификат за участие."])}
    ${q(5,
      `Did you receive the Final Report on Proficiency Testing № ${s.number} by email?`,
      `Получихте ли по имейл окончателния доклад от изпитване за пригодност № ${s.number}?`,
      yesNoRb("q5"),
      ["Write your email and laboratory name in case you have not received the Final Report.",
       "Напишете имейл и име на лабораторията, в случай че не сте получили окончателния доклад."])}
    ${q(6,
      `Suggest products and parameters that you would like to be the subject of Proficiency Testing in ${nextYear}.`,
      `Предложете продукти и характеристики, които да са обекти на изпитване за пригодност през ${nextYear} г.`,
      fLines("q6", 3))}
    ${q(7,
      "Write your comments, notes, remarks, recommendations and suggestions for improving the level of service provided:",
      "Напишете своите коментари, бележки, забележки, препоръки и предложения за подобряване нивото на предоставяната услуга:",
      fLines("q7", 4))}`;

  const body = `${cover(s, lang, "FEEDBACK SHEET", "ЛИСТ ЗА ОБРАТНА ВРЪЗКА")}
    <div class="subj">${L("regarding", "относно")} <b>${L("Proficiency Testing", "Изпитване за пригодност")} № ${esc(s.number)}</b> — ${L(s.titleEn, s.titleBg)}</div>
    <h2 class="sec">${L("Survey", "Анкета")}</h2>
    <div class="fbintro">${L(
      "The purpose of this survey is to obtain information about participants' satisfaction and to identify improvements based on the comments, remarks and recommendations received.",
      "Целта на настоящата анкета е да получим информация относно удовлетвореността на участниците, както и да набележим подобрения на база направените бележки, забележки, препоръки и т.н."
    )}</div>
    ${survey}
    <div class="sig">
      <div class="col">${fText("sig_date", 140)}<br>${L("Date", "Дата")}</div>
      <div class="col">${fText("sig_code", 140)}<br>${L("Participant (laboratory code)", "Участник (лабораторен код)")}</div>
    </div>
    ${footer(s, FORM)}`;

  return wrapDoc(lang, `${s.number} — Feedback Sheet`, body, EXTRA_CSS);
}
