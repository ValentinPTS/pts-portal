import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, cover, footer } from "../doc-shell";

const FORM = "F 8.6-2";

// Feedback Sheet (Лист за обратна връзка) — F 8.6-2. A faithful printable version
// of the provider's end-of-scheme satisfaction survey (originally a Google Form).
// Same for testing and calibration; the scheme number is substituted. Fillable:
// 1–5 rating scales, Yes/No/Other options and free-text lines.
const EXTRA_CSS = `
  .subj{font-family:var(--sans);font-size:10.5pt;margin:2px 0 14px;}
  .subj b{color:var(--green-dark);}
  .fbintro{background:var(--green-soft);border-radius:6px;padding:9px 12px;margin:6px 0 12px;font-family:var(--sans);font-size:10pt;}
  .fbq{margin:16px 0;page-break-inside:avoid;}
  .fbq .qn{font-family:var(--sans);font-weight:700;font-size:10.5pt;}
  .fbq .help{font-style:italic;color:var(--muted);font-size:9.5pt;margin:3px 0;}
  .scale{display:flex;align-items:center;gap:18px;justify-content:center;margin:10px 0 4px;}
  .scale .end{color:var(--muted);font-size:9.5pt;font-family:var(--sans);}
  .scale .pt{text-align:center;font-family:var(--sans);width:34px;}
  .scale .pt .num{font-weight:700;font-size:10pt;display:block;}
  .scale .pt .o{display:inline-block;width:15px;height:15px;border:1.5px solid var(--green-dark);border-radius:50%;margin-top:3px;}
  .opt{margin:5px 0;font-family:var(--sans);font-size:10pt;}
  .opt .box{display:inline-block;width:13px;height:13px;border:1.6px solid var(--green-dark);vertical-align:-2px;margin-right:7px;}
  .opt.cb .box{border-radius:3px;} .opt.rb .box{border-radius:50%;}
  .opt .line{display:inline-block;border-bottom:1px solid var(--line);min-width:240px;height:13px;vertical-align:bottom;margin-left:6px;}
  .lines{margin:6px 0;} .lines div{border-bottom:1px solid var(--line);height:20px;}
`;

export function renderFeedback(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  // "suggest products for next year" — derive next year from the scheme number YY
  const ym = s.number.match(/(\d{2})\//);
  const nextYear = ym ? 2000 + parseInt(ym[1], 10) + 1 : new Date().getFullYear() + 1;

  const scale = `<div class="scale">
    <span class="end">${L("Bad", "Лошо")}</span>
    ${[1, 2, 3, 4, 5].map((n) => `<span class="pt"><span class="num">${n}</span><span class="o"></span></span>`).join("")}
    <span class="end">${L("Excellent", "Отлично")}</span>
  </div>`;

  const yesNoOther = (kind: "cb" | "rb") => `
    <div class="opt ${kind}"><span class="box"></span>${L("Yes", "Да")}</div>
    <div class="opt ${kind}"><span class="box"></span>${L("No", "Не")}</div>
    <div class="opt ${kind}"><span class="box"></span>${L("Other", "Друго")}: <span class="line"></span></div>`;

  const lines = (n: number) => `<div class="lines">${Array.from({ length: n }, () => "<div></div>").join("")}</div>`;

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
      scale)}
    ${q(2, "How do you assess the level of service provided?", "Как преценявате нивото на предоставената услуга?", scale)}
    ${q(3,
      "Would you use the services of PT provider PTS Bulgaria (PTS Bulgaria Ltd) again, especially after accreditation?",
      "Бихте ли използвали отново услугите на РТ провайдър PTS Bulgaria при „ПТС България“ ООД, особено след получаване на акредитация?",
      yesNoOther("cb"))}
    ${q(4,
      "Did you receive your auto-generated certificate of participation by email?",
      "Получихте ли по имейл Вашия автоматично генериран сертификат за участие?",
      yesNoOther("rb"),
      ["Write your email and laboratory name in case you have not received your certificate of participation.",
       "Напишете имейл и име на лабораторията, в случай че не сте получили своя сертификат за участие."])}
    ${q(5,
      `Did you receive the Final Report on Proficiency Testing № ${s.number} by email?`,
      `Получихте ли по имейл окончателния доклад от изпитване за пригодност № ${s.number}?`,
      yesNoOther("rb"),
      ["Write your email and laboratory name in case you have not received the Final Report.",
       "Напишете имейл и име на лабораторията, в случай че не сте получили окончателния доклад."])}
    ${q(6,
      `Suggest products and parameters that you would like to be the subject of Proficiency Testing in ${nextYear}.`,
      `Предложете продукти и характеристики, които да са обекти на изпитване за пригодност през ${nextYear} г.`,
      lines(3))}
    ${q(7,
      "Write your comments, notes, remarks, recommendations and suggestions for improving the level of service provided:",
      "Напишете своите коментари, бележки, забележки, препоръки и предложения за подобряване нивото на предоставяната услуга:",
      lines(4))}`;

  const body = `${cover(s, lang, "FEEDBACK SHEET", "ЛИСТ ЗА ОБРАТНА ВРЪЗКА")}
    <div class="subj">${L("regarding", "относно")} <b>${L("Proficiency Testing", "Изпитване за пригодност")} № ${esc(s.number)}</b> — ${L(s.titleEn, s.titleBg)}</div>
    <h2 class="sec">${L("Survey", "Анкета")}</h2>
    <div class="fbintro">${L(
      "The purpose of this survey is to obtain information about participants' satisfaction and to identify improvements based on the comments, remarks and recommendations received.",
      "Целта на настоящата анкета е да получим информация относно удовлетвореността на участниците, както и да набележим подобрения на база направените бележки, забележки, препоръки и т.н."
    )}</div>
    ${survey}
    <div class="sig">
      <div class="col">&nbsp;<br>${L("Date", "Дата")}</div>
      <div class="col">&nbsp;<br>${L("Participant (laboratory code)", "Участник (лабораторен код)")}</div>
    </div>
    ${footer(s, FORM)}`;

  return wrapDoc(lang, `${s.number} — Feedback Sheet`, body, EXTRA_CSS);
}
