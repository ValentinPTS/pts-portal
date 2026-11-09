import type { Scheme, Lang, Clause } from "../types";
import { esc, pick, wrapDoc, cover, sec, footer } from "../doc-shell";
import { transitRisk } from "./transit";
import { usesM1, m1Sections, m1Fields, m1Contact, orFill, fillMark } from "../m1-render";
import { fmtEur } from "../commercial-model";

const FORM = "F 7.2.1-2";
const cl = (lang: Lang, c?: Clause) => (c ? esc(pick(lang, c.en, c.bg)) : "");

// Calibration variant of the Invitation (F 7.2.1-2). A single device travels
// lab → lab; the fee is flat per scheme (independent of the number of points).
// Mirrors poc/calibration-invitation-preview.html. `s.calibration` may be
// undefined → measured-quantity rows render blank.
export function renderInvitationC(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const c = s.calibration;

  // 1 — Number & name of the scheme
  const s1 = `<p><b>${L("Number:", "Номер:")}</b> ${esc(s.number)} &nbsp;&nbsp;
    <b>${L("Name:", "Наименование:")}</b> ${L(s.titleEn, s.titleBg)}</p>`;

  // 2 — Method & measured quantity (NOT a standards table). Method, quantity,
  // device (PT item) and the calibration points list with unit.
  const points = c ? esc(c.points.join(", ") + (c.unit ? ` ${c.unit}` : "")) : "";
  const s2 = `<table class="ptable"><tbody>
      <tr><th>${L("Method", "Метод")}</th><td>${c ? L(c.methodEn, c.methodBg) : ""}</td></tr>
      <tr><th>${L("Measured quantity", "Измервана величина")}</th><td>${c ? L(c.quantityEn, c.quantityBg) : ""}</td></tr>
      <tr><th>${L("PT item", "Обект")}</th><td>${c ? L(c.deviceEn, c.deviceBg) : ""}</td></tr>
      <tr><th>${L("Measurement points", "Точки на измерване")}</th><td>${points}</td></tr>
    </tbody></table>`;

  // 3 — Time schedule (green calendars, same as plan.ts §10 / invitation.ts §3)
  const s3 = `<div class="cals">${s.schedule
    .map((it) => {
      const dm = it.date.includes(".") ? it.date.split(".").slice(0, 2).join(".") : it.date || "—";
      return `<div class="cal"><span class="bar"></span><div class="d">${dm}</div><div class="lbl">${L(
        it.labelEn,
        it.labelBg
      )}</div></div>`;
    })
    .join("")}</div>
    <div class="note">${L(
      "In the event of any changes related to the schedule for conducting the present proficiency testing or other important changes, all participants shall be informed by e-mail. Detailed information shall be provided by means of the “Instruction for Participants” (F 7.3.5-1), which shall be sent to the participants by e-mail.",
      "В случай на настъпили промени във връзка с времевия график за провеждането на настоящото изпитване за пригодност или други важни промени, всички участници ще бъдат уведомени посредством имейл! Подробна информация ще бъде предоставена посредством „Инструкция за участниците“ (Ф 7.3.5-1), която ще бъде изпратена на участниците по e-mail."
    )}</div>`;

  // 4 — Financial conditions: FLAT-FEE model (no per-characteristic price grid).
  const s4 = `<div class="pricebox">
      <div class="selbox">${L("— per scheme —", "— по схема —")}</div>
    </div>
    ${c ? `<p>${L(c.feeEn, c.feeBg)}</p>` : ""}
    <div class="imp">${L("IMPORTANT", "ВАЖНО")}</div>
    <ul>
      <li>${L(
        "The participation fee does NOT depend on the number of calibration points.",
        "Таксата за участие НЕ зависи от броя на точките за калибриране."
      )}</li>
      <li>${L(
        "For the second and each subsequent participation with a separate laboratory code, 50% of the announced price is paid.",
        "За второ и всяко следващо участие с отделен лабораторен код се заплащат 50% от обявената цена."
      )}</li>
      <li>${L(
        "The quoted prices are net and are subject to 20% VAT.",
        "Посочените цени са нето и подлежат на облагане с 20% ДДС."
      )}</li>
      <li>${L(
        "A pro forma invoice is issued first; after payment, an electronic invoice.",
        "Първо се издава проформа фактура; след плащане — електронна фактура."
      )}</li>
      <li>${L(
        "Payment is not a condition for dispatch: the item is sent according to the schedule. The final report and the certificate of participation are provided once payment for the application has been received.",
        "Плащането не е условие за изпращане: обектът се изпраща по графика. Окончателният доклад и сертификатът за участие се предоставят след постъпване на плащането по съответната заявка."
      )}</li>
      <li>${L(
        "Each participant uses a reliable, fast courier (3–7 business days) to forward the item to the next participant.",
        "Всеки участник използва надеждна и бърза куриерска фирма (3–7 работни дни) за препращане на обекта към следващия участник."
      )}</li>
    </ul>`;

  // a scheme made after 3.10: M1's 7 points (lib/m1-render) — the dates table after
  // the schedule's text, the fee before the financial conditions, Реш. 154 after them
  if (usesM1(s)) {
    const cals = s3.slice(0, s3.indexOf('<div class="note">'));
    const refLab = c && (c.referenceLabEn || c.referenceLabBg)
      ? `<p><b>${L(c.referenceLabEn, c.referenceLabBg)}</b>${c.referenceLabLocEn || c.referenceLabLocBg ? ` — ${L(c.referenceLabLocEn, c.referenceLabLocBg)}` : ""}</p><p>${L("Calibration of the PT item before and after the participant measurements; its results set the reference values and their uncertainties.", "Калибриране на обекта преди и след измерванията на участниците; резултатите му определят референтните стойности и техните неопределености.")}</p>`
      : "";
    // the fee is the scheme's price (3.7) — never the older fee sentence, which spoke
    // of «50 %» and VAT on its own (3.10 review)
    const F = (bg: string, en: string) => ({ bg, en });
    const base = s.commercial?.base;
    const fee = `<p><b>${L("Participation fee:", "Такса за участие:")}</b> ${base !== undefined ? esc(fmtEur(base, lang)) : fillMark(lang, F("цената за участие («Цени и участници»)", "the participation fee («Prices and participants»)"))}</p>`;
    const pts = c?.points.length ? esc(c.points.join(", ") + (c.unit ? ` ${c.unit}` : "")) : fillMark(lang, F("точките на измерване", "the measurement points"));
    const p2 = `<table class="ptable"><tbody>
      <tr><th>${L("Method", "Метод")}</th><td>${orFill(c && pick(lang, c.methodEn, c.methodBg), lang, F("методът", "the method"))}</td></tr>
      <tr><th>${L("Measured quantity", "Измервана величина")}</th><td>${orFill(c && pick(lang, c.quantityEn, c.quantityBg), lang, F("измерваната величина", "the measured quantity"))}</td></tr>
      <tr><th>${L("PT item", "Обект")}</th><td>${orFill(c && pick(lang, c.deviceEn, c.deviceBg), lang, F("обектът", "the PT item"))}</td></tr>
      <tr><th>${L("Measurement points", "Точки на измерване")}</th><td>${pts}</td></tr>
    </tbody></table>`;
    const m1 = m1Sections("invitation", s, lang, {
      legacy: { 2: p2, 3: refLab, 7: m1Contact(s, lang) },
      before: { 5: fee },
      after: { 4: cals + (!s.schedule.length || s.schedule.some((it) => !it.date) ? `<p>${fillMark(lang, F("датите в графика", "the dates of the schedule"))}</p>` : ""), 5: `<div class="body">${transitRisk(lang)}</div>` },
      fields: m1Fields(s, lang),
    });
    return wrapDoc(lang, `${s.number} — Invitation`, [
      cover(s, lang, "INVITATION FOR PROFICIENCY TESTING", "ПОКАНА ЗА ИЗПИТВАНЕ ЗА ПРИГОДНОСТ", { withImage: false }),
      m1,
      footer(s, FORM),
    ].join("\n"));
  }

  const body = [
    cover(s, lang, "INVITATION FOR PROFICIENCY TESTING", "ПОКАНА ЗА ИЗПИТВАНЕ ЗА ПРИГОДНОСТ", {
      withImage: false,
    }),
    sec(1, "Number and name of the PT scheme", "Номер и наименование на схемата", lang, s1),
    sec(2, "Selection of methods, determined quantity", "Избор на метод и определяна величина", lang, s2),
    sec(3, "Time schedule of the PT scheme", "График на схемата за изпитване за пригодност", lang, s3),
    sec(4, "Financial conditions", "Финансови условия", lang, s4),
    `<div class="body">${transitRisk(lang)}</div>`,
    sec(5, "Applying for participation", "Заявяване на участие", lang, `<p>${cl(lang, s.clauses.applying)}</p>`),
    sec(6, "Contacts", "Контакти", lang, `<p>${cl(lang, s.clauses.contacts)}</p>`),
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Invitation`, body);
}
