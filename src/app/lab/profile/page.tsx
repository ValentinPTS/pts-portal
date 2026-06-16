import Link from "next/link";
import { requireLab } from "@/lib/lab-auth";
import { updateLabProfileAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

// A lab edits its own profile. Email (the login) is shown read-only.
export default async function LabProfilePage() {
  const { lab } = await requireLab();
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
        <span className="text-sm opacity-80">· Laboratory portal</span>
      </header>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px" }}>
        <Link href="/lab" className="text-sm" style={{ color: "var(--muted)" }}>← Back to dashboard</Link>
        <h1 className="section-title" style={{ fontSize: 26, margin: "6px 0 16px" }}>Edit profile</h1>
        <form action={updateLabProfileAction} className="card" style={{ padding: 24 }}>
          <label style={{ display: "block", marginBottom: 14 }}>
            <span className="field-label">Email (login)</span>
            <input className="input" value={lab.email} disabled style={{ background: "var(--bg)", color: "var(--muted)" }} />
          </label>
          {field("name", "Laboratory name", lab.name)}
          {field("accreditationCert", "Accreditation certificate", lab.accreditationCert)}
          {field("contactPerson", "Contact person", lab.contactPerson)}
          {field("phone", "Phone", lab.phone)}
          {field("registeredAddress", "Registered address", lab.registeredAddress)}
          {field("eik", "ЕИК", lab.eik)}
          {field("vat", "ДДС №", lab.vat)}
          {field("mol", "МОЛ", lab.mol)}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary">Save changes</button>
            <Link href="/lab" className="btn">Cancel</Link>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
            Your email is your login and can’t be changed here — contact PTS Bulgaria to update it.
          </p>
        </form>
      </main>
    </div>
  );
}
