import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { getDoc } from "@/lib/documents";
import { listRevisions } from "@/lib/doc-revisions";
import { approveDocRevisionAction, restoreDocRevisionAction } from "@/lib/actions";
import { getCurrentRole } from "@/lib/roles";
import { getServerT } from "@/lib/i18n-server";

// Document version history (Phase RT5, §8.3). Lists every saved revision: who saved
// it and when, current vs superseded, and an approved marker. Managers can approve;
// writers can restore an older version (which itself becomes a new revision). Read
// access is requireStaff (the proxy gates the owner area); the write actions guard
// themselves (approve = manager, restore = writer), so auditors only see history.
export const dynamic = "force-dynamic";

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export default async function DocHistoryPage({
  params,
}: {
  params: Promise<{ id: string; doc: string }>;
}) {
  const { id, doc } = await params;
  const s = await getScheme(id);
  if (!s) notFound();
  const def = getDoc(doc);
  const { lang, tr } = await getServerT();
  const revisions = await listRevisions(id, doc);
  const role = await getCurrentRole();
  const isManager = role === "manager";
  const isWriter = role === "manager" || role === "staff";
  const docName = (lang === "bg" ? def?.nameBg : def?.nameEn) ?? doc;

  return (
    <div>
      <Link href={`/schemes/${id}/build/${encodeURIComponent(doc)}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {tr("hist.back")}
      </Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        {tr("hist.title")} <span className="text-base font-normal" style={{ color: "var(--muted)" }}>· {docName}</span>
      </h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 720 }}>{tr("hist.subtitle")}</p>

      <div className="card mt-4 overflow-hidden">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>
              <th className="text-left p-2" style={{ width: 90 }}>{tr("hist.version")}</th>
              <th className="text-left p-2" style={{ width: 170 }}>{tr("hist.when")}</th>
              <th className="text-left p-2">{tr("hist.who")}</th>
              <th className="text-left p-2"></th>
            </tr>
          </thead>
          <tbody>
            {revisions.length === 0 && (
              <tr><td colSpan={4} className="p-3" style={{ color: "var(--muted)" }}>{tr("hist.empty")}</td></tr>
            )}
            {revisions.map((r, i) => {
              const current = i === 0;
              return (
                <tr key={r.id} style={{ borderTop: "1px solid var(--line)", verticalAlign: "top" }}>
                  <td className="p-2">
                    <span style={{ fontWeight: 700 }}>v{r.version}</span>
                    <div style={{ marginTop: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: current ? "var(--green-light)" : "var(--muted)", borderRadius: 999, padding: "1px 7px" }}>
                        {current ? tr("hist.current") : tr("hist.superseded")}
                      </span>
                    </div>
                  </td>
                  <td className="p-2" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{fmt(r.savedAt)}</td>
                  <td className="p-2">
                    {r.savedBy || "—"}
                    {r.note && <div style={{ color: "var(--muted)", fontSize: 12 }}>{r.note}</div>}
                    {r.approved && (
                      <div style={{ marginTop: 3, fontSize: 11, color: "var(--green-dark)", fontWeight: 700 }}>
                        ✓ {tr("hist.approved")}{r.approvedBy ? ` · ${tr("hist.approvedBy")}: ${r.approvedBy}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <a href={`/schemes/${id}/build/${encodeURIComponent(doc)}/print?lang=${lang}&rev=${r.id}`} target="_blank" rel="noopener" className="btn btn-sm" style={{ fontSize: 11, padding: "4px 9px" }}>{tr("hist.preview")}</a>
                      {isManager && !r.approved && (
                        <form action={approveDocRevisionAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="schemeId" value={id} />
                          <input type="hidden" name="docKey" value={doc} />
                          <button type="submit" className="btn btn-sm" style={{ fontSize: 11, padding: "4px 9px", borderColor: "var(--green-dark)", color: "var(--green-dark)" }}>{tr("hist.approve")}</button>
                        </form>
                      )}
                      {isWriter && !current && (
                        <form action={restoreDocRevisionAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="schemeId" value={id} />
                          <input type="hidden" name="docKey" value={doc} />
                          <button type="submit" className="btn btn-sm" style={{ fontSize: 11, padding: "4px 9px" }}>{tr("hist.restore")}</button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
