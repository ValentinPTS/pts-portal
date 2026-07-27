import type { NextRequest } from "next/server";
import { getScheme } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { listCaseEvents } from "@/lib/case-events";
import { getDoc } from "@/lib/documents";
import { metricsForScheme, scoreMetric, sigmaFloor } from "@/lib/scoring";
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

  // Number formatting identical to the Final Report so the pack and the report
  // print the same digits.
  const clean = (v: number) => parseFloat(v.toFixed(6));
  const g = (v: number | null | undefined) =>
    v === null || v === undefined || Number.isNaN(v) ? "" : esc(String(clean(v)));
  const s2 = (v: number | null | undefined) =>
    v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(2);
  // Same verdict wording as the Final Report (scoring.ts). The pack is handed over
  // WITH the report, so it must match the report's wording, not the screen's.
  const verdictCell = (v: string | null) => {
    if (v === null) return "—";
    if (v === "A") return L("A — satisfactory", "A — удовлетв.");
    if (v === "N") return `<b class="bad">${L("N — unsatisfactory", "N — неудовлетв.")}</b>`;
    if (v === "satisfactory") return L("Satisfactory", "Удовлетворителен");
    if (v === "warning") return `<b class="warn">${L("Warning", "Предупреждение")}</b>`;
    return `<b class="bad">${L("Action", "Действие")}</b>`;
  };

  const role = await getCurrentRole();
  const wantNames = req.nextUrl.searchParams.get("names") === "1";
  const showNames = canRevealNames(role) && wantNames; // managers only

  const participants = await listParticipants(id);
  // One scheme-wide query, grouped by code — instead of one round-trip per
  // participant (which serialized N DB calls before any bytes were sent). The
  // full-scheme fetch is newest-first; each code's slice is re-sorted below.
  const allEvents = await listCaseEvents(id);
  const eventsByCode = new Map<string, typeof allEvents>();
  for (const e of allEvents) {
    const arr = eventsByCode.get(e.code);
    if (arr) arr.push(e);
    else eventsByCode.set(e.code, [e]);
  }
  const metrics = metricsForScheme(scheme);
  const isCal = scheme.type === "C";
  // Score ONCE per metric for the whole scheme (scoreMetric walks every code), then
  // index by code — the pack REUSES the Final Report's numbers instead of
  // recomputing them, so xpt / σpt / u(xpt) / z / ζ / Eₙ match report.ts exactly.
  // Hoisted out of the participant loop: inside it this would be
  // O(participants × metrics × participants).
  const scored = new Map(
    metrics.map((m) => {
      const { assigned, rows } = scoreMetric(scheme, m.key);
      return [
        m.key,
        {
          assigned,
          // the σ actually used for z, with the σpt,min floor applied
          sigmaEff: Math.max(assigned?.sigma || 0, sigmaFloor(scheme, m.key)),
          byCode: new Map(rows.map((r) => [r.code, r] as const)),
        },
      ] as const;
    })
  );
  const resHead = isCal
    ? `<th>${L("Characteristic", "Характеристика")}</th><th>X<sub>LAB</sub></th><th>U<sub>LAB</sub></th>`
      + `<th>X<sub>REF</sub></th><th>U<sub>REF</sub></th><th>D</th><th>E<sub>n</sub></th>`
      + `<th>${L("Evaluation", "Оценка")}</th>`
    : `<th>${L("Characteristic", "Характеристика")}</th><th>x<sub>i</sub></th><th>u(x<sub>i</sub>)</th>`
      + `<th>x<sub>pt</sub></th><th>σ<sub>pt</sub></th><th>u(x<sub>pt</sub>)</th><th>z</th><th>ζ</th>`
      + `<th>${L("Evaluation", "Оценка")}</th>`;
  const now = new Date();
  const stamp = `${String(now.getUTCDate()).padStart(2, "0")}.${String(now.getUTCMonth() + 1).padStart(2, "0")}.${now.getUTCFullYear()} ${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")} UTC`;

  // build each participant's section
  const sections: string[] = [];
  for (const p of participants) {
    // Oldest-first: an audit pack must read as a chronology. listCaseEvents is
    // deliberately NEWEST-first because the case file, the traceability matrix and
    // computeLabPhases all take the FIRST match per kind as the latest — so the pack
    // sorts its own copy and leaves that shared behaviour alone.
    const events = [...(eventsByCode.get(p.code) ?? [])].sort(
      (a, b) =>
        (a.at || "").localeCompare(b.at || "") ||
        (a.recordedAt || "").localeCompare(b.recordedAt || "")
    );
    const rows = events.length
      ? events.map((e) => {
          const doc = e.docKey ? getDoc(e.docKey) : undefined;
          const refCell = [doc ? L(doc.nameEn, doc.nameBg) : "", e.ref ?? ""].filter(Boolean).join(" · ");
          return `<tr>
          <td class="d">${fmtDate(e.at)}</td>
          <td>${L(kindEn(e.kind), kindBg(e.kind))}</td>
          <td>${esc(refCell)}</td>
          <td>${esc(e.note ?? "")}</td>
          <td class="s">${e.source === "auto" ? L("auto", "авт.") : L("manual", "ръчно")}</td>
        </tr>`;
        }).join("")
      : `<tr><td colspan="5" class="muted">${L("No timeline steps recorded.", "Няма записани стъпки.")}</td></tr>`;

    // What the lab reported AND how it was judged. Showing only the reported value
    // told an assessor nothing about the evaluation — the pack now carries the
    // assigned value, its uncertainty, the σ actually used, the score and the
    // verdict, all taken from the same scoreMetric() the Final Report uses.
    const resRows = metrics
      .map((m) => {
        const sc = scored.get(m.key);
        const r = sc?.byCode.get(p.code);
        if (!sc || !r) return ""; // no result for this lab/metric — same as before
        const a = sc.assigned;
        const mid = isCal
          ? `<td class="d">${g(a?.xpt)}</td><td class="d">${g(a?.u)}</td>`
            + `<td class="d">${a ? g(r.value - a.xpt) : ""}</td><td class="d">${s2(r.en)}</td>`
          : `<td class="d">${g(a?.xpt)}</td><td class="d">${a ? g(sc.sigmaEff) : ""}</td>`
            + `<td class="d">${g(a?.u)}</td><td class="d">${s2(r.z)}</td><td class="d">${s2(r.zeta)}</td>`;
        return `<tr><td>${L(m.labelEn, m.labelBg)}</td><td class="d">${g(r.value)}</td>`
          + `<td class="d">${g(r.u)}</td>${mid}<td>${verdictCell(r.verdict)}</td></tr>`;
      })
      .join("");

    sections.push(`<section>
      <h2><span class="code">${esc(p.code)}</span>${showNames ? ` <span class="nm">— ${esc(p.labName)}${p.country ? `, ${esc(p.country)}` : ""}</span>` : ""}</h2>
      <h3>${L("Timeline", "Хронология")}</h3>
      <table class="tl"><thead><tr>
        <th>${L("Date", "Дата")}</th><th>${L("Event", "Събитие")}</th><th>${L("Ref / waybill", "Реф. / товарителница")}</th><th>${L("Note", "Бележка")}</th><th>${L("Source", "Източник")}</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <h3>${L("Reported results and evaluation", "Въведени резултати и оценка")}</h3>
      ${resRows
        ? `<table class="rs"><thead><tr>${resHead}</tr></thead><tbody>${resRows}</tbody></table>`
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
  table.rs{font-size:11px} table.rs td.d{text-align:right}
  .bad{color:#9e2b2b} .warn{color:#b8860b}
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
