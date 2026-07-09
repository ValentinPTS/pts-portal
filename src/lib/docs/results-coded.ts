import type { Scheme, Lang, DocOptions } from "../types";
import { esc, pick, wrapDoc, docHeader, footer } from "../doc-shell";
import { metricsForScheme } from "../scoring";

// F 7.2.1-6 «Кодиран списък на резултатите / Encrypted list of results» — NEW in
// the provider's 2026 standard workbook. One section PER CHARACTERISTIC (the
// workbook keeps them as separate sheets z1/z2/z4; the owner chose one document
// with a section per characteristic, 2026-07-08). Codes only — no lab names —
// so it is publishable/shareable without breaking §4.2. Per row: laboratory code,
// sample code, individual determinations I/II/III, mean value, uncertainty.
// Data: scheme.scoring.results (mean/u/determinations) + participants (codes).
const FORM = "F 7.2.1-6";

const ROMAN = ["I", "II", "III", "IV", "V", "VI"];

const EXTRA_CSS = `
  .code{font-family:var(--sans);font-weight:700;color:var(--green-dark);}
  table.ptable{font-size:9pt;} table.ptable td.c,table.ptable th.c{text-align:center;}
  .charmeta{margin:14px 0 6px;font-size:10pt;}
  .charmeta b{margin-right:6px;}
  .charsec + .charsec{page-break-before:always;}
  .empty{color:var(--muted);font-style:italic;text-align:center;}
  .signs{margin-top:26px;font-family:var(--sans);font-size:9.5pt;display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;}
  .signs .ln{display:inline-block;border-bottom:1px solid #999;min-width:170px;}
`;

// Съставил = data collection & coding expert; Проверил = the scheme manager.
function teamRole(s: Scheme, re: RegExp): { name: string; roleEn: string; roleBg: string } | undefined {
  return s.team.find((m) => re.test(m.roleBg + m.roleEn));
}

export function renderResultsCoded(s: Scheme, lang: Lang, opts?: DocOptions): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const ps = opts?.participants ?? [];
  const sampleByCode = new Map(ps.map((p) => [p.code, p.sampleCode ?? ""]));
  const codes = ps.length ? ps.map((p) => p.code) : Object.keys(s.scoring?.results ?? {});
  const metrics = metricsForScheme(s);

  // determination columns: the standard form shows I/II/III; widen if more stored
  const detCount = Math.max(
    3,
    ...codes.flatMap((c) => metrics.map((m) => s.scoring?.results[c]?.[m.key]?.determinations?.length ?? 0))
  );
  const fmt = (v: number | null | undefined) =>
    v === null || v === undefined || Number.isNaN(v) ? "" : esc(String(v));

  const sections = metrics
    .map((m, mi) => {
      // testing metrics map 1:1 to parameters — attach the standard code when known
      const par = s.type === "T" ? s.parameters[parseInt(m.key, 10)] : undefined;
      const charLabel =
        esc(pick(lang, m.labelEn, m.labelBg)) + (par ? ` — ${esc(pick(lang, par.standardEn, par.standardBg))}` : "");
      const rows = codes.length
        ? codes
            .map((code) => {
              const e = s.scoring?.results[code]?.[m.key];
              const det = Array.from({ length: detCount }, (_, k) => `<td class="c">${fmt(e?.determinations?.[k])}</td>`).join("");
              return `<tr>
                <td class="code c">${esc(code)}</td>
                <td class="code c">${esc(sampleByCode.get(code) ?? "")}</td>
                ${det}
                <td class="c">${fmt(e?.value)}</td>
                <td class="c">${fmt(e?.u)}</td>
              </tr>`;
            })
            .join("")
        : `<tr><td class="empty" colspan="${detCount + 4}">${L("No participants registered yet.", "Все още няма регистрирани участници.")}</td></tr>`;

      return `<div class="charsec">
        <p class="charmeta"><b>${L("Product:", "Продукт:")}</b> ${L(s.objectEn, s.objectBg)}<br>
        <b>${L("Characteristics:", "Характеристика:")}</b> ${charLabel}</p>
        <table class="ptable"><thead>
          <tr>
            <th class="c" rowspan="2">${L("Laboratory code", "Код на лабораторията")}</th>
            <th class="c" rowspan="2">${L("Sample code", "Код на пробата")}</th>
            <th class="c" colspan="${detCount}">${L("Results", "Резултати")}</th>
            <th class="c" rowspan="2">${L("Mean value", "Средна стойност")}</th>
            <th class="c" rowspan="2">${L("Uncertainty (k=2, P=95%)", "Неопределеност (к=2, Р=95%)")}</th>
          </tr>
          <tr>${Array.from({ length: detCount }, (_, k) => `<th class="c">${ROMAN[k] ?? k + 1}</th>`).join("")}</tr>
        </thead><tbody>${rows}</tbody></table>
      </div>`;
    })
    .join("");

  const compiler = teamRole(s, /кодиран|coding/i);
  const approver = teamRole(s, /ръководител|manager|head/i);
  const date = esc(s.orderDate ?? s.revisionDate);
  const signs = `<div class="signs">
    <div>${date} &nbsp; ${L("Date", "Дата")}<br><br>${L("Compiled by", "Съставил")}: <span class="ln"></span>${
      compiler ? ` &nbsp;${esc(compiler.name)} — ${L(compiler.roleEn, compiler.roleBg)}` : ""
    }</div>
    <div>${date} &nbsp; ${L("Date", "Дата")}<br><br>${L("Approved by", "Проверил")}: <span class="ln"></span>${
      approver ? ` &nbsp;${esc(approver.name)} — ${L(approver.roleEn, approver.roleBg)}` : ""
    }</div>
  </div>`;

  const body = `${docHeader(s, lang, "ENCRYPTED LIST OF RESULTS", "КОДИРАН СПИСЪК НА РЕЗУЛТАТИТЕ")}
    ${sections || `<p class="empty">${L("No characteristics defined for this scheme yet.", "Все още няма дефинирани характеристики за тази схема.")}</p>`}
    ${signs}
    ${footer(s, FORM)}`;

  return wrapDoc(lang, `${s.number} — Encrypted List of Results`, body, EXTRA_CSS);
}
