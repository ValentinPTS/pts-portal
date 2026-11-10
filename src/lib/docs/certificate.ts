import type { Scheme, Lang, DocOptions } from "../types";
import { isIlc } from "../report-issue-model";
import { marksHtml } from "../accreditation-mark";
import { esc, pick, wrapDoc, footer } from "../doc-shell";
import { looksLikeSimNumber } from "../environment";

// An issued document, not a form of the management system: no form number, and
// the old "proposed" placeholder is gone (Q23, Реш. 100).
const FORM = "";

// Decorative single-page Certificate of Participation. Faithfully mirrors the
// proposed design in poc/certificate-preview.html: green frame, large title,
// centred layout, ILAC-MRA + SNAS accreditation marks, blank participant code.
// Participant-specific fields (lab name, code) are left as blank placeholders —
// they are filled per lab when a certificate is issued.
export const EXTRA_CSS = `
  .frame{border:3px solid var(--green);outline:1px solid var(--green);outline-offset:4px;
    padding:18mm 16mm;display:flex;flex-direction:column;align-items:center;text-align:center;min-height:250mm;}
  .frame .logo{height:78px;margin:14px 0 2px;}
  .frame .tagline-img{height:26px;}
  .frame .emb{display:block;width:100%;height:auto;margin:4px 0 0;}
  .ctitle{font-family:var(--sans);font-weight:800;color:var(--green-dark);font-size:34pt;letter-spacing:2px;margin:26px 0 2px;}
  .csub{font-family:var(--sans);font-weight:600;color:var(--ink);font-size:15pt;letter-spacing:3px;margin-top:-8px;}
  .crule{width:120px;height:3px;background:var(--red);margin:6px 0 22px;}
  .lead{font-size:13pt;color:var(--muted);margin:6px 0;}
  .labname{font-family:var(--sans);font-weight:700;color:var(--ink);font-size:24pt;margin:6px 0 2px;border-bottom:1.5px solid var(--green);padding:0 30px 6px;min-width:60%;}
  .labcode{font-family:var(--sans);color:var(--green-dark);font-size:11pt;margin-bottom:14px;}
  .schemeno{font-family:var(--sans);font-weight:800;color:var(--green-dark);font-size:22pt;margin:8px 0 2px;}
  .schemename{font-family:var(--sans);color:var(--ink);font-size:15pt;}
  .iso{font-size:11pt;color:var(--muted);margin-top:8px;}
  .chars{margin:16px 0 4px;font-size:11pt;}
  .chars b{font-family:var(--sans);color:var(--green-dark);}
  .certcontent{margin:6px 0 2px;font-size:10.5pt;max-width:85%;display:flex;flex-direction:column;gap:2px;}
  .certcontent b{font-family:var(--sans);color:var(--green-dark);}
  .certfrom{font-size:9pt;color:var(--muted);margin-top:2px;}
  .certpreview{border:3px solid #8f2f2f;color:#8f2f2f;font-family:var(--sans);font-weight:800;text-align:center;padding:6px;margin-bottom:6px;letter-spacing:1px;}
  .marks{display:flex;gap:24px;justify-content:center;align-items:center;margin:22px 0 8px;}
  .marks .ilac{height:74px;}
  .snasbox{border:1px solid var(--ink);padding:6px 12px;font-family:var(--sans);}
  .snasbox img{height:34px;display:block;margin:0 auto 3px;} .snasbox div{font-size:9pt;}
  .spacer{flex:1 1 auto;}
  .sigrow{display:flex;justify-content:space-between;width:100%;gap:60px;margin-top:10px;align-items:flex-end;}
  .sigrow .c{flex:1;text-align:center;} .sigrow .ln{border-top:1.5px solid var(--ink);margin:0 10px 4px;}
  .sigrow small{font-family:var(--sans);color:var(--muted);}
  .certno{font-family:var(--sans);color:var(--green-dark);font-size:10pt;margin-top:10px;}
  .issued{font-size:9.5pt;color:var(--muted);margin-top:14px;}
  .reg{font-size:9pt;color:var(--green-dark);font-family:var(--sans);margin-top:2px;}
  .page{padding:10mm;}
  /* keep the on-screen A4 simulation's printed margins while preserving this
     certificate's tighter 10mm inner padding (print gets the plain 10mm above) */
  @media screen{.page{padding:calc(16mm + 10mm) calc(14mm + 10mm) calc(18mm + 10mm) calc(14mm + 10mm);}}
`;

// 7.7: the content as typed from the approved report and checked by a second person (D2, condition 3)
// — never a value the portal computed (Реш. 135)
export function contentHtml(lang: Lang, content: { conclusion: string; results: string; period: string; methods: string } | undefined, fromR?: number, ilc = false): string {
  if (!content) return "";
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const row = (label: string, v: string) => `<div><b>${label}</b> ${esc(v)}</div>`;
  // the R it came from — a correction after the release leaves no doubt which report it rests on (review)
  const from = fromR ? `<div class="certfrom">${ilc ? L(`According to the ILC comparison report R${fromR}`, `По доклада от междулабораторното сравнение R${fromR}`) : L(`According to the final report R${fromR}`, `По окончателния доклад R${fromR}`)}</div>` : "";
  return `<div class="certcontent">${row(L("Result:", "Резултат:"), content.conclusion)}${row(L("Scores:", "Оценки:"), content.results)}${row(L("Period:", "Период:"), content.period)}${row(L("Methods:", "Методи:"), content.methods)}${from}</div>`;
}

/** PTS's preview of a certificate not released (or typed from an earlier R): marked across it — never a
 *  final-looking certificate to send around (review). */
export function previewMark(lang: Lang, preview: "unreleased" | "stale" | undefined): string {
  if (!preview) return "";
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const text = preview === "stale" ? L("PREVIEW — the content is from an earlier R; NOT RELEASED", "ПРЕГЛЕД — съдържанието е от предишно R; НЕ Е ИЗДАДЕН") : L("PREVIEW — NOT RELEASED", "ПРЕГЛЕД — НЕ Е ИЗДАДЕН");
  return `<div class="certpreview" data-cert-preview="${preview}">${text}</div>`;
}

export function renderCertificate(s: Scheme, lang: Lang, opts?: DocOptions): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  // 7.9: an interlaboratory comparison is not a PT — its certificate never says it is
  const ilc = isIlc(s);

  // the scope: what this participation reported (7.7); a template — the scheme's characteristics
  const chars = opts?.participant?.scope
    ? opts.participant.scope.map((x) => esc(lang === "bg" ? x.bg : x.en)).join(" · ")
    : s.parameters.map((p) => esc(pick(lang, p.characteristicEn, p.characteristicBg))).join(" · ");

  const mgr = s.team[0];

  // Per-participant identity (filled when a specific lab's certificate is issued).
  const part = opts?.participant;
  const labName = part ? esc(part.labName) : L("‹ Participant Laboratory ›", "‹ Лаборатория участник ›");
  const labCode = part ? esc(part.code) : "____________";
  const certNo = part?.certNo ? esc(part.certNo) : "____________";
  const certDate = part?.certDate ? esc(part.certDate) : "";

  const body = `${previewMark(lang, opts?.participant?.preview)}<div class="frame">
    <img class="logo" src="/brand/logo.png" alt="PTS Bulgaria">
    <img class="tagline-img" src="/brand/tagline.png" alt="">
    <img class="emb" src="/brand/embroidery-border.png" alt="">

    <div class="ctitle">${L("CERTIFICATE", "СЕРТИФИКАТ")}</div>
    <div class="csub">${L("OF PARTICIPATION", "ЗА УЧАСТИЕ")}</div>
    <div class="crule"></div>

    <div class="lead">${L("This is to certify that", "С настоящото се удостоверява, че")}</div>
    <div class="labname">${labName}</div>
    <div class="labcode">${L("Laboratory code:", "Лабораторен код:")} ${labCode}</div>

    <div class="lead">${ilc ? L("participated in the interlaboratory comparison", "участва в междулабораторното сравнение") : L("participated in the proficiency testing scheme", "участва в схемата за изпитване за пригодност")}</div>
    <div class="schemeno">№ ${esc(s.number)}</div>
    <div class="schemename">${L(s.titleEn, s.titleBg)}</div>
    <div class="iso">${L("conducted in accordance with", "проведена в съответствие с")} ${esc(s.standard)}</div>

    <div class="chars"><b>${L("Characteristics:", "Характеристики:")}</b> <span>${chars}</span></div>
    ${contentHtml(lang, opts?.participant?.content, opts?.participant?.fromR, ilc)}

    ${marksHtml(s, lang)}

    <div class="spacer"></div>
    <img class="emb" src="/brand/embroidery-border.png" alt="">
    <div class="sigrow">
      <div class="c"><div style="margin-bottom:26px">${certDate}</div><div class="ln"></div><small>${L("Date of issue", "Дата на издаване")}</small></div>
      <div class="c"><div style="margin-bottom:26px">&nbsp;</div><div class="ln"></div><small>${esc(mgr.name)} — ${L(mgr.roleEn, mgr.roleBg)}</small></div>
    </div>
    <div class="certno">${L("Certificate No.", "Сертификат №")} ${certNo}</div>
    <div class="issued">${ilc ? L("Issued by PTS Bulgaria at Proficiency Testing Solutions Bulgaria Ltd — an interlaboratory comparison, outside the accreditation", "Издаден от PTS Bulgaria към „ПТС България“ ООД — междулабораторно сравнение, извън обхвата на акредитацията") : L("Issued by PT Provider PTS Bulgaria at Proficiency Testing Solutions Bulgaria Ltd", "Издаден от организатора на изпитване за пригодност PTS Bulgaria към „ПТС България“ ООД")}</div>
    <div class="reg">${looksLikeSimNumber(s.number)
      // a simulation round's «certificate» is never in the register (Реш. 130, 1.2)
      ? L("SIMULATION — not a certificate, not in the Register", "СИМУЛАЦИЯ — не е сертификат и не е в Регистъра")
      : L("Published in the Register at www.ptsbg.eu", "Публикуван в Регистъра на www.ptsbg.eu")}</div>
  </div>
  ${footer(s, FORM)}`;

  return wrapDoc(lang, `${s.number} — Certificate`, body, EXTRA_CSS);
}
