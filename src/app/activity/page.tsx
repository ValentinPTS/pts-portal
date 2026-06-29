import Link from "next/link";
import { listActivity, listActivityActions } from "@/lib/activity";
import { listSchemeSummaries } from "@/lib/store";
import { requireStaff } from "@/lib/roles";
import { getServerT } from "@/lib/i18n-server";

// Activity-log viewer (Phase RT2). Visible to internal staff (manager / staff /
// auditor) — labs are bounced by requireStaff(). Read-only; the log is append-only.
// Filter by scheme and/or action via GET query params. No real names appear here.
export const dynamic = "force-dynamic";

const ROLE_COLOR: Record<string, string> = {
  manager: "var(--green-dark)", staff: "var(--ink)", auditor: "var(--amber)",
  lab: "var(--muted)", none: "var(--muted)",
};

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ scheme?: string; action?: string }>;
}) {
  await requireStaff();
  const { tr } = await getServerT();
  const sp = await searchParams;
  const schemeId = (sp.scheme ?? "").trim() || undefined;
  const action = (sp.action ?? "").trim() || undefined;

  const [events, actions, schemes] = await Promise.all([
    listActivity({ schemeId, action, limit: 300 }),
    listActivityActions(),
    listSchemeSummaries(),
  ]);

  const selStyle = { border: "1px solid var(--line)", borderRadius: 8, padding: "6px 9px", fontSize: 13, background: "#fff" } as const;

  return (
    <div>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{tr("activity.title")}</h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 720 }}>{tr("activity.subtitle")}</p>

      {/* filters (native GET form — no client JS needed) */}
      <form method="get" className="flex flex-wrap items-end gap-3 mt-4">
        <label className="block">
          <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("activity.filter.scheme")}</span>
          <select name="scheme" defaultValue={schemeId ?? ""} style={selStyle}>
            <option value="">{tr("activity.filter.all")}</option>
            {schemes.map((s) => <option key={s.id} value={s.id}>{s.number}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("activity.filter.action")}</span>
          <select name="action" defaultValue={action ?? ""} style={selStyle}>
            <option value="">{tr("activity.filter.all")}</option>
            {actions.map((a) => <option key={a} value={a}>{tr(`act.${a}`)}</option>)}
          </select>
        </label>
        <button type="submit" className="btn btn-primary">{tr("activity.apply")}</button>
        {(schemeId || action) && <Link href="/activity" className="btn">{tr("activity.clear")}</Link>}
      </form>

      <div className="card mt-4 overflow-hidden">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>
              <th className="text-left p-2" style={{ width: 170 }}>{tr("activity.col.when")}</th>
              <th className="text-left p-2" style={{ width: 220 }}>{tr("activity.col.who")}</th>
              <th className="text-left p-2">{tr("activity.col.what")}</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr><td colSpan={3} className="p-3" style={{ color: "var(--muted)" }}>{tr("activity.empty")}</td></tr>
            )}
            {events.map((e) => (
              <tr key={e.id} style={{ borderTop: "1px solid var(--line)", verticalAlign: "top" }}>
                <td className="p-2" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{fmt(e.at)}</td>
                <td className="p-2">
                  <div>{e.actorEmail}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: ROLE_COLOR[e.actorRole] ?? "var(--muted)" }}>{e.actorRole}</div>
                </td>
                <td className="p-2">
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "var(--green-light)", borderRadius: 999, padding: "2px 8px", marginRight: 8 }}>{tr(`act.${e.action}`)}</span>
                  {e.summary}
                  {e.schemeId && (
                    <Link href={`/schemes/${e.schemeId}`} className="ml-2" style={{ fontSize: 12, color: "var(--muted)" }}>· {e.schemeId}</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
