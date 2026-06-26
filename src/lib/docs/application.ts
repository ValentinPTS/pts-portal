import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, cover, sec, footer } from "../doc-shell";
import { fText, fCheck, fSelect } from "../form-fields";

const FORM = "F 7.2.1-3";

export function renderApplication(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  // A labelled fillable blank (.fld + .fl + a text field).
  const field = (id: string, en: string, bg: string) =>
    `<div class="fld"><span class="fl">${L(en, bg)}</span> ${fText(id, 280)}</div>`;

  // §1 — Laboratory details
  const s1 = [
    field("lab_name", "Name of the Laboratory", "Наименование на лабораторията"),
    field("lab_head", "Head of the Laboratory:", "Ръководител на лабораторията:"),
    field("contact_person", "Contact Person:", "Лице за контакт:"),
    field("phone", "Telephone:", "Телефон:"),
    field("email", "E-mail:", "Електронна поща:"),
  ].join("");

  // §2 — Methods & participation (dynamic from s.parameters); each row is tickable
  // with a chosen number of participations.
  const s2 = `<table class="ptable"><thead><tr>
      <th>${L("Test Item / Method", "Обект на изпитване / Метод")}</th>
      <th>${L("Characteristic", "Характеристика")}</th>
      <th>${L("Participation", "Участие")}</th>
      <th>${L("Number of Participations", "Брой участия")}</th>
    </tr></thead><tbody>${s.parameters
      .map(
        (pr, i) => `<tr>
        <td><b>${L(s.objectEn, s.objectBg)}</b><br>${L(pr.standardEn, pr.standardBg)}</td>
        <td>${L(pr.characteristicEn, pr.characteristicBg)}</td>
        <td>${fCheck(`part_${i}`, "")}</td>
        <td>${fSelect(`parts_${i}`, [["1", "1"], ["2", "2"], ["3", "3"]])}</td>
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
    field("ship_address", "Shipping address:", "Адрес за доставка:"),
    field("postal_code", "Postal code:", "Пощенски код:"),
  ].join("");

  // §4 — Invoice data
  const s4 = [
    field("org_name", "Name of the Organization:", "Наименование на организацията:"),
    field("eik", "Tax Identification / Taxpayer Number:", "ЕИК / Данъчен номер:"),
    field("vat", "Value Added Tax (VAT) Number:", "Номер по ДДС:"),
    field("tax_address", "Tax Address (registration address):", "Данъчен адрес (адрес на регистрация):"),
    field("mol", "Accountable Person:", "Отговорно лице (МОЛ):"),
  ].join("");

  // §5 — Contacts (free lines)
  const s5 = `<div class="fld">${fText("contact_1", 420)}</div>
    <div class="fld">${fText("contact_2", 420)}</div>
    <div class="fld">${fText("contact_3", 420)}</div>`;

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
