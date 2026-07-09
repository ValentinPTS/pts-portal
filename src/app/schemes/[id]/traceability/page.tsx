import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { listCaseEvents } from "@/lib/case-events";
import { getDoc } from "@/lib/documents";
import { getServerT } from "@/lib/i18n-server";
import { canRevealNames, getCurrentRole } from "@/lib/roles";
import type { CaseEvent, CaseEventKind } from "@/lib/types";

export const dynamic = "force-dynamic";

// The traceability matrix: one row per participant, one column per milestone,
// every date read from the participant's case-file timeline (case_events). The
// FIRST missing milestone in a row is highlighted with whose move it is; a cell
// click jumps to the case file with the step pre-selected. Names masked per §4.2.
const MILESTONES: { kind: CaseEventKind; side: "pts" | "lab" }[] = [
  { kind: "docs_sent", side: "pts" },
  { kind: "items_dispatched", side: "pts" },
  { kind: "receipt_confirmed", side: "lab" },
  { kind: "results_returned", side: "lab" },
  { kind: "scored", side: "pts" },
  { kind: "report_issued", side: "pts" },
];

const ddmm = (iso: string) => (iso?.length >= 10 ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : iso || "");

export default async function TraceabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getScheme(id);
  if (!s) notFound();
  const [participants, events] = await Promise.all([listParticipants(id), listCaseEvents(id)]);
  const { lang, tr } = await getServerT();
  const reveal = canRevealNames(await getCurrentRole());

  // events arrive newest-first → the first match per (code, kind) is the latest
  const latest = new Map<string, CaseEvent>();
  for (const e of events) {
    const k = `${e.code}|${e.kind}`;
    if (!latest.has(k)) latest.set(k, e);
  }

  const docName = (key?: string) => {
    if (!key) return "";
    const d = getDoc(key);
    return d ? (lang === "bg" ? d.nameBg : d.nameEn) : key;
  };

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {s.number}
      </Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        {tr("trace.title")}{" "}
        <span className="text-base font-normal" style={{ color: "var(--muted)" }}>· {participants.length}</span>
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>{tr("trace.subtitle")}</p>

      <div className="card mt-4" style={{ overflowX: "auto" }}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 860 }}>
          <thead>
            <tr style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>
              <th className="text-left p-2">{tr("col.code")}</th>
              <th className="text-left p-2">{tr("col.laboratory")}</th>
              {MILESTONES.map((m) => (
                <th key={m.kind} className="text-center p-2" style={{ fontSize: 12, lineHeight: 1.25 }}>
                  {tr(`casekind.${m.kind}`)}
                  <div style={{ fontWeight: 400, color: "var(--muted)", fontSize: 10 }}>
                    {m.side === "pts" ? "PTS →" : "← lab"}
                  </div>
                </th>
              ))}
              <th className="text-left p-2" style={{ width: 90 }}>{tr("trace.progress")}</th>
            </tr>
          </thead>
          <tbody>
            {participants.length === 0 && (
              <tr><td colSpan={MILESTONES.length + 3} className="p-3" style={{ color: "var(--muted)" }}>{tr("part.noneYet")}</td></tr>
            )}
            {participants.map((p) => {
              const cells = MILESTONES.map((m) => latest.get(`${p.code}|${m.kind}`));
              const done = cells.filter(Boolean).length;
              const nextIdx = cells.findIndex((c) => !c); // first missing milestone
              const caseHref = (kind?: CaseEventKind) =>
                `/schemes/${id}/participants/${encodeURIComponent(p.code)}?from=trace${kind ? `&kind=${kind}` : ""}#add`;
              return (
                <tr key={p.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="p-2 font-mono font-bold">
                    <Link href={caseHref()} style={{ color: "var(--green-dark)" }}>{p.code}</Link>
                  </td>
                  <td className="p-2" style={{ whiteSpace: "nowrap", maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {reveal ? p.labName : <span style={{ color: "var(--muted)", fontStyle: "italic" }}>{tr("part.hidden")}</span>}
                  </td>
                  {MILESTONES.map((m, i) => {
                    const e = cells[i];
                    // a file the lab itself uploaded for this milestone (📎 opens it)
                    const slot = m.kind === "receipt_confirmed" ? "protocol" : m.kind === "results_returned" ? "results" : null;
                    const up = slot ? s.labUploads?.[p.code]?.[slot] : undefined;
                    if (e) {
                      const tip = [docName(e.docKey), e.ref, e.note, e.recordedBy, e.source === "auto" ? "auto" : ""]
                        .filter(Boolean).join(" · ");
                      return (
                        <td key={m.kind} className="p-1 text-center" style={{ whiteSpace: "nowrap" }}>
                          <Link href={caseHref()} title={tip} className="no-underline"
                            style={{ display: "inline-block", fontSize: 11.5, fontWeight: 700, padding: "2px 8px", borderRadius: 7, color: "#456b2c", background: "#e3eeda", border: "1px solid #cbd9be", whiteSpace: "nowrap" }}>
                            ✓ {ddmm(e.at)}
                          </Link>
                          {up && (
                            <a href={`/schemes/${id}/lab-uploads/${encodeURIComponent(p.code)}/${slot}`} target="_blank" rel="noreferrer"
                              title={up.name} style={{ marginLeft: 4, textDecoration: "none", fontSize: 13 }}>📎</a>
                          )}
                        </td>
                      );
                    }
                    if (i === nextIdx) {
                      return (
                        <td key={m.kind} className="p-1 text-center">
                          <Link href={caseHref(m.kind)} className="no-underline"
                            style={{ display: "inline-block", fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 7, color: "#9a6b22", background: "#faf2e0", border: "1px dashed #d9b46a", whiteSpace: "nowrap" }}>
                            {m.side === "pts" ? tr("trace.ourMove") : tr("trace.waitingLab")}
                          </Link>
                        </td>
                      );
                    }
                    return (
                      <td key={m.kind} className="p-1 text-center">
                        <Link href={caseHref(m.kind)} className="no-underline" style={{ color: "var(--line)", fontWeight: 700 }}>·</Link>
                      </td>
                    );
                  })}
                  <td className="p-2">
                    <div title={`${done}/${MILESTONES.length}`} style={{ height: 5, borderRadius: 99, background: "#eef1ee", position: "relative", minWidth: 60 }}>
                      <div style={{ position: "absolute", inset: 0, width: `${(done / MILESTONES.length) * 100}%`, borderRadius: 99, background: "var(--green-dark)" }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>{tr("trace.autoNote")}</p>
    </div>
  );
}
