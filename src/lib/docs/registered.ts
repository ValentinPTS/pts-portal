import type { Scheme, Lang, DocOptions } from "../types";
import { esc, pick, wrapDoc, docHeader, footer } from "../doc-shell";

// The two participant lists, faithful to the provider's NEW standard workbook
// (sheet name = official form code):
//   • F 7.2.1-4 «Списък на заявилите участие / List of applied participants» —
//     registration & logistics (named): delivery address, contact, participations,
//     laboratory activity, courier. Identical columns for T and C schemes.
//   • F 7.2.1-5 «Кодиран списък на участниците / Encrypted list of participants» —
//     name ↔ lab code + sample code, one row PER CHARACTERISTIC the lab registered
//     for (rowspan groups), each with its standard code.
// Both are built from the live participant list passed in opts.participants
// (resolved by the print route) plus the scheme's own scope/object data.
// NB: the source workbook's title contains a typo («Кординиран») — rendered here
// corrected to «Кодиран» per the owner's decision (2026-07-08).
export const EXTRA_CSS = `
  .code{font-family:var(--sans);font-weight:700;color:var(--green-dark);}
  .empty{color:var(--muted);font-style:italic;text-align:center;}
  table.ptable td.n{text-align:center;width:30px;}
  table.ptable td.c{text-align:center;}
  table.ptable{font-size:9pt;}
  .masked{color:var(--muted);font-style:italic;}
  .confnote{font-size:8.5pt;color:var(--muted);font-style:italic;margin:-2px 0 8px;}
  .stdnote{font-size:8.5pt;font-style:italic;margin:8px 0 0;}
  .compiledby{margin-top:26px;font-family:var(--sans);font-size:9.5pt;}
  .compiledby .ln{display:inline-block;border-bottom:1px solid #999;min-width:220px;}
`;

// RT1 — confidentiality (§4.2). When the viewer is not a manager, the print route
// passes revealNames:false and identifying fields collapse to a masked placeholder;
// the participant code (F 7.2.1-5) stays, so staff can still work by code.
function maskCell(reveal: boolean, value: string, lang: Lang): string {
  return reveal ? esc(value) : `<span class="masked">${esc(pick(lang, "confidential", "конфиденциално"))}</span>`;
}
function confNote(reveal: boolean, lang: Lang): string {
  return reveal
    ? ""
    : `<p class="confnote">${esc(pick(lang,
        "Names are hidden — only a Manager may reveal the name behind a code (ISO/IEC 17043 §4.2).",
        "Имената са скрити — само Мениджър може да разкрие името зад даден код (ISO/IEC 17043 §4.2)."))}</p>`;
}

// the person who compiles/codes the lists (Data collection & coding expert)
function compiler(s: Scheme): { name: string; roleEn: string; roleBg: string } | undefined {
  return s.team.find((m) => /кодиран|coding/i.test(m.roleBg + m.roleEn));
}

function header(s: Scheme, lang: Lang, titleEn: string, titleBg: string): string {
  return docHeader(s, lang, titleEn, titleBg);
}

function compiledBy(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const c = compiler(s);
  return `<div class="compiledby">
    <div>${esc(s.orderDate ?? s.revisionDate)} &nbsp; ${L("Date", "Дата")}</div>
    <div style="margin-top:14px">${L("Compiled by", "Съставил")}: <span class="ln"></span> ${
      c ? `&nbsp; ${esc(c.name)} — ${L(c.roleEn, c.roleBg)}` : ""
    }</div>
  </div>`;
}

// "Laboratory activity" (F 7.2.1-4/-5) — per participant on the form, but in
// practice every lab in a round does the round's activity, so derive from type.
function activityLabel(s: Scheme, lang: Lang): string {
  return esc(pick(lang, s.type === "C" ? "Calibration" : "Testing", s.type === "C" ? "Калибриране" : "Изпитване"));
}

// ── F 7.2.1-4 — List of applied participants (registration & logistics, named) ──
const FORM1 = "F 7.2.1-4";
export function renderRegistered(s: Scheme, lang: Lang, opts?: DocOptions): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const ps = opts?.participants ?? [];
  const reveal = opts?.revealNames !== false;
  const activity = activityLabel(s, lang);

  const rows = ps.length
    ? ps
        .map(
          (p, i) => `<tr>
            <td class="n">${i + 1}</td>
            <td>${maskCell(reveal, p.labName, lang)}</td>
            <td>${maskCell(reveal, p.deliveryAddress ?? "", lang)}</td>
            <td>${maskCell(reveal, p.contact ?? "", lang)}</td>
            <td>${maskCell(reveal, p.phone ?? "", lang)}</td>
            <td>${maskCell(reveal, p.email ?? "", lang)}</td>
            <td class="c">${esc(String(p.participations ?? 1))}</td>
            <td class="c">${activity}</td>
            <td class="c">${esc(p.courier ?? "")}</td>
          </tr>`
        )
        .join("")
    : `<tr><td class="empty" colspan="9">${L("No applications registered yet.", "Все още няма регистрирани заявки.")}</td></tr>`;

  const body = `${header(s, lang, "LIST OF APPLIED PARTICIPANTS", "СПИСЪК НА ЗАЯВИЛИТЕ УЧАСТИЕ")}
    <p>${L(
      `Laboratories that have applied for proficiency testing No. ${s.number} — ${s.titleEn}.`,
      `Лаборатории, заявили участие в изпитване за пригодност № ${s.number} — ${s.titleBg}.`
    )}</p>
    ${confNote(reveal, lang)}
    <table class="ptable"><thead><tr>
      <th class="n">№</th>
      <th>${L("Laboratory", "Лаборатория")}</th>
      <th>${L("Sample delivery address", "Адрес за доставка на пробите")}</th>
      <th>${L("Contact person", "Лице за контакт")}</th>
      <th>${L("Phone", "Телефон")}</th>
      <th>e-mail</th>
      <th class="c">${L("Number of participations", "Брой участия")}</th>
      <th class="c">${L("Laboratory activity", "Лабораторна дейност")}</th>
      <th class="c">${L("Type of courier", "Вид на куриера")}</th>
    </tr></thead><tbody>${rows}</tbody></table>
    ${compiledBy(s, lang)}
    ${footer(s, FORM1)}`;

  return wrapDoc(lang, `${s.number} — List of Applied Participants`, body, EXTRA_CSS);
}

// ── F 7.2.1-5 — Encrypted (coded) list: name ↔ codes + per-characteristic scope ──
const FORM2 = "F 7.2.1-5";

// One row per characteristic for a participant. `chosen` = indexes into
// s.parameters the lab registered for (absent/empty → all, so older participants
// keep rendering fully). Calibration schemes model scope in s.calibration, not
// parameters — fall back to quantity × directions there.
function charRows(s: Scheme, lang: Lang, chosen?: number[]): { char: string; std: string }[] {
  if (s.parameters.length === 0 && s.type === "C" && s.calibration) {
    const q = pick(lang, s.calibration.quantityEn, s.calibration.quantityBg);
    const dirs = lang === "bg" ? s.calibration.directionsBg : s.calibration.directionsEn;
    return dirs.length ? dirs.map((d) => ({ char: `${q} — ${d}`, std: "" })) : [{ char: q, std: "" }];
  }
  const valid = (chosen ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < s.parameters.length);
  const idx = valid.length ? valid : s.parameters.map((_, i) => i);
  return idx.map((i) => ({
    char: pick(lang, s.parameters[i].characteristicEn, s.parameters[i].characteristicBg),
    std: pick(lang, s.parameters[i].standardEn, s.parameters[i].standardBg),
  }));
}

export function renderRegisteredCoded(s: Scheme, lang: Lang, opts?: DocOptions): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const ps = opts?.participants ?? [];
  const reveal = opts?.revealNames !== false;
  const ptItem = L(s.objectEn, s.objectBg);
  const activity = activityLabel(s, lang);

  const rows = ps.length
    ? ps
        .map((p, i) => {
          const chars = charRows(s, lang, p.characteristics);
          const n = Math.max(chars.length, 1);
          const first = chars[0] ?? { char: "", std: "" };
          const head = `<tr>
            <td class="n" rowspan="${n}">${i + 1}</td>
            <td rowspan="${n}">${maskCell(reveal, p.labName, lang)}</td>
            <td class="code c" rowspan="${n}">${esc(p.code)}</td>
            <td class="code c" rowspan="${n}">${esc(p.sampleCode ?? "")}</td>
            <td class="c" rowspan="${n}">${activity}</td>
            <td rowspan="${n}">${ptItem}</td>
            <td>${esc(first.char)}</td>
            <td>${esc(first.std)}</td>
          </tr>`;
          const rest = chars
            .slice(1)
            .map((r) => `<tr><td>${esc(r.char)}</td><td>${esc(r.std)}</td></tr>`)
            .join("");
          return head + rest;
        })
        .join("")
    : `<tr><td class="empty" colspan="8">${L("No participants registered yet.", "Все още няма регистрирани участници.")}</td></tr>`;

  const body = `${header(s, lang, "ENCRYPTED LIST OF PARTICIPANTS", "КОДИРАН СПИСЪК НА УЧАСТНИЦИТЕ")}
    <p>${L(
      `Name-to-code mapping for proficiency testing No. ${s.number}. The laboratory code is the only identifier used in all downstream documents and the public Register; the mapping is confidential to PTS Bulgaria.`,
      `Съответствие име ↔ код за изпитване за пригодност № ${s.number}. Кодът на лабораторията е единственият идентификатор във всички последващи документи и в публичния Регистър; съответствието е конфиденциално и известно само на PTS Bulgaria.`
    )}</p>
    ${confNote(reveal, lang)}
    <table class="ptable"><thead><tr>
      <th class="n">№</th>
      <th>${L("Laboratory", "Лаборатория")}</th>
      <th class="c">${L("Laboratory code", "Код на лабораторията")}</th>
      <th class="c">${L("Sample code", "Код на пробата")}</th>
      <th class="c">${L("Laboratory activity", "Лабораторна дейност")}</th>
      <th>${L("Product type", "Вид продукт")}</th>
      <th>${L("Characteristics", "Характеристика")}</th>
      <th>${L("Standard code", "Код на стандарта")}</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <p class="stdnote">${L(
      "* All tests will be carried out according to the last valid versions of the pointed standards!",
      "* Изпитванията ще се проведат по последните валидни версии на посочените стандартни методи!"
    )}</p>
    ${compiledBy(s, lang)}
    ${footer(s, FORM2)}`;

  return wrapDoc(lang, `${s.number} — Encrypted List of Participants`, body, EXTRA_CSS);
}
