import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { addParticipantAction, inviteLabAction } from "@/lib/actions";
import { getServerT } from "@/lib/i18n-server";

const inputCls = "w-full rounded px-2 py-1 text-sm";
const inputStyle = { border: "1px solid var(--line)", background: "#fff" } as const;

const STATUS_COLOR: Record<string, string> = {
  applied: "var(--muted)", approved: "var(--success)", invoiced: "var(--info)",
  paid: "var(--info)", dispatched: "var(--blue)", received: "var(--teal)",
  submitted: "var(--amber)", scored: "var(--green-dark)",
};

export default async function ParticipantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getScheme(id);
  if (!s) notFound();
  const participants = await listParticipants(id);
  const { tr } = await getServerT();

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {s.number}
      </Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        {tr("scheme.participants")}{" "}
        <span className="text-base font-normal" style={{ color: "var(--muted)" }}>
          · {participants.length}
        </span>
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>{tr("part.subtitle")}</p>

      {/* list */}
      <div className="card mt-4 overflow-hidden">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>
              <th className="text-left p-2">{tr("col.code")}</th>
              <th className="text-left p-2">{tr("col.laboratory")}</th>
              <th className="text-left p-2">{tr("col.country")}</th>
              <th className="text-left p-2">{tr("col.contact")}</th>
              <th className="text-left p-2">{tr("col.status")}</th>
              <th className="text-left p-2">{tr("part.portal")}</th>
            </tr>
          </thead>
          <tbody>
            {participants.length === 0 && (
              <tr><td colSpan={6} className="p-3" style={{ color: "var(--muted)" }}>{tr("part.noneYet")}</td></tr>
            )}
            {participants.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td className="p-2 font-mono font-bold" style={{ color: "var(--green-dark)" }}>{p.code}</td>
                <td className="p-2">{p.labName}</td>
                <td className="p-2">{p.country}</td>
                <td className="p-2" style={{ color: "var(--muted)" }}>{p.contact || p.email}</td>
                <td className="p-2"><span style={{ color: STATUS_COLOR[p.status] ?? "var(--muted)", fontWeight: 700 }}>● {tr(`pstatus.${p.status}`)}</span></td>
                <td className="p-2">
                  {p.labId ? (
                    <form action={inviteLabAction}>
                      <input type="hidden" name="labId" value={p.labId} />
                      <input type="hidden" name="returnTo" value={`/schemes/${id}/participants`} />
                      <button type="submit" className="btn btn-sm" style={{ fontSize: 12, padding: "5px 10px" }}>{tr("part.inviteToPortal")}</button>
                    </form>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* add form */}
      <h2 className="text-lg font-bold mt-7 mb-2 pb-1" style={{ color: "var(--green-dark)", borderBottom: "2px solid var(--red)" }}>
        {tr("part.addTitle")}
      </h2>
      <form action={addParticipantAction} className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <input type="hidden" name="schemeId" value={s.id} />
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.labName")}</span>
          <input name="labName" required className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("col.country")}</span>
          <input name="country" className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.contactPerson")}</span>
          <input name="contact" className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.phone")}</span>
          <input name="phone" className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.email")}</span>
          <input name="email" type="email" className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.deliveryAddress")}</span>
          <input name="deliveryAddress" className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.participations")}</span>
          <input name="participations" type="number" min="1" defaultValue="1" className={inputCls} style={inputStyle} /></label>
        <div className="flex items-end">
          <button type="submit" className="btn btn-primary">{tr("part.addButton")}</button>
        </div>
      </form>
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>{tr("part.footnote")}</p>
    </div>
  );
}
