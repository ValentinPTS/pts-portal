import Link from "next/link";
import { requireLab } from "@/lib/lab-auth";
import { updateLabProfileAction } from "@/lib/actions";
import { getServerT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

// A lab edits its own profile. Email (the login) is shown read-only.
export default async function LabProfilePage() {
  const { lab } = await requireLab();
  const { tr } = await getServerT();
  const field = (name: string, label: string, value: string) => (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span className="field-label">{label}</span>
      <input className="input" name={name} defaultValue={value} />
    </label>
  );
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <header className="flex items-center gap-3 px-6 py-3 text-white" style={{ background: "var(--green-dark)" }}>
        <span className="font-bold text-lg tracking-tight">PTS Bulgaria</span>
        <span className="text-sm opacity-80">· {tr("header.labPortal")}</span>
      </header>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px" }}>
        <Link href="/lab" className="text-sm" style={{ color: "var(--muted)" }}>← {tr("lab.backToDashboard")}</Link>
        <h1 className="section-title" style={{ fontSize: 26, margin: "6px 0 16px" }}>{tr("lab.editProfile")}</h1>
        <form action={updateLabProfileAction} className="card" style={{ padding: 24 }}>
          <label style={{ display: "block", marginBottom: 14 }}>
            <span className="field-label">{tr("lab.emailLogin")}</span>
            <input className="input" value={lab.email} disabled style={{ background: "var(--bg)", color: "var(--muted)" }} />
          </label>
          {field("name", tr("lab.field.labName"), lab.name)}
          {field("accreditationCert", tr("lab.field.accreditationCert"), lab.accreditationCert)}
          {field("contactPerson", tr("lab.field.contactPerson"), lab.contactPerson)}
          {field("phone", tr("lab.field.phone"), lab.phone)}
          {field("registeredAddress", tr("lab.field.registeredAddress"), lab.registeredAddress)}
          {field("eik", "ЕИК", lab.eik)}
          {field("vat", "ДДС №", lab.vat)}
          {field("mol", "МОЛ", lab.mol)}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary">{tr("common.saveChanges")}</button>
            <Link href="/lab" className="btn">{tr("common.cancel")}</Link>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
            {tr("lab.emailNote")}
          </p>
        </form>
      </main>
    </div>
  );
}
