import type { Scheme, Lang } from "../types";
import { esc, pick, wrapDoc, footer } from "../doc-shell";

const FORM = "internal";

// The Order (ЗАПОВЕД) — the internal memo that starts a scheme: it appoints the
// team, names the object, activity, characteristics, external providers and the
// start date. Faithful to Documents\Testing|Calibration\1 - Заповед - BG.pdf
// (a plain internal memo, not a branded cover-page document). The originals are
// Bulgarian-only; an English column is provided for the app's bilingual toggle.
const EXTRA_CSS = `
  .ohead{display:flex;align-items:center;gap:14px;border-bottom:2px solid var(--red);padding-bottom:8px;}
  .ohead .logo{height:54px;}
  .ohead .tag{height:26px;margin-left:auto;}
  .ohead .who{font-family:var(--sans);font-size:9.5pt;color:var(--muted);text-align:right;}
  .otitle{font-family:var(--sans);font-weight:800;color:var(--green-dark);font-size:21pt;text-align:center;letter-spacing:3px;margin:22px 0 0;}
  .odate{text-align:center;color:var(--muted);font-family:var(--sans);margin:2px 0 14px;}
  .orel{font-style:italic;margin:10px 0 4px;}
  .odecl{font-family:var(--sans);font-weight:800;color:var(--red);text-align:center;font-size:13pt;letter-spacing:2px;margin:12px 0 10px;}
  .oitem{margin:9px 0;} .oitem .lbl{font-family:var(--sans);font-weight:700;color:var(--ink);}
  .oitem ul{margin:4px 0 0;padding-left:20px;} .oitem li{margin:2px 0;}
  .oteam{margin:5px 0 0;padding-left:0;list-style:none;}
  .oteam li{margin:4px 0;} .oteam .role{font-family:var(--sans);font-weight:700;color:var(--green-dark);}
  .osign{margin-top:44px;margin-left:auto;width:300px;text-align:center;} .osign .ln{border-top:2px solid var(--green-dark);padding-top:4px;}
  .osign .nm{font-family:var(--sans);font-weight:700;} .osign .rl{color:var(--muted);font-size:9.5pt;}
`;

export function renderOrder(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const isCal = s.type === "C";
  const startDate = s.schedule[0]?.date ?? "";
  const mgr = s.team[0];

  // numbered items, mirroring the real memo (testing carries the characteristics
  // line, calibration does not)
  const items: string[] = [];
  items.push(
    `<div class="oitem"><span class="lbl">${L("Proficiency testing scheme No.", "Номер на схемата за изпитване за пригодност")}:</span> № ${esc(s.number)}</div>`
  );
  items.push(
    `<div class="oitem"><span class="lbl">${L("Object of the scheme", "Обект на схемата за изпитване за пригодност")}:</span> ${L(s.objectEn, s.objectBg)}</div>`
  );
  items.push(
    `<div class="oitem"><span class="lbl">${L("Laboratory activity", "Лабораторна дейност")}:</span> ${L(isCal ? "Calibration" : "Testing", isCal ? "Калибриране" : "Изпитване")}</div>`
  );
  if (!isCal && s.parameters.length) {
    items.push(
      `<div class="oitem"><span class="lbl">${L("Tested characteristics", "Изпитвани характеристики")}:</span>
        <ul>${s.parameters
          .map((p) => `<li>${L(p.characteristicEn, p.characteristicBg)} (${L(p.standardEn, p.standardBg)})</li>`)
          .join("")}</ul></div>`
    );
  }
  // external providers — testing: the partner lab(s); calibration: the reference lab
  const providers = isCal
    ? s.calibration && (s.calibration.referenceLabEn || s.calibration.referenceLabBg)
      ? `<ul><li>${L(s.calibration.referenceLabEn, s.calibration.referenceLabBg)} — ${L(
          "calibration of the travelling device (reference values)",
          "калибриране на пътуващото устройство (референтни стойности)"
        )}</li></ul>`
      : ""
    : `<ul><li>${L(s.partner.nameEn, s.partner.nameBg)} — ${esc(
        (lang === "bg" ? s.partner.servicesBg : s.partner.servicesEn).join(", ").toLowerCase()
      )}</li></ul>`;
  items.push(
    `<div class="oitem"><span class="lbl">${L("External service provider(s) for the laboratory activities", "Използван доставчик на външни услуги за лабораторните дейности")}:</span> ${providers}</div>`
  );
  items.push(
    `<div class="oitem"><span class="lbl">${L("Start date of the proficiency testing", "Начална дата за стартиране на изпитването за пригодност")}:</span> ${esc(startDate)}</div>`
  );
  items.push(
    `<div class="oitem"><span class="lbl">${L("Team conducting the scheme", "Екип за провеждане на схемата за изпитване за пригодност")}:</span>
      <ul class="oteam">${s.team
        .map((m) => `<li><span class="role">${L(m.roleEn, m.roleBg)}:</span> ${esc(m.name)}</li>`)
        .join("")}</ul></div>`
  );

  const numbered = items
    .map((it, i) => it.replace('<div class="oitem">', `<div class="oitem">${i + 1}. `))
    .join("");

  const body = `<div class="ohead">
      <img class="logo" src="/brand/logo.png" alt="PTS Bulgaria">
      <img class="tag" src="/brand/tagline.png" alt="When quality matters">
      <div class="who">Proficiency Testing Solutions Bulgaria Ltd<br>office@ptsbg.eu · www.ptsbg.eu</div>
    </div>
    <div class="otitle">${L("ORDER", "ЗАПОВЕД")}</div>
    <div class="odate">${L("dated", "от")} ${esc(s.orderDate ?? "____________")}</div>
    <div class="orel">${L("Regarding: Planning of proficiency testing", "Относно: Планиране на изпитване на пригодност")}</div>
    <div class="odecl">${L("I DETERMINE", "ОПРЕДЕЛЯМ")}:</div>
    ${numbered}
    <div class="osign">
      <div class="ln"></div>
      <div class="nm">${mgr ? esc(mgr.name) : ""}</div>
      <div class="rl">${L("Head of the Proficiency Testing Provider", "Ръководител на организатора на изпитване за пригодност")}</div>
    </div>
    ${footer(s, FORM)}`;

  return wrapDoc(lang, `${s.number} — ${pick(lang, "Order", "Заповед")}`, body, EXTRA_CSS);
}
