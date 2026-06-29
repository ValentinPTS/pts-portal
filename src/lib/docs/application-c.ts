import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, docHeader, sec, footer } from "../doc-shell";
import { fText, fCheck } from "../form-fields";

const FORM = "F 7.2.1-3";

// Calibration Application (F 7.2.1-3). Mirrors application.ts (Testing) but the
// participation table is by force direction (Compression / Tension) with a
// Calibration Points column and a free-text Note column — see
// TESTING-vs-CALIBRATION.md and poc/calibration-application-preview.html.
export function renderApplicationC(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  // A labelled fillable blank (.fld + .fl + a text field).
  const field = (id: string, en: string, bg: string) =>
    `<div class="fld"><span class="fl">${L(en, bg)}</span> ${fText(id, 280)}</div>`;

  const c = s.calibration;

  // §1 — Laboratory details
  const s1 = [
    field("lab_name", "Name of the Laboratory", "Наименование на лабораторията"),
    field("contact_person", "Contact Person:", "Лице за контакт:"),
    field("phone", "Telephone:", "Телефон:"),
    field("email", "E-mail:", "Електронна поща:"),
  ].join("");

  // §2 — Participation by force direction.
  // GUARD: s.calibration may be undefined / directions empty → render blanks.
  const unit = c?.unit ?? "";
  const pointsCol = c && c.points.length
    ? esc(c.points.join(" / "))
    : `<span class="blank"></span>`;
  const itemCell = c
    ? `<b>${L(c.deviceEn, c.deviceBg)}</b>`
    : `<span class="blank"></span>`;
  const quantity = c ? L(c.quantityEn, c.quantityBg) : `<span class="blank"></span>`;

  // One row per direction (Compression first, then Tension, per the source).
  const dirsEn = c?.directionsEn ?? [];
  const order = (en: string) => (/compress/i.test(en) ? 0 : /tens/i.test(en) ? 1 : 2);
  const idx = dirsEn.map((_, i) => i).sort((a, b) => order(dirsEn[a]) - order(dirsEn[b]));

  const pointsHeader = `${L("Calibration Points", "Точки на калибриране")}${unit ? ` (${esc(unit)})` : ""}`;

  // The Participation tick + Note are owner-filled; the item/quantity/points come
  // from the scheme's calibration data.
  const rows = idx.length
    ? idx
        .map(
          (i, n) => `<tr>
        ${n === 0 ? `<td rowspan="${idx.length}">${itemCell}</td>` : ""}
        <td>${quantity}</td>
        <td>${pointsCol}</td>
        <td>${fCheck(`part_${n}`, "")}</td>
        <td>${fText(`note_${n}`, 160)}</td>
      </tr>`
        )
        .join("")
    : `<tr>
        <td>${itemCell}</td>
        <td>${quantity}</td>
        <td>${pointsCol}</td>
        <td>${fCheck("part_0", "")}</td>
        <td>${fText("note_0", 160)}</td>
      </tr>`;

  const s2 = `<table class="ptable"><thead><tr>
      <th>${L("Calibration Item", "Обект на калибриране")}</th>
      <th>${L("Measured Quantity", "Измервана величина")}</th>
      <th>${pointsHeader}</th>
      <th>${L("*Participation", "*Участие")}</th>
      <th>${L("**Note", "**Забележка")}</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <div class="note">* ${L(
      "The participation fee does not depend on the number of points to be calibrated.",
      "Таксата за участие не зависи от броя точки, които ще бъдат калибрирани."
    )}</div>
    <div class="note">** ${L(
      "Some notes can be noted, such as when the laboratory cannot cover the measurement range, etc.",
      "В забележка могат да се отбележат някои бележки, като например, когато лабораторията не може да покрие обхвата на измерване и др."
    )}</div>`;

  // §3 — Information on receiving the PT item
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
    docHeader(s, lang, "APPLICATION FOR PARTICIPATION", "ЗАЯВКА ЗА УЧАСТИЕ"),
    sec(1, "Information about the applicant", "Информация за заявителя", lang, s1),
    sec(2, "Information on participation", "Информация за участието", lang, s2),
    sec(3, "Information on receiving the PT item", "Информация за получаване на обекта", lang, s3),
    sec(4, "Invoice Data", "Данни за фактура", lang, s4),
    sec(5, "Contacts", "Контакти", lang, s5),
    warn,
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Application`, body);
}
