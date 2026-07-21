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
  { key: "participants", en: "Participants (codes)", bg: "Участници (кодове)" },
  { key: "scores", en: "Results & scores", bg: "Резултати и оценки" },
];

// ── Fillable-form building blocks (the "Form elements" panel group): insert + restyle ──
// These are the pieces the form documents are made of — text blanks, checkboxes,
// choices, a signature block, and the form tables — so the owner can drop them into
// any document and adjust how they look. They use the same .ff-* / .ptable / .sig
// markup the forms use, so they render identically in the editor and the PDF.
// `category` groups them in the insert panel + /items by the document they serve:
// "Form" = generic pieces, "Results" = Results sheet, "Application" = Application.
export const FORM_ELEMENTS: { id: string; nameEn: string; nameBg: string; category: string; bg: string; en: string }[] = [
  {
    id: "fe_line", nameEn: "Text blank", nameBg: "Поле за текст", category: "Form",
    en: `<p><b>Label:</b> <span class="ff-line" data-empty="1" style="min-width:240px"></span></p>`,
    bg: `<p><b>Етикет:</b> <span class="ff-line" data-empty="1" style="min-width:240px"></span></p>`,
  },
  {
    id: "fe_check", nameEn: "Checkbox option", nameBg: "Поле за отметка", category: "Form",
    // INLINE (no <p>) — lands at the caret inside the current line, so text can
    // sit right next to it and several boxes fit on one line.
    en: `<span class="ff-opt"><span class="ff-box"></span><span>Option</span></span>&nbsp;`,
    bg: `<span class="ff-opt"><span class="ff-box"></span><span>Опция</span></span>&nbsp;`,
  },
  {
    id: "fe_check_pair", nameEn: "Yes / No checkboxes (one line)", nameBg: "Да / Не отметки (на един ред)", category: "Form",
    en: `<span class="ff-opt"><span class="ff-box"></span><span>Yes</span></span>&nbsp;&nbsp;<span class="ff-opt"><span class="ff-box"></span><span>No</span></span>&nbsp;`,
    bg: `<span class="ff-opt"><span class="ff-box"></span><span>Да</span></span>&nbsp;&nbsp;<span class="ff-opt"><span class="ff-box"></span><span>Не</span></span>&nbsp;`,
  },
  {
    // full option PARAGRAPH like the printed forms (Plan §1): the box hangs at the
    // left edge and every wrapped line stays tucked under the text, justified.
    id: "fe_opt", nameEn: "Checkbox option — paragraph", nameBg: "Опция с отметка — цял абзац", category: "Form",
    en: `<p class="opt"><span class="ff-box"></span>&nbsp;Option text — keep typing freely: wrapped lines stay aligned under the text, tight like the printed form.</p>`,
    bg: `<p class="opt"><span class="ff-box"></span>&nbsp;Текст на опцията — пишете свободно: пренесените редове остават подравнени под текста, стегнато като в печатния формуляр.</p>`,
  },
  {
    id: "fe_choice", nameEn: "Yes / No / Other", nameBg: "Да / Не / Друго", category: "Form",
    en: `<span class="ff-opt"><span class="ff-rb"></span><span>Yes</span></span>&nbsp;&nbsp;<span class="ff-opt"><span class="ff-rb"></span><span>No</span></span>&nbsp;&nbsp;<span class="ff-opt"><span class="ff-rb"></span><span>Other</span></span>&nbsp;`,
    bg: `<span class="ff-opt"><span class="ff-rb"></span><span>Да</span></span>&nbsp;&nbsp;<span class="ff-opt"><span class="ff-rb"></span><span>Не</span></span>&nbsp;&nbsp;<span class="ff-opt"><span class="ff-rb"></span><span>Друго</span></span>&nbsp;`,
  },
  {
    // A real dropdown the owner can extend in the editor (select it → "Add option").
    id: "fe_select", nameEn: "Dropdown (1 / 2 / 3)", nameBg: "Падащо меню (1 / 2 / 3)", category: "Form",
    en: `<select class="ff-select" contenteditable="false"><option>1</option><option>2</option><option>3</option></select>`,
    bg: `<select class="ff-select" contenteditable="false"><option>1</option><option>2</option><option>3</option></select>`,
  },
  {
    // date + name over green lines — exactly like the real Declaration/Plan endings
    id: "fe_sig", nameEn: "Signature block (date + name)", nameBg: "Поле за подпис (дата + име)", category: "Form",
    en: `<div class="sig" style="margin-top:36px;gap:60px"><div class="col" style="max-width:190px;border-top:none"><p style="margin:0;min-height:17px;border-bottom:2px solid var(--green-dark)"><br></p>date</div><div class="col" style="max-width:340px;border-top:none"><p style="margin:0;min-height:17px;border-bottom:2px solid var(--green-dark)"><br></p>/name, surname/</div></div>`,
    bg: `<div class="sig" style="margin-top:36px;gap:60px"><div class="col" style="max-width:190px;border-top:none"><p style="margin:0;min-height:17px;border-bottom:2px solid var(--green-dark)"><br></p>дата</div><div class="col" style="max-width:340px;border-top:none"><p style="margin:0;min-height:17px;border-bottom:2px solid var(--green-dark)"><br></p>/име, презиме, фамилия/</div></div>`,
  },
  {
    // centered role signature — like the Order's "Ръководител на организатора…"
    id: "fe_sig_role", nameEn: "Manager signature (role)", nameBg: "Подпис на ръководител (длъжност)", category: "Form",
    en: `<div class="sig" style="margin-top:36px;justify-content:center"><div class="col" style="max-width:360px;border-top:none"><p style="margin:0;min-height:17px;border-bottom:2px solid var(--green-dark)"><br></p>Head of the proficiency testing scheme</div></div>`,
    bg: `<div class="sig" style="margin-top:36px;justify-content:center"><div class="col" style="max-width:360px;border-top:none"><p style="margin:0;min-height:17px;border-bottom:2px solid var(--green-dark)"><br></p>Ръководител на схемата за изпитване за пригодност</div></div>`,
  },
  {
    // 4-column team block — the REAL Plan §2 (T + C): the exact icons extracted
    // from the plan PDF (public/brand/team-*.png) and the real roles/names in the
    // doc's own colours. A table with TRANSPARENT borders so every cell is freely
    // editable — change a name, swap an icon via the Image button, etc.
    id: "fe_team_cols", nameEn: "Team columns (role / icon / name)", nameBg: "Екип в колони (роля / икона / име)", category: "Plan",
    en: `<table style="width:100%;border-collapse:collapse"><tbody><tr><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#ff5757;font-weight:700">PT Scheme Manager</td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#86a87d;font-weight:700">Materials Engineer</td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#38b6ff;font-weight:700">Statistical Processing Expert</td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#ffde59;font-weight:700">Data Collection and Coding Expert</td></tr><tr><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle"><img src="/brand/team-manager.png" alt="" style="height:56px"></td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle"><img src="/brand/team-materials.png" alt="" style="height:56px"></td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle"><img src="/brand/team-stats.png" alt="" style="height:56px"></td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle"><img src="/brand/team-data.png" alt="" style="height:56px"></td></tr><tr><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#ff5757">eng. Valentin Belovski</td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#86a87d">eng. Ivanka Dobreva, PhD</td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#38b6ff">eng. Atanas Atanasov</td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#ffde59">Tatyana Kasabova</td></tr></tbody></table>`,
    bg: `<table style="width:100%;border-collapse:collapse"><tbody><tr><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#ff5757;font-weight:700">Ръководител на схемата на изпитване за пригодност</td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#86a87d;font-weight:700">Инженер по материалите</td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#38b6ff;font-weight:700">Експерт статистическа обработка</td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#ffde59;font-weight:700">Експерт събиране и кодиране на данните</td></tr><tr><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle"><img src="/brand/team-manager.png" alt="" style="height:56px"></td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle"><img src="/brand/team-materials.png" alt="" style="height:56px"></td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle"><img src="/brand/team-stats.png" alt="" style="height:56px"></td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle"><img src="/brand/team-data.png" alt="" style="height:56px"></td></tr><tr><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#ff5757">инж. Валентин Беловски</td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#86a87d">д-р инж. Иванка Добрева</td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#38b6ff">инж. Атанас Атанасов</td><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;color:#ffde59">Татяна Касабова</td></tr></tbody></table>`,
  },
  {
    // 2-column external-labs block — the REAL Plan §3 (T + C): left column = logo
    // + lab name + address, right column = the services bullet list, prefilled with
    // the actual GROMA HOLD data from the plan. Transparent-border table — edit the
    // text freely, swap the logo via the Image button for a different lab.
    id: "fe_partner_cols", nameEn: "Partner labs (two columns)", nameBg: "Външни лаборатории (две колони)", category: "Plan",
    en: `<table style="width:100%;border-collapse:collapse"><tbody><tr><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;width:55%"><img src="/brand/partner-groma.png" alt="" style="height:34px"><p style="margin:4px 0 0;font-weight:700">CONSTRUCTION TESTING LABORATORY at<br>GROMA HOLD LTD</p><p style="margin:2px 0 0">2709 Belo Pole, Blagoevgrad municipality, Poleto location, Bulgaria</p></td><td style="border:1px solid transparent;padding:6px 8px;vertical-align:middle"><ul style="margin:0;padding-left:22px"><li>Sampling;</li><li>Packaging of the test samples;</li><li>Homogeneity tests;</li><li>Stability tests;</li></ul></td></tr></tbody></table>`,
    bg: `<table style="width:100%;border-collapse:collapse"><tbody><tr><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;width:55%"><img src="/brand/partner-groma.png" alt="" style="height:34px"><p style="margin:4px 0 0;font-weight:700">СТРОИТЕЛНА ИЗПИТВАТЕЛНА ЛАБОРАТОРИЯ<br>ПРИ ГРОМА ХОЛД ЕООД</p><p style="margin:2px 0 0">2709 Бело Поле, община Благоевград, Местност "Полето"</p></td><td style="border:1px solid transparent;padding:6px 8px;vertical-align:middle"><ul style="margin:0;padding-left:22px"><li>Вземане на проби;</li><li>Опаковане на пробите;</li><li>Изпитвания за установяване на хомогенност;</li><li>Изпитвания за установяване на стабилност;</li></ul></td></tr></tbody></table>`,
  },
  {
    // same layout, prefilled with the REAL NJN data from the sea-sand Testing plan
    // §3 (Documents/Testing/2 - План & 3 - Plan): logo + name + address | services.
    id: "fe_partner_njn", nameEn: "Partner lab — NJN", nameBg: "Външна лаборатория — ЕН ДЖИ ЕН", category: "Plan",
    en: `<table style="width:100%;border-collapse:collapse"><tbody><tr><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;width:55%"><img src="/brand/partner-njn.png" alt="" style="height:48px"><p style="margin:4px 0 0;font-weight:700;color:#86a87d">LABORATORY COMPLEX at NJN LTD</p><p style="margin:2px 0 0">Bulgaria, 6300 Haskovo, 3 Planinski Izgled Street</p></td><td style="border:1px solid transparent;padding:6px 8px;vertical-align:middle"><ul style="margin:0;padding-left:22px"><li>Sampling;</li><li>Homogenization and preparation;</li><li>Reduction into sub-samples (hereinafter referred to as samples);</li><li>Packaging of the test samples;</li></ul></td></tr></tbody></table>`,
    bg: `<table style="width:100%;border-collapse:collapse"><tbody><tr><td style="border:1px solid transparent;padding:6px 8px;text-align:center;vertical-align:middle;width:55%"><img src="/brand/partner-njn.png" alt="" style="height:48px"><p style="margin:4px 0 0;font-weight:700;color:#86a87d">ЛАБОРАТОРЕН КОМПЛЕКС КЪМ "ЕН ДЖИ ЕН" ООД</p><p style="margin:2px 0 0">град Хасково, ул. "Планински изглед" №3</p></td><td style="border:1px solid transparent;padding:6px 8px;vertical-align:middle"><ul style="margin:0;padding-left:22px"><li>Вземане на проба;</li><li>Хомогенизиране на пробата;</li><li>Редуциране на подпроби, наричани по-нататък само проби;</li><li>Опаковане на пробите;</li></ul></td></tr></tbody></table>`,
  },
  {
    // one green date card (as in the Plan §10 schedule) — built as a tiny INLINE
    // table so several sit next to each other and every table tool works on it
    // (resize, tighter rows, add a column for another date, …).
    id: "fe_datecard", nameEn: "Date card (schedule)", nameBg: "Дата (картичка от графика)", category: "Plan",
    en: `<table style="display:inline-table;width:110px;vertical-align:top;border-collapse:separate;border-spacing:0;margin:2px 6px 2px 0"><tbody><tr><td style="border:1px solid #88a77b;border-radius:8px;padding:0;text-align:center;vertical-align:top;overflow:hidden"><div style="height:10px;background:#88a77b"></div><div style="font-family:'Sofia Sans Condensed',Arial,sans-serif;font-weight:700;color:#9e2b2b;font-size:13pt;padding:4px 2px 0">01.01.2026</div><div style="font-size:8pt;color:#6b6b6b;padding:2px 4px 6px;line-height:1.15">Stage</div></td></tr></tbody></table>`,
    bg: `<table style="display:inline-table;width:110px;vertical-align:top;border-collapse:separate;border-spacing:0;margin:2px 6px 2px 0"><tbody><tr><td style="border:1px solid #88a77b;border-radius:8px;padding:0;text-align:center;vertical-align:top;overflow:hidden"><div style="height:10px;background:#88a77b"></div><div style="font-family:'Sofia Sans Condensed',Arial,sans-serif;font-weight:700;color:#9e2b2b;font-size:13pt;padding:4px 2px 0">01.01.2026</div><div style="font-size:8pt;color:#6b6b6b;padding:2px 4px 6px;line-height:1.15">Етап</div></td></tr></tbody></table>`,
  },
  {
    id: "fe_table", nameEn: "Blank table (3 columns)", nameBg: "Празна таблица (3 колони)", category: "Form",
    en: `<table class="ptable"><thead><tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr></thead><tbody><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></tbody></table>`,
    bg: `<table class="ptable"><thead><tr><th>Колона 1</th><th>Колона 2</th><th>Колона 3</th></tr></thead><tbody><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></tbody></table>`,
  },
  {
    id: "fe_results", nameEn: "Results table", nameBg: "Таблица с резултати", category: "Results",
    en: `<table class="ptable"><thead><tr><th>Specimen / Determination</th><th>Reported result</th><th>Expanded uncertainty U (k=2, P≈95%)</th></tr></thead><tbody><tr><td></td><td><span class="ff-line" style="min-width:120px"></span></td><td><span class="ff-line" style="min-width:120px"></span></td></tr></tbody></table>`,
    bg: `<table class="ptable"><thead><tr><th>Проба / Определяне</th><th>Докладван резултат</th><th>Разширена неопределеност U (k=2, P≈95%)</th></tr></thead><tbody><tr><td></td><td><span class="ff-line" style="min-width:120px"></span></td><td><span class="ff-line" style="min-width:120px"></span></td></tr></tbody></table>`,
  },
  {
    id: "fe_participation", nameEn: "Participation table", nameBg: "Таблица за участие", category: "Application",
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
