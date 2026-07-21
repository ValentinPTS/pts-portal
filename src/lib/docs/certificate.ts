import type { Scheme, Lang, DocOptions } from "../types";
import { esc, pick, wrapDoc, footer } from "../doc-shell";

const FORM = "proposed";

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
`;

export function renderCertificate(s: Scheme, lang: Lang, opts?: DocOptions): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  // Scheme characteristics, derived from s.parameters and joined with a middot.
  const chars = s.parameters
    .map((p) => esc(pick(lang, p.characteristicEn, p.characteristicBg)))
    .join(" · ");

  const mgr = s.team[0];

  // Per-participant identity (filled when a specific lab's certificate is issued).
  const part = opts?.participant;
  const labName = part ? esc(part.labName) : L("‹ Participant Laboratory ›", "‹ Лаборатория участник ›");
  const labCode = part ? esc(part.code) : "____________";
  const certNo = part?.certNo ? esc(part.certNo) : "____________";
  const certDate = part?.certDate ? esc(part.certDate) : "";

  const body = `<div class="frame">
    <img class="logo" src="/brand/logo.png" alt="PTS Bulgaria">
    <img class="tagline-img" src="/brand/tagline.png" alt="">
    <img class="emb" src="/brand/embroidery-border.png" alt="">

    <div class="ctitle">${L("CERTIFICATE", "СЕРТИФИКАТ")}</div>
    <div class="csub">${L("OF PARTICIPATION", "ЗА УЧАСТИЕ")}</div>
    <div class="crule"></div>

    <div class="lead">${L("This is to certify that", "С настоящото се удостоверява, че")}</div>
    <div class="labname">${labName}</div>
    <div class="labcode">${L("Laboratory code:", "Лабораторен код:")} ${labCode}</div>

    <div class="lead">${L("participated in the proficiency testing scheme", "участва в схемата за изпитване за пригодност")}</div>
    <div class="schemeno">№ ${esc(s.number)}</div>
    <div class="schemename">${L(s.titleEn, s.titleBg)}</div>
    <div class="iso">${L("conducted in accordance with", "проведена в съответствие с")} ${esc(s.standard)}</div>

    <div class="chars"><b>${L("Characteristics:", "Характеристики:")}</b> <span>${chars}</span></div>

    <div class="marks">
      <img class="ilac" src="/brand/ilac-mra.jpg" alt="ilac-MRA">
      <div class="snasbox"><img src="/brand/snas.png" alt="SNAS"><div>${L("Reg. No.", "Рег. №")} ${esc(s.regNo)}</div></div>
    </div>

    <div class="spacer"></div>
    <img class="emb" src="/brand/embroidery-border.png" alt="">
    <div class="sigrow">
      <div class="c"><div style="margin-bottom:26px">${certDate}</div><div class="ln"></div><small>${L("Date of issue", "Дата на издаване")}</small></div>
      <div class="c"><div style="margin-bottom:26px">&nbsp;</div><div class="ln"></div><small>${esc(mgr.name)} — ${L(mgr.roleEn, mgr.roleBg)}</small></div>
    </div>
    <div class="certno">${L("Certificate No.", "Сертификат №")} ${certNo}</div>
    <div class="issued">${L("Issued by PT Provider PTS Bulgaria at Proficiency Testing Solutions Bulgaria Ltd", "Издаден от организатора на изпитване за пригодност PTS Bulgaria към „ПТС България“ ООД")}</div>
    <div class="reg">${L("Published in the Register at www.ptsbg.eu", "Публикуван в Регистъра на www.ptsbg.eu")}</div>
  </div>
  ${footer(s, FORM)}`;

  return wrapDoc(lang, `${s.number} — Certificate`, body, EXTRA_CSS);
}
