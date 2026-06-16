import type { Scheme, Lang, Clause } from "../types";
import { esc, pick, wrapDoc, cover, sec, footer } from "../doc-shell";

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
        "A pro forma invoice is issued first; after payment, an electronic invoice. Only participants who have paid are included.",
        "Първо се издава проформа фактура; след плащане — електронна фактура. Включват се само платилите участници."
      )}</li>
      <li>${L(
        "Each participant uses a reliable, fast courier (3–7 business days) to forward the item to the next participant.",
        "Всеки участник използва надеждна и бърза куриерска фирма (3–7 работни дни) за препращане на обекта към следващия участник."
      )}</li>
    </ul>`;

  const body = [
    cover(s, lang, "INVITATION FOR PROFICIENCY TESTING", "ПОКАНА ЗА ИЗПИТВАНЕ ЗА ПРИГОДНОСТ", {
      withImage: false,
    }),
    sec(1, "Number and name of the PT scheme", "Номер и наименование на схемата", lang, s1),
    sec(2, "Selection of methods, determined quantity", "Избор на метод и определяна величина", lang, s2),
    sec(3, "Time schedule of the PT scheme", "График на схемата за изпитване за пригодност", lang, s3),
    sec(4, "Financial conditions", "Финансови условия", lang, s4),
    sec(5, "Applying for participation", "Заявяване на участие", lang, `<p>${cl(lang, s.clauses.applying)}</p>`),
    sec(6, "Contacts", "Контакти", lang, `<p>${cl(lang, s.clauses.contacts)}</p>`),
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Invitation`, body);
}
