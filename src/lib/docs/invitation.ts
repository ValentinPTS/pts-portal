import type { Scheme, Lang, Clause } from "../types";
import { esc, pick, wrapDoc, cover, sec, footer } from "../doc-shell";

const FORM = "F 7.2.1-2";
const cl = (lang: Lang, c?: Clause) => (c ? esc(pick(lang, c.en, c.bg)) : "");

export function renderInvitation(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  // 1 — Number & name of the scheme
  const s1 = `<p><b>${L("Number:", "Номер:")}</b> ${esc(s.number)} &nbsp;&nbsp;
    <b>${L("Name:", "Име:")}</b> ${L(s.titleEn, s.titleBg)}</p>`;

  // 2 — Methods & characteristics (standard + characteristic)
  const s2 = `<table class="ptable"><thead><tr>
      <th>${L("Code of the Standard", "Метод на изпитване")}</th>
      <th>${L("Characteristic", "Характеристика")}</th>
    </tr></thead><tbody>${s.parameters
      .map(
        (pr) =>
          `<tr><td>${L(pr.standardEn, pr.standardBg)}</td><td>${L(pr.characteristicEn, pr.characteristicBg)}</td></tr>`
      )
      .join("")}</tbody></table>
    <div class="note">* ${L(
      "The tests will be carried out according to the latest valid version of the specified standard method!",
      "Изпитванията ще се проведат по последната валидна версия на посочения стандартен метод!"
    )}</div>`;

  // 3 — Time schedule (green calendars, same as plan.ts §10)
  const s3 = `<div class="cals">${s.schedule
    .map((it) => {
      const [d, m] = it.date.split(".");
      return `<div class="cal"><span class="bar"></span><div class="d">${d}.${m}</div><div class="lbl">${L(
        it.labelEn,
        it.labelBg
      )}</div></div>`;
    })
    .join("")}</div>
    <div class="note">${L(
      "In the event of any changes related to the schedule for conducting the present proficiency testing or other important changes, all participants shall be informed by e-mail. Detailed information shall be provided by means of the “Instruction for Participants” (F 7.3.5-1), which shall be sent to the participants by e-mail.",
      "В случай на настъпили промени във връзка с времевия график за провеждането на настоящото изпитване за пригодност или други важни промени, всички участници ще бъдат уведомени посредством имейл! Подробна информация ще бъде предоставена посредством „Инструкция за участниците“ (Ф 7.3.5-1), която ще бъде изпратена на участниците по e-mail."
    )}</div>`;

  // 4 — Financial conditions: price table + bilingual rules from the preview
  const priceTable = `<table class="ptable"><thead><tr>
      <th>${L("Characteristic", "Характеристика")}</th>
      <th>${L("First sample", "Първа проба")}</th>
      <th>${L("Second and each additional sample", "Втора и всяка следваща проба")}</th>
    </tr></thead><tbody>${s.prices
      .map(
        (r) =>
          `<tr><td>${L(r.characteristicEn, r.characteristicBg)}</td><td>${esc(r.first)}</td><td>${esc(
            r.additional
          )}</td></tr>`
      )
      .join("")}</tbody></table>
    <div class="example">${L(
      "Example scheme data — illustrative figures only; the official prices are set per scheme in the Application (F 7.2.1-3). The structure (per characteristic: “First sample” / “Second and each additional sample”) is the fixed part.",
      "Примерни данни за схемата — стойностите са илюстративни; официалните цени се определят за всяка схема в Заявката (Ф 7.2.1-3). Структурата (за всяка характеристика: „Първа проба“ / „Втора и всяка следваща проба“) е фиксираната част."
    )}</div>
    <div class="note">${L(
      "Prices are net; 20% VAT is added in accordance with the applicable Bulgarian legislation.",
      "Цените са нето; към тях се начислява 20 % ДДС, съгласно действащото българско законодателство."
    )}</div>`;

  const clarifications = `<div class="imp">${L(
    "IMPORTANT!!! — Clarifications on Participation",
    "ВАЖНО!!! — Пояснения относно участието"
  )}</div>
    <ul>
      <li>${L(
        "The number of participations (samples / laboratory codes) shall be defined in the submitted “Application for Participation” (F 7.2.1-3), completed either in PDF format or via the online system on our website.",
        "Броят участия (проби / лабораторни кодове) се определя в подадената „Заявка за участие“ (Ф 7.2.1-3), попълнена във формат PDF или чрез онлайн системата на нашия сайт."
      )}</li>
      <li>${L(
        "If one participation is declared and all selected characteristics are assigned to that participation, this counts as one participation (one laboratory code / one sample set).",
        "Ако е заявено едно участие и всички избрани характеристики са отнесени към него, това се счита за едно участие (един лабораторен код / един комплект проби)."
      )}</li>
      <li>${L(
        "If more than one participation is declared, the total number of participations shall equal the highest number of participations declared for any selected characteristic (i.e. the maximum declared number across the selected characteristics).",
        "Ако са заявени повече от едно участие, общият брой участия е равен на най-високия брой участия, заявен за която и да е избрана характеристика (т.е. максималния заявен брой измежду избраните характеристики)."
      )}</li>
      <li>${L(
        "For pricing purposes, when multiple participations are declared, the “first sample” shall be the participation that includes the greatest number of selected characteristics. Each second and subsequent sample shall be charged according to the “Second and each additional sample” column.",
        "За целите на ценообразуването, при заявени повече от едно участие, за „първа проба“ се счита участието с най-много избрани характеристики. Всяка втора и следваща проба се таксува по колоната „Втора и всяка следваща проба“."
      )}</li>
    </ul>`;

  const invoicing = `<h3 class="sub">${L("Invoicing and Payment", "Фактуриране и плащане")}</h3>
    <ul>
      <li>${L(
        "A pro forma invoice will be issued and sent to the e-mail address provided in the “Application for Participation” (F 7.2.1-3).",
        "Проформа фактура се издава и изпраща на електронната поща, посочена в „Заявка за участие“ (Ф 7.2.1-3)."
      )}</li>
      <li>${L(
        "After payment is received, an electronic invoice will be issued and sent to the same e-mail address.",
        "След извършване на плащането се издава електронна фактура, която се изпраща на същия електронен адрес."
      )}</li>
      <li>${L(
        "Only participants who have paid the participation fee will be included in the proficiency testing.",
        "Само участници, за които е постъпило плащане по съответната заявка, ще бъдат включени в изпитването за пригодност."
      )}</li>
    </ul>`;

  const notifications = `<h3 class="sub">${L("Notifications", "Уведомления")}</h3>
    <ul>
      <li>${L(
        "Information regarding the organization and conduct of the proficiency testing will be sent by e-mail, based on the submitted applications, no later than 31 March 2026.",
        "Ще бъдете информирани посредством e-mail за провеждането на изпитването за пригодност, в зависимост от подадените заявки, най-късно до 31.03.2026 г."
      )}</li>
    </ul>`;

  const delivery = `<h3 class="sub">${L("Delivery Charges", "Такси за доставка")}</h3>
    <ul>
      <li>${L(
        "No delivery fee applies for participants located on the Balkan Peninsula or within the European Union (excluding Ireland, Malta and Cyprus).",
        "Не се начислява такса доставка за участници на Балканския полуостров или в рамките на Европейския съюз (с изключение на Ирландия, Малта и Кипър)."
      )}</li>
      <li>${L(
        "Participants from Ireland, Malta and Cyprus will be charged an additional €50 (overseas delivery).",
        "За участници от Ирландия, Малта и Кипър се начислява допълнително €50 (доставка отвъд морето)."
      )}</li>
      <li>${L(
        "Participants located outside the European Union and not on the Balkan Peninsula will be charged €150 for delivery for 12 blocks (full scope), €120 for delivery for 8 blocks (for tensile splitting strength), or €50 for delivery for 4 blocks (dimensions and/or water absorption only). If DHL is used, the delivery fee will be agreed with the participant individually. The delivery charge will be included in the invoice.",
        "За участници извън Европейския съюз и извън Балканския полуостров се начислява €150 за доставка на 12 блокчета (пълен обхват), €120 за доставка на 8 блокчета (за якост на опън при разцепване) или €50 за доставка на 4 блокчета (само определяне на размерите и/или абсорбция на вода). При използване на DHL таксата за доставка се договаря индивидуално с участника. Таксата за доставка се включва във фактурата."
      )}</li>
    </ul>`;

  const ptItems = `<h3 class="sub">${L("PT items", "Обекти за изпитване")}</h3>
    <ul>
      <li>${L(
        "Each participant will receive either 12 blocks (full scope), or 8 blocks (for tensile splitting strength), or 4 blocks (dimensions and/or water absorption only), depending on the selected characteristics. Full allocation and testing instructions are provided in the “Instruction for Participants” (F 7.3.5-1).",
        "В зависимост от заявените характеристики на всяко участие се предоставя комплект от 12 блокчета (пълен обхват), 8 блокчета (за якост на опън при разцепване) или 4 блокчета (само определяне на размерите и/или абсорбция на вода). Подробното разпределение и указанията за изпитване са предоставени в „Инструкция за участниците“ (Ф 7.3.5-1)."
      )}</li>
    </ul>`;

  const s4 = priceTable + clarifications + invoicing + notifications + delivery + ptItems;

  const body = [
    cover(s, lang, "INVITATION FOR PROFICIENCY TESTING", "ПОКАНА ЗА ИЗПИТВАНЕ ЗА ПРИГОДНОСТ", {
      withImage: false,
    }),
    sec(1, "Number and name of the PT scheme", "Номер и наименование на схемата", lang, s1),
    sec(2, "Methods and characteristics", "Методи и характеристики", lang, s2),
    sec(3, "Time schedule of the PT scheme", "График на схемата за изпитване за пригодност", lang, s3),
    sec(4, "Financial conditions", "Финансови условия", lang, s4),
    sec(5, "Applying for participation", "Заявяване на участие", lang, `<p>${cl(lang, s.clauses.applying)}</p>`),
    sec(6, "Contacts", "Контакти", lang, `<p>${cl(lang, s.clauses.contacts)}</p>`),
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Invitation`, body);
}
