import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { listApplications } from "@/lib/applications";
import { approveApplicationAction, rejectApplicationAction } from "@/lib/actions";
import { EmptyState } from "@/components/States";
import { getServerT } from "@/lib/i18n-server";

const STATUS_COLOR: Record<string, string> = {
  pending: "var(--amber)",
  approved: "var(--success)",
  rejected: "var(--red)",
};

export default async function ApplicationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getScheme(id);
  if (!s) notFound();
  const apps = await listApplications(id);
  const pending = apps.filter((a) => a.status === "pending");
  const { tr } = await getServerT();

  const charName = (i: string) => {
    const p = s.parameters[Number(i)];
    return p ? p.characteristicEn : `#${i}`;
  };

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {s.number}
      </Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        {tr("apps.title")}{" "}
        <span className="text-base font-normal" style={{ color: "var(--muted)" }}>
          · {pending.length} {tr("apps.pending")} / {apps.length} {tr("apps.total")}
        </span>
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>{tr("apps.subtitle")}</p>

      {apps.length === 0 && (
        <div className="mt-5">
          <EmptyState
            title={tr("apps.noneTitle")}
            body={tr("apps.noneBody")}
            action={<Link href={`/apply/${id}`} className="btn btn-primary btn-sm" style={{ marginTop: 4 }}>{tr("apps.openForm")}</Link>}
          />
        </div>
      )}

      <div className="mt-5 grid gap-4">
        {[...apps]
          .sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1))
          .map((a) => (
            <div key={a.id} className="card p-4" style={{ borderLeft: `4px solid ${STATUS_COLOR[a.status] ?? "var(--line)"}` }}>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg" style={{ color: "var(--green-dark)" }}>{a.labName}</span>
                <span style={{ color: STATUS_COLOR[a.status], fontWeight: 700, marginLeft: "auto" }}>● {tr(`appstatus.${a.status}`)}</span>
              </div>
              <div className="grid gap-x-6 gap-y-1 mt-2 text-sm" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div><b>{tr("apps.manager")}:</b> {a.manager || "—"}</div>
                <div><b>{tr("col.contact")}:</b> {a.contactPerson || "—"}</div>
                <div><b>{tr("part.email")}:</b> {a.email || "—"}</div>
                <div><b>{tr("part.phone")}:</b> {a.phone || "—"}</div>
                <div><b>{tr("apps.accreditation")}:</b> {a.accreditationCert || "—"}</div>
                <div><b>{tr("apps.delivery")}:</b> {a.deliveryAddress || "—"} {a.postalCode}</div>
                <div><b>{tr("apps.company")}:</b> {a.companyName || "—"}</div>
                <div><b>ЕИК / VAT:</b> {a.eik || "—"} / {a.vat || "—"}</div>
                <div><b>МОЛ:</b> {a.mol || "—"}</div>
                <div><b>{tr("apps.regAddress")}:</b> {a.registeredAddress || "—"}</div>
              </div>
              <div className="mt-2 text-sm">
                <b>{tr("apps.requestedChars")}</b>{" "}
                {Object.keys(a.selections).length === 0
                  ? "—"
                  : Object.entries(a.selections)
                      .map(([i, n]) => `${charName(i)} ×${n}`)
                      .join(" · ")}
              </div>

              {a.status === "pending" && (
                <div className="flex gap-2 mt-3">
                  <form action={approveApplicationAction}>
                    <input type="hidden" name="schemeId" value={s.id} />
                    <input type="hidden" name="appId" value={a.id} />
                    <button type="submit" className="btn btn-primary">{tr("apps.approve")}</button>
                  </form>
                  <form action={rejectApplicationAction}>
                    <input type="hidden" name="schemeId" value={s.id} />
                    <input type="hidden" name="appId" value={a.id} />
                    <button type="submit" className="btn" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{tr("apps.reject")}</button>
                  </form>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
