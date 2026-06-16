import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, cover, sec, footer } from "../doc-shell";

const FORM = "F 7.2.1-3";

export function renderApplication(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  // A labelled blank field (.fld + .fl + .blank from doc-shell).
  const field = (en: string, bg: string) =>
    `<div class="fld"><span class="fl">${L(en, bg)}</span> <span class="blank"></span></div>`;

  // §1 — Laboratory details
  const s1 = [
    field("Name of the Laboratory", "Наименование на лабораторията"),
    field("Head of the Laboratory:", "Ръководител на лабораторията:"),
    field("Contact Person:", "Лице за контакт:"),
    field("Telephone:", "Телефон:"),
    field("E-mail:", "Електронна поща:"),
  ].join("");

  // §2 — Methods & participation (dynamic from s.parameters)
  const s2 = `<table class="ptable"><thead><tr>
      <th>${L("Test Item / Method", "Обект на изпитване / Метод")}</th>
      <th>${L("Characteristic", "Характеристика")}</th>
      <th>${L("Participation", "Участие")}</th>
      <th>${L("Number of Participations", "Брой участия")}</th>
    </tr></thead><tbody>${s.parameters
      .map(
        (pr) => `<tr>
        <td><b>${L(s.objectEn, s.objectBg)}</b><br>${L(pr.standardEn, pr.standardBg)}</td>
        <td>${L(pr.characteristicEn, pr.characteristicBg)}</td>
        <td>▢</td>
        <td><span class="selbox">${L("- choose -", "- избери -")}</span></td>
      </tr>`
      )
      .join("")}</tbody></table>
    <div class="note">* ${L(
      "The tests will be carried out according to the latest valid version of the specified standard method!",
      "Изпитванията ще се проведат по последната валидна версия на посочения стандартен метод!"
    )}</div>
    <div class="note"><b>** ${L("Number of participations:", "Брой участия:")}</b> ${L(
      "one participation covering all selected characteristics = one laboratory code / one sample set. Each participant receives 12, 8 or 4 blocks depending on the selected characteristics.",
      "едно участие, покриващо всички избрани характеристики = един лабораторен код / един комплект проби. Всеки участник получава 12, 8 или 4 павета според избраните характеристики."
    )}</div>`;

  // §3 — Information on receiving the PT items
  const s3 = [
    field("Shipping address:", "Адрес за доставка:"),
    field("Postal code:", "Пощенски код:"),
  ].join("");

  // §4 — Invoice data
  const s4 = [
    field("Name of the Organization:", "Наименование на организацията:"),
    field("Tax Identification / Taxpayer Number:", "ЕИК / Данъчен номер:"),
    field("Value Added Tax (VAT) Number:", "Номер по ДДС:"),
    field("Tax Address (registration address):", "Данъчен адрес (адрес на регистрация):"),
    field("Accountable Person:", "Отговорно лице (МОЛ):"),
  ].join("");

  // §5 — Contacts (left BLANK, no invented names)
  const s5 = `<div class="fld"><span class="blank"></span></div>
    <div class="fld"><span class="blank"></span></div>
    <div class="fld"><span class="blank"></span></div>`;

  const warn = `<p class="imp">${L(
    "The application date is the date on which the completed Application for Participation is received at the e-mail address above.",
    "Датата на заявката е датата, на която попълнената Заявка за участие е получена на посочения по-горе имейл адрес."
  )}</p>`;

  const body = [
    cover(s, lang, "APPLICATION FOR PARTICIPATION", "ЗАЯВКА ЗА УЧАСТИЕ", { withImage: false }),
    sec(1, "Information about the applicant", "Информация за заявителя", lang, s1),
    sec(2, "Information on participation", "Информация за участието", lang, s2),
    sec(3, "Information on receiving the PT items", "Информация за получаване на пробите", lang, s3),
    sec(4, "Invoice Data", "Данни за фактура", lang, s4),
    sec(5, "Contacts", "Контакти", lang, s5),
    warn,
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Application`, body);
}
