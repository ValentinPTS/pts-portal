import type { Scheme, Lang, DocOptions } from "../types";
import { esc, pick, wrapDoc, cover, footer } from "../doc-shell";

// Two internal participant lists, faithful to the provider's real Excel forms:
//   • PTS-L 4.4-1 «Списък на заявилите участие» — registration & logistics (named)
//   • PTS-L 4.4-2 «Координиран списък на участниците» — name ↔ code + scope mapping
// Both are built from the live participant list passed in opts.participants
// (resolved by the print route) plus the scheme's own scope/object data.
const EXTRA_CSS = `
  .code{font-family:var(--sans);font-weight:700;color:var(--green-dark);}
  .empty{color:var(--muted);font-style:italic;text-align:center;}
  table.ptable td.n{text-align:center;width:30px;}
  table.ptable td.c{text-align:center;}
  table.ptable{font-size:9pt;}
  .compiledby{margin-top:26px;font-family:var(--sans);font-size:9.5pt;}
  .compiledby .ln{display:inline-block;border-bottom:1px solid #999;min-width:220px;}
`;

// the person who compiles/codes the lists (Data collection & coding expert)
function compiler(s: Scheme): { name: string; roleEn: string; roleBg: string } | undefined {
  return s.team.find((m) => /кодиран|coding/i.test(m.roleBg + m.roleEn));
}

function header(s: Scheme, lang: Lang, titleEn: string, titleBg: string): string {
  return cover(s, lang, titleEn, titleBg);
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

// ── PTS-L 4.4-1 — List of applicants (registration & logistics, named) ──
const FORM1 = "PTS-L 4.4-1";
export function renderRegistered(s: Scheme, lang: Lang, opts?: DocOptions): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const ps = opts?.participants ?? [];
  const isCal = s.type === "C";

  const rows = ps.length
    ? ps
        .map(
          (p, i) => `<tr>
            <td class="n">${i + 1}</td>
            <td>${esc(p.labName)}</td>
            <td>${esc(p.deliveryAddress ?? "")}</td>
            <td>${esc(p.contact ?? "")}</td>
            <td>${esc(p.phone ?? "")}</td>
            <td>${esc(p.email ?? "")}</td>
            <td class="c">${esc(String(p.participations ?? 1))}</td>
            <td class="c">${isCal ? `${i + 1}` : ""}</td>
          </tr>`
        )
        .join("")
    : `<tr><td class="empty" colspan="8">${L("No applications registered yet.", "Все още няма регистрирани заявки.")}</td></tr>`;

  const periodHead = isCal
    ? L("Circulation order / period", "Ред / период на обиколка")
    : L("Approx. period the item is sent to & stays at the lab", "Приблизителен период на изпращане и престой");

  const body = `${header(s, lang, "LIST OF APPLICANTS", "СПИСЪК НА ЗАЯВИЛИТЕ УЧАСТИЕ")}
    <p>${L(
      `Laboratories that have applied for proficiency testing No. ${s.number} — ${s.titleEn}.`,
      `Лаборатории, заявили участие в изпитване за пригодност № ${s.number} — ${s.titleBg}.`
    )}</p>
    <table class="ptable"><thead><tr>
      <th class="n">№</th>
      <th>${L("Laboratory", "Лаборатория")}</th>
      <th>${L("Delivery address for the samples", "Адрес за доставка на пробите")}</th>
      <th>${L("Contact person", "Лице за контакт")}</th>
      <th>${L("Phone", "Телефон")}</th>
      <th>e-mail</th>
      <th class="c">${L("No. of participations", "Брой участия")}</th>
      <th>${periodHead}</th>
    </tr></thead><tbody>${rows}</tbody></table>
    ${compiledBy(s, lang)}
    ${footer(s, FORM1)}`;

  return wrapDoc(lang, `${s.number} — List of Applicants`, body, EXTRA_CSS);
}

// ── PTS-L 4.4-2 — Coordinated list (name ↔ code + scope mapping) ──
const FORM2 = "PTS-L 4.4-2";
export function renderRegisteredCoded(s: Scheme, lang: Lang, opts?: DocOptions): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const ps = opts?.participants ?? [];
  const isCal = s.type === "C";

  // scheme scope shown for every participant (matches the real form)
  let scope = "";
  if (isCal && s.calibration) {
    const dirs = lang === "bg" ? s.calibration.directionsBg : s.calibration.directionsEn;
    scope = esc(pick(lang, s.calibration.quantityEn, s.calibration.quantityBg) + (dirs.length ? ` (${dirs.join(", ")})` : ""));
  } else {
    scope = s.parameters.map((p) => esc(pick(lang, p.characteristicEn, p.characteristicBg))).join("; ");
  }
  const ptItem = L(s.objectEn, s.objectBg);
  const scopeHead = isCal ? L("Calibrated quantity", "Калибрирана величина") : L("Tested characteristics", "Изпитвани характеристики");

  const rows = ps.length
    ? ps
        .map(
          (p, i) => `<tr>
            <td class="n">${i + 1}</td>
            <td>${esc(p.labName)}</td>
            <td class="code c">${esc(p.code)}</td>
            <td>${scope}</td>
            <td>${ptItem}</td>
          </tr>`
        )
        .join("")
    : `<tr><td class="empty" colspan="5">${L("No participants registered yet.", "Все още няма регистрирани участници.")}</td></tr>`;

  const body = `${header(s, lang, "COORDINATED LIST OF PARTICIPANTS", "КООРДИНИРАН СПИСЪК НА УЧАСТНИЦИТЕ")}
    <p>${L(
      `Name-to-code mapping for proficiency testing No. ${s.number}. The code is the only identifier used in all downstream documents and the public Register; the mapping is confidential to PTS Bulgaria.`,
      `Съответствие име ↔ код за изпитване за пригодност № ${s.number}. Кодът е единственият идентификатор във всички последващи документи и в публичния Регистър; съответствието е конфиденциално и известно само на PTS Bulgaria.`
    )}</p>
    <table class="ptable"><thead><tr>
      <th class="n">№</th>
      <th>${L("Laboratory", "Лаборатория")}</th>
      <th class="c">${L("Laboratory code", "Код на лабораторията")}</th>
      <th>${scopeHead}</th>
      <th>${L("PT item", "Обект на РТ схемата")}</th>
    </tr></thead><tbody>${rows}</tbody></table>
    ${compiledBy(s, lang)}
    ${footer(s, FORM2)}`;

  return wrapDoc(lang, `${s.number} — Coordinated List`, body, EXTRA_CSS);
}
