import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { listApplications } from "@/lib/applications";
import { approveApplicationAction, rejectApplicationAction } from "@/lib/actions";
import { EmptyState } from "@/components/States";

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
        Applications{" "}
        <span className="text-base font-normal" style={{ color: "var(--muted)" }}>
          · {pending.length} pending / {apps.length} total
        </span>
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Self-service applications (заявки) from the public form. Approving one creates a participant with an auto-assigned code.
      </p>

      {apps.length === 0 && (
        <div className="mt-5">
          <EmptyState
            title="No applications yet"
            body="Labs submit a заявка from the public application form; approved ones become participants here."
            action={<Link href={`/apply/${id}`} className="btn btn-primary btn-sm" style={{ marginTop: 4 }}>Open the application form ↗</Link>}
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
                <span style={{ color: STATUS_COLOR[a.status], fontWeight: 700, marginLeft: "auto" }}>● {a.status}</span>
              </div>
              <div className="grid gap-x-6 gap-y-1 mt-2 text-sm" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div><b>Manager:</b> {a.manager || "—"}</div>
                <div><b>Contact:</b> {a.contactPerson || "—"}</div>
                <div><b>E-mail:</b> {a.email || "—"}</div>
                <div><b>Phone:</b> {a.phone || "—"}</div>
                <div><b>Accreditation:</b> {a.accreditationCert || "—"}</div>
                <div><b>Delivery:</b> {a.deliveryAddress || "—"} {a.postalCode}</div>
                <div><b>Company:</b> {a.companyName || "—"}</div>
                <div><b>ЕИК / VAT:</b> {a.eik || "—"} / {a.vat || "—"}</div>
                <div><b>МОЛ:</b> {a.mol || "—"}</div>
                <div><b>Reg. address:</b> {a.registeredAddress || "—"}</div>
              </div>
              <div className="mt-2 text-sm">
                <b>Requested characteristics:</b>{" "}
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
                    <button type="submit" className="btn btn-primary">✓ Approve → create participant</button>
                  </form>
                  <form action={rejectApplicationAction}>
                    <input type="hidden" name="schemeId" value={s.id} />
                    <input type="hidden" name="appId" value={a.id} />
                    <button type="submit" className="btn" style={{ borderColor: "var(--red)", color: "var(--red)" }}>Reject</button>
                  </form>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
