import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { addParticipantAction, inviteLabAction, updateParticipantAction } from "@/lib/actions";
import { getServerT } from "@/lib/i18n-server";
import { canRevealNames, getCurrentRole } from "@/lib/roles";

const inputCls = "w-full rounded px-2 py-1 text-sm";
const inputStyle = { border: "1px solid var(--line)", background: "#fff" } as const;

// Courier options exactly as they appear on the owner's F 7.2.1-4 workbook.
const COURIERS = ["Спиди БГ", "Спиди EN", "Поща/Fedex"];

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
  // RT1 — only a manager sees the real names behind the codes (§4.2). Staff and
  // auditors see codes only. (Build mode = manager, so this is a no-op until login
  // is turned on.) Finer write-gating of the add form is a later phase.
  const reveal = canRevealNames(await getCurrentRole());
  const hidden = <span style={{ color: "var(--muted)", fontStyle: "italic" }}>{tr("part.hidden")}</span>;

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
      <p className="text-sm" style={{ color: "var(--muted)" }}>{reveal ? tr("part.subtitle") : tr("part.confBanner")}</p>

      {/* list */}
      <div className="card mt-4 overflow-hidden">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>
              <th className="text-left p-2">{tr("col.code")}</th>
              <th className="text-left p-2">{tr("col.laboratory")}</th>
              <th className="text-left p-2">{tr("col.country")}</th>
              <th className="text-left p-2">{tr("col.sample")}</th>
              <th className="text-left p-2">{tr("col.courier")}</th>
              <th className="text-left p-2">{tr("col.status")}</th>
              <th className="text-left p-2">{tr("part.portal")}</th>
            </tr>
          </thead>
          <tbody>
            {participants.length === 0 && (
              <tr><td colSpan={7} className="p-3" style={{ color: "var(--muted)" }}>{tr("part.noneYet")}</td></tr>
            )}
            {participants.map((p) => (
              <ParticipantRows key={p.id} p={p} schemeId={id} reveal={reveal} hidden={hidden} tr={tr}
                parameters={s.parameters.map((x, i) => ({ i, label: x.characteristicBg || x.characteristicEn }))} />
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
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.courier")}</span>
          <select name="courier" className={inputCls} style={inputStyle} defaultValue="">
            <option value=""></option>
            {COURIERS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.sampleCode")}</span>
          <input name="sampleCode" className={inputCls} style={inputStyle} /></label>
        <div className="flex items-end">
          <button type="submit" className="btn btn-primary">{tr("part.addButton")}</button>
        </div>
      </form>
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>{tr("part.footnote")}</p>
    </div>
  );
}

// One participant = two <tr>s: the data row, and a collapsed edit row (native
// <details>, no client JS) holding the full edit form — courier, sample code and
// the F 7.2.1-5 characteristics live here so 30 labs can be filled in quickly.
function ParticipantRows({ p, schemeId, reveal, hidden, tr, parameters }: {
  p: Awaited<ReturnType<typeof listParticipants>>[number];
  schemeId: string;
  reveal: boolean;
  hidden: React.ReactNode;
  tr: (key: string) => string;
  parameters: { i: number; label: string }[];
}) {
  const all = !p.characteristics?.length; // absent/empty = registered for everything
  return (
    <>
      <tr style={{ borderTop: "1px solid var(--line)" }}>
        <td className="p-2 font-mono font-bold">
          <Link href={`/schemes/${schemeId}/participants/${encodeURIComponent(p.code)}`} style={{ color: "var(--green-dark)" }}>{p.code}</Link>
        </td>
        <td className="p-2">{reveal ? p.labName : hidden}</td>
        <td className="p-2">{p.country}</td>
        <td className="p-2 font-mono">{p.sampleCode || <span style={{ color: "var(--muted)" }}>—</span>}</td>
        <td className="p-2">{p.courier || <span style={{ color: "var(--muted)" }}>—</span>}</td>
        <td className="p-2"><span style={{ color: STATUS_COLOR[p.status] ?? "var(--muted)", fontWeight: 700 }}>● {tr(`pstatus.${p.status}`)}</span></td>
        <td className="p-2">
          <div className="flex items-center gap-3">
            {p.labId ? (
              <form action={inviteLabAction}>
                <input type="hidden" name="labId" value={p.labId} />
                <input type="hidden" name="returnTo" value={`/schemes/${schemeId}/participants`} />
                <button type="submit" className="btn btn-sm" style={{ fontSize: 12, padding: "5px 10px" }}>{tr("part.inviteToPortal")}</button>
              </form>
            ) : (
              <span style={{ color: "var(--muted)" }}>—</span>
            )}
            <Link href={`/schemes/${schemeId}/participants/${encodeURIComponent(p.code)}`} style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{tr("part.openCase")} →</Link>
          </div>
        </td>
      </tr>
      {reveal && (
        <tr>
          <td colSpan={7} style={{ padding: 0 }}>
            <details>
              <summary className="text-xs px-2 py-1" style={{ color: "var(--muted)", cursor: "pointer", listStyle: "none" }}>{tr("part.edit")}</summary>
              <form action={updateParticipantAction} className="grid gap-3 p-3" style={{ gridTemplateColumns: "2fr 1fr 1fr", background: "var(--green-soft)", borderTop: "1px solid var(--line)" }}>
                <input type="hidden" name="schemeId" value={schemeId} />
                <input type="hidden" name="id" value={p.id} />
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.labName")}</span>
                  <input name="labName" required defaultValue={p.labName} className={inputCls} style={inputStyle} /></label>
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("col.country")}</span>
                  <input name="country" defaultValue={p.country} className={inputCls} style={inputStyle} /></label>
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.contactPerson")}</span>
                  <input name="contact" defaultValue={p.contact} className={inputCls} style={inputStyle} /></label>
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.phone")}</span>
                  <input name="phone" defaultValue={p.phone} className={inputCls} style={inputStyle} /></label>
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.email")}</span>
                  <input name="email" type="email" defaultValue={p.email} className={inputCls} style={inputStyle} /></label>
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.deliveryAddress")}</span>
                  <input name="deliveryAddress" defaultValue={p.deliveryAddress} className={inputCls} style={inputStyle} /></label>
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.participations")}</span>
                  <input name="participations" type="number" min="1" defaultValue={String(p.participations)} className={inputCls} style={inputStyle} /></label>
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.courier")}</span>
                  <select name="courier" defaultValue={p.courier ?? ""} className={inputCls} style={inputStyle}>
                    <option value=""></option>
                    {COURIERS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select></label>
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.sampleCode")}</span>
                  <input name="sampleCode" defaultValue={p.sampleCode ?? ""} className={inputCls} style={inputStyle} /></label>
                {parameters.length > 0 && (
                  <fieldset style={{ gridColumn: "1 / -1" }}>
                    <span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>{tr("part.characteristics")}</span>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {parameters.map(({ i, label }) => (
                        <label key={i} className="text-sm flex items-center gap-1.5">
                          <input type="checkbox" name="characteristics" value={i}
                            defaultChecked={all || p.characteristics!.includes(i)} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div><button type="submit" className="btn btn-primary btn-sm">{tr("part.save")}</button></div>
              </form>
            </details>
          </td>
        </tr>
      )}
    </>
  );
}
