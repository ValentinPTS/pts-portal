import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, cover, sec, footer } from "../doc-shell";

const FORM = "F 7.2.1-3";

// Calibration Application (F 7.2.1-3). Mirrors application.ts (Testing) but the
// participation table is by force direction (Compression / Tension) with a
// Calibration Points column and a free-text Note column — see
// TESTING-vs-CALIBRATION.md and poc/calibration-application-preview.html.
export function renderApplicationC(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  // A labelled blank field (.fld + .fl + .blank from doc-shell).
  const field = (en: string, bg: string) =>
    `<div class="fld"><span class="fl">${L(en, bg)}</span> <span class="blank"></span></div>`;

  const c = s.calibration;

  // §1 — Laboratory details
  const s1 = [
    field("Name of the Laboratory", "Наименование на лабораторията"),
    field("Contact Person:", "Лице за контакт:"),
    field("Telephone:", "Телефон:"),
    field("E-mail:", "Електронна поща:"),
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
  const dirsBg = c?.directionsBg ?? [];
  const order = (en: string) => (/compress/i.test(en) ? 0 : /tens/i.test(en) ? 1 : 2);
  const idx = dirsEn.map((_, i) => i).sort((a, b) => order(dirsEn[a]) - order(dirsEn[b]));

  const pointsHeader = `${L("Calibration Points", "Точки на калибриране")}${unit ? ` (${esc(unit)})` : ""}`;

  const rows = idx.length
    ? idx
        .map(
          (i, n) => `<tr>
        ${n === 0 ? `<td rowspan="${idx.length}">${itemCell}</td>` : ""}
        <td>${quantity}</td>
        <td>${pointsCol}</td>
        <td>▢</td>
        <td><span class="blank"></span></td>
      </tr>`
        )
        .join("")
    : `<tr>
        <td>${itemCell}</td>
        <td>${quantity}</td>
        <td>${pointsCol}</td>
        <td>▢</td>
        <td><span class="blank"></span></td>
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
    sec(3, "Information on receiving the PT item", "Информация за получаване на обекта", lang, s3),
    sec(4, "Invoice Data", "Данни за фактура", lang, s4),
    sec(5, "Contacts", "Контакти", lang, s5),
    warn,
    footer(s, FORM),
  ].join("\n");

  return wrapDoc(lang, `${s.number} — Application`, body);
}
