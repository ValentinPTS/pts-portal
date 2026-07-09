import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { listCaseEvents } from "@/lib/case-events";
import { addCaseEventAction, deleteCaseEventAction } from "@/lib/actions";
import { canRevealNames, getCurrentRole } from "@/lib/roles";
import { getServerT } from "@/lib/i18n-server";
import { DOCUMENTS } from "@/lib/documents";
import type { CaseEventKind } from "@/lib/types";

// Participant case file (Phase RT3) — the auditor's per-lab view, by CODE. Dated
// timeline of milestones (auto + manual), the identity (name revealed to managers
// only), and a link to the combined results. Owner-area page (gated by proxy.ts).
export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  applied: "var(--muted)", approved: "var(--success)", invoiced: "var(--info)",
  paid: "var(--info)", dispatched: "var(--blue)", received: "var(--teal)",
  submitted: "var(--amber)", scored: "var(--green-dark)",
};
const MANUAL_KINDS: CaseEventKind[] = [
  "docs_sent", "items_dispatched", "receipt_confirmed", "results_returned", "scored", "report_issued", "other",
];

function fmtDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : d;
}

export default async function CaseFilePage({
  params, searchParams,
}: {
  params: Promise<{ id: string; code: string }>;
  searchParams: Promise<{ reveal?: string; kind?: string; from?: string }>;
}) {
  const { id, code: rawCode } = await params;
  const code = decodeURIComponent(rawCode);
  const sp = await searchParams;
  // arriving from the traceability matrix: pre-select the clicked step + return there
  const preKind: CaseEventKind = MANUAL_KINDS.includes(sp.kind as CaseEventKind) ? (sp.kind as CaseEventKind) : "docs_sent";
  const returnTo = sp.from === "trace" ? `/schemes/${id}/traceability` : "";

  const s = await getScheme(id);
  if (!s) notFound();
  const p = (await listParticipants(id)).find((x) => x.code === code);
  if (!p) notFound();

  const { lang, tr } = await getServerT();
  const role = await getCurrentRole();
  const canReveal = canRevealNames(role); // manager only
  const revealed = canReveal && sp.reveal === "1";

  const events = await listCaseEvents(id, code);
  const reported = s.scoring?.results?.[code] ?? {};
  const reportedCount = Object.keys(reported).length;
  const today = new Date().toISOString().slice(0, 10);

  const labelStyle = { fontSize: 12, color: "var(--muted)" } as const;
  const inputCls = "w-full rounded px-2 py-1 text-sm";
  const inputStyle = { border: "1px solid var(--line)", background: "#fff" } as const;

  return (
    <div>
      <Link href={`/schemes/${id}/participants`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {tr("case.back")}
      </Link>

      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{tr("case.title")}</h1>
        <span className="font-mono font-bold text-lg" style={{ color: "var(--green-dark)" }}>{code}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[p.status] ?? "var(--muted)" }}>● {tr(`pstatus.${p.status}`)}</span>
      </div>

      {/* identity */}
      <div className="card mt-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold" style={{ color: "var(--green-dark)" }}>{tr("case.identity")}</h2>
          {canReveal && (
            revealed
              ? <Link href={`/schemes/${id}/participants/${encodeURIComponent(code)}`} className="btn btn-sm" style={{ fontSize: 12 }}>{tr("case.hide")}</Link>
              : <Link href={`/schemes/${id}/participants/${encodeURIComponent(code)}?reveal=1`} className="btn btn-sm" style={{ fontSize: 12 }}>{tr("case.reveal")}</Link>
          )}
        </div>
        <div className="grid mt-2" style={{ gridTemplateColumns: "120px 1fr", gap: "6px 12px", fontSize: 14 }}>
          <div style={labelStyle}>{tr("case.code")}</div>
          <div className="font-mono font-bold" style={{ color: "var(--green-dark)" }}>{code}</div>
          <div style={labelStyle}>{tr("case.name")}</div>
          <div>
            {revealed
              ? <span>{p.labName}{p.country ? `, ${p.country}` : ""}{p.contact ? ` · ${p.contact}` : ""}{p.email ? ` · ${p.email}` : ""}</span>
              : <span style={{ color: "var(--muted)", fontStyle: "italic" }}>{tr("case.hiddenName")}</span>}
          </div>
        </div>
        {!canReveal && <p className="mt-2" style={labelStyle}>{tr("case.revealHint")}</p>}
      </div>

      {/* timeline */}
      <h2 className="text-lg font-bold mt-7 mb-2 pb-1" style={{ color: "var(--green-dark)", borderBottom: "2px solid var(--red)" }}>
        {tr("case.timeline")}
      </h2>
      <div className="card overflow-hidden">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <tbody>
            {events.length === 0 && (
              <tr><td className="p-3" style={{ color: "var(--muted)" }}>{tr("case.noEvents")}</td></tr>
            )}
            {events.map((e) => (
              <tr key={e.id} style={{ borderTop: "1px solid var(--line)", verticalAlign: "top" }}>
                <td className="p-2" style={{ width: 110, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtDate(e.at)}</td>
                <td className="p-2">
                  <span style={{ fontWeight: 700, color: "var(--green-dark)" }}>{tr(`casekind.${e.kind}`)}</span>
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "#fff", background: e.source === "auto" ? "var(--green-light)" : "var(--info)", borderRadius: 999, padding: "1px 7px" }}>
                    {e.source === "auto" ? tr("case.auto") : tr("case.manual")}
                  </span>
                  {e.docKey && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--green-dark)", background: "var(--green-soft)", border: "1px solid var(--line)", borderRadius: 999, padding: "1px 8px" }}>
                      📄 {(() => { const d = DOCUMENTS.find((x) => x.key === e.docKey); return d ? (lang === "bg" ? d.nameBg : d.nameEn) : e.docKey; })()}
                    </span>
                  )}
                  {e.ref && <span style={{ marginLeft: 8 }}>· {e.ref}</span>}
                  {e.note && <div style={{ color: "var(--muted)", fontSize: 13 }}>{e.note}</div>}
                  {e.recordedBy && <div style={{ color: "var(--muted)", fontSize: 11 }}>{tr("case.recordedBy")}: {e.recordedBy}</div>}
                </td>
                <td className="p-2" style={{ width: 90, textAlign: "right" }}>
                  {canReveal && e.source === "manual" && (
                    <form action={deleteCaseEventAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="schemeId" value={id} />
                      <input type="hidden" name="code" value={code} />
                      <button type="submit" className="btn btn-sm" style={{ fontSize: 11, padding: "3px 8px", borderColor: "var(--red)", color: "var(--red)" }}>{tr("case.remove")}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* add a step */}
      <h3 id="add" className="font-bold mt-6 mb-1" style={{ color: "var(--green-dark)" }}>{tr("case.addStep")}</h3>
      <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>{tr("case.addHint")}</p>
      <form action={addCaseEventAction} className="grid gap-3 items-end" style={{ gridTemplateColumns: "1.4fr 1fr 1.4fr auto" }}>
        <input type="hidden" name="schemeId" value={id} />
        <input type="hidden" name="code" value={code} />
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <label className="block"><span className="block mb-0.5" style={labelStyle}>{tr("case.kind")}</span>
          <select name="kind" className={inputCls} style={inputStyle} defaultValue={preKind}>
            {MANUAL_KINDS.map((k) => <option key={k} value={k}>{tr(`casekind.${k}`)}</option>)}
          </select></label>
        <label className="block"><span className="block mb-0.5" style={labelStyle}>{tr("case.date")}</span>
          <input name="at" type="date" defaultValue={today} className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block mb-0.5" style={labelStyle}>{tr("case.ref")}</span>
          <input name="ref" className={inputCls} style={inputStyle} /></label>
        <button type="submit" className="btn btn-primary">{tr("case.addButton")}</button>
        <label className="block" style={{ gridColumn: "1 / 3" }}><span className="block mb-0.5" style={labelStyle}>{tr("case.docKey")}</span>
          <select name="docKey" className={inputCls} style={inputStyle} defaultValue="">
            <option value=""></option>
            {DOCUMENTS.map((d) => <option key={d.key} value={d.key}>{lang === "bg" ? d.nameBg : d.nameEn}</option>)}
          </select></label>
        <label className="block" style={{ gridColumn: "3 / -1" }}><span className="block mb-0.5" style={labelStyle}>{tr("case.note")}</span>
          <input name="note" className={inputCls} style={inputStyle} /></label>
      </form>

      {/* files the lab uploaded from its portal (signed protocol / results sheet) */}
      <h2 className="text-lg font-bold mt-7 mb-2 pb-1" style={{ color: "var(--green-dark)", borderBottom: "2px solid var(--red)" }}>
        {tr("case.labFiles")}
      </h2>
      <div className="card p-4">
        {(["protocol", "results"] as const).map((slot) => {
          const up = s.labUploads?.[code]?.[slot];
          if (!up) return null;
          return (
            <div key={slot} className="flex items-center gap-3 flex-wrap" style={{ padding: "4px 0" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--green-dark)" }}>
                📄 {tr(`casekind.${slot === "protocol" ? "receipt_confirmed" : "results_returned"}`)}
              </span>
              <span style={{ fontSize: 13 }}>{up.name}</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{fmtDate(up.uploadedAt.slice(0, 10))} · {(up.size / 1_000_000).toFixed(1)} MB</span>
              <a href={`/schemes/${id}/lab-uploads/${encodeURIComponent(code)}/${slot}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ fontSize: 12 }}>↗</a>
              <a href={`/schemes/${id}/lab-uploads/${encodeURIComponent(code)}/${slot}?download=1`} className="btn btn-sm" style={{ fontSize: 12 }}>{tr("case.download")}</a>
            </div>
          );
        })}
        {!s.labUploads?.[code]?.protocol && !s.labUploads?.[code]?.results && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>{tr("case.labFilesNone")}</p>
        )}
      </div>

      {/* results */}
      <h2 className="text-lg font-bold mt-7 mb-2 pb-1" style={{ color: "var(--green-dark)", borderBottom: "2px solid var(--red)" }}>
        {tr("case.results")}
      </h2>
      <div className="card p-4">
        <p className="text-sm">
          {reportedCount > 0
            ? <span><strong>{reportedCount}</strong> · {tr("case.resultsReported")}</span>
            : <span style={{ color: "var(--muted)" }}>{tr("case.resultsNone")}</span>}
        </p>
        <Link href={`/schemes/${id}/results`} className="btn btn-sm mt-2 inline-block" style={{ fontSize: 13 }}>
          {tr("case.viewCombined")} →
        </Link>
      </div>
    </div>
  );
}
