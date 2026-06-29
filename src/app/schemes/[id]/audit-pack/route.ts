import type { NextRequest } from "next/server";
import { getScheme } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { listCaseEvents } from "@/lib/case-events";
import { metricsForScheme } from "@/lib/scoring";
import { esc, pick } from "@/lib/doc-shell";
import { requireStaff, canRevealNames, getCurrentRole } from "@/lib/roles";

// Audit-pack export (Phase RT4) — a clean, printable per-scheme report to hand the
// SNAS/Bratislava auditor: for every participant CODE, the dated timeline + the
// reported results. Code-only by default (§4.2); a manager may add ?names=1 to
// include real names for an internal copy. Read-only (requireStaff): managers,
// staff and auditors can produce it. Save as PDF via the browser's print dialog.
export const dynamic = "force-dynamic";

function fmtDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : esc(d);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await ctx.params;
  const scheme = await getScheme(id);
  if (!scheme) return new Response("Not found", { status: 404 });

  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "bg";
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));

  const role = await getCurrentRole();
  const wantNames = req.nextUrl.searchParams.get("names") === "1";
  const showNames = canRevealNames(role) && wantNames; // managers only

  const participants = await listParticipants(id);
  const metrics = metricsForScheme(scheme);
  const now = new Date();
  const stamp = `${String(now.getUTCDate()).padStart(2, "0")}.${String(now.getUTCMonth() + 1).padStart(2, "0")}.${now.getUTCFullYear()} ${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")} UTC`;

  // build each participant's section
  const sections: string[] = [];
  for (const p of participants) {
    const events = await listCaseEvents(id, p.code);
    const rows = events.length
      ? events.map((e) => `<tr>
          <td class="d">${fmtDate(e.at)}</td>
          <td>${L(kindEn(e.kind), kindBg(e.kind))}</td>
          <td>${esc(e.ref ?? "")}</td>
          <td>${esc(e.note ?? "")}</td>
          <td class="s">${e.source === "auto" ? L("auto", "авт.") : L("manual", "ръчно")}</td>
        </tr>`).join("")
      : `<tr><td colspan="5" class="muted">${L("No timeline steps recorded.", "Няма записани стъпки.")}</td></tr>`;

    const reported = scheme.scoring?.results?.[p.code] ?? {};
    const resRows = metrics
      .filter((m) => reported[m.key] != null)
      .map((m) => {
        const r = reported[m.key];
        return `<tr><td>${L(m.labelEn, m.labelBg)}</td><td class="d">${esc(String(r.value))}</td><td class="d">${r.u != null ? esc(String(r.u)) : ""}</td></tr>`;
      }).join("");

    sections.push(`<section>
      <h2><span class="code">${esc(p.code)}</span>${showNames ? ` <span class="nm">— ${esc(p.labName)}${p.country ? `, ${esc(p.country)}` : ""}</span>` : ""}</h2>
      <h3>${L("Timeline", "Хронология")}</h3>
      <table class="tl"><thead><tr>
        <th>${L("Date", "Дата")}</th><th>${L("Event", "Събитие")}</th><th>${L("Ref / waybill", "Реф. / товарителница")}</th><th>${L("Note", "Бележка")}</th><th>${L("Source", "Източник")}</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <h3>${L("Reported results", "Въведени резултати")}</h3>
      ${resRows
        ? `<table class="rs"><thead><tr><th>${L("Characteristic", "Характеристика")}</th><th>${L("Value", "Стойност")}</th><th>U</th></tr></thead><tbody>${resRows}</tbody></table>`
        : `<p class="muted">${L("No results reported.", "Няма въведени резултати.")}</p>`}
    </section>`);
  }

  const schemeTitle = L(scheme.titleEn, scheme.titleBg);
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<title>${esc(scheme.number)} — ${L("Audit pack", "Одиторски пакет")}</title>
<style>
  *{box-sizing:border-box} body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2a1a;margin:0;padding:24px 28px;font-size:12.5px;line-height:1.45}
  h1{font-size:20px;color:#2f5d2a;margin:0 0 2px} .sub{color:#6b6b6b;margin:0 0 4px}
  h2{font-size:15px;color:#2f5d2a;border-bottom:2px solid #9e2b2b;padding-bottom:3px;margin:22px 0 8px}
  h3{font-size:12.5px;color:#3e3e3e;margin:12px 0 4px}
  .code{font-family:Consolas,monospace;font-weight:700}
  .nm{font-weight:400;color:#3e3e3e}
  table{border-collapse:collapse;width:100%;margin:2px 0 6px}
  th,td{border:1px solid #cdd6c4;padding:4px 7px;text-align:left;vertical-align:top}
  th{background:#eef3e8;color:#2f5d2a;font-size:11px}
  td.d,th + th{white-space:nowrap} td.d{font-variant-numeric:tabular-nums}
  td.s{color:#6b6b6b}
  .muted{color:#888;font-style:italic}
  .bar{display:flex;gap:10px;align-items:center;justify-content:space-between;background:#f5f7f2;border:1px solid #cdd6c4;border-radius:8px;padding:8px 12px;margin-bottom:16px}
  .bar button,.bar a{font:inherit;border:1px solid #cdd6c4;background:#fff;border-radius:6px;padding:5px 10px;cursor:pointer;text-decoration:none;color:#1f2a1a}
  section{break-inside:avoid}
  @media print{.noprint{display:none!important} body{padding:0}}
</style></head><body>
<div class="bar noprint">
  <strong>${L("Audit pack", "Одиторски пакет")}</strong>
  <span>
    <button onclick="window.print()">${L("Save as PDF / Print", "Запази като PDF / Печат")}</button>&nbsp;
    <a href="?lang=${lang === "en" ? "bg" : "en"}${wantNames ? "&names=1" : ""}">${lang === "en" ? "БГ" : "EN"}</a>
  </span>
</div>
<h1>${esc(scheme.number)} — ${schemeTitle}</h1>
<p class="sub">${L("Audit pack (codes only)", "Одиторски пакет (само кодове)")}${showNames ? L(" · with names", " · с имена") : ""} · ${L("generated", "генериран")} ${stamp} · ${participants.length} ${L("participants", "участници")}</p>
${sections.join("") || `<p class="muted">${L("No participants yet.", "Все още няма участници.")}</p>`}
</body></html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff" },
  });
}

// kind → bilingual label (kept local so the route stays self-contained)
function kindEn(k: string): string {
  return ({
    code_assigned: "Code assigned", docs_sent: "Documents sent", items_dispatched: "PT items dispatched",
    receipt_confirmed: "Receipt confirmed", results_returned: "Results returned", scored: "Results scored",
    report_issued: "Report / certificate issued", other: "Other",
  } as Record<string, string>)[k] ?? k;
}
function kindBg(k: string): string {
  return ({
    code_assigned: "Присвоен код", docs_sent: "Изпратени документи", items_dispatched: "Изпратени обекти",
    receipt_confirmed: "Потвърдено получаване", results_returned: "Върнати резултати", scored: "Оценени резултати",
    report_issued: "Издаден доклад / сертификат", other: "Друго",
  } as Record<string, string>)[k] ?? k;
}
