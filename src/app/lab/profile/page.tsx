import Link from "next/link";
import { requireLab } from "@/lib/lab-auth";
import { updateLabProfileAction } from "@/lib/actions";
import { getServerT } from "@/lib/i18n-server";
import PasswordForm from "@/components/PasswordForm";

export const dynamic = "force-dynamic";

// A lab edits its own profile. Email (the login) is shown read-only.
export default async function LabProfilePage({ searchParams }: { searchParams: Promise<{ review?: string; err?: string }> }) {
  const { lab, userId } = await requireLab();
  // after accepting an invitation: review the data PTS entered (the step 4.4 uses)
  const sp = await searchParams;
  const review = !!sp.review;
  const err = sp.err === "eik" || sp.err === "phone" ? sp.err : null;
  const { tr } = await getServerT();
  const field = (name: string, label: string, value: string) => (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span className="field-label">{label}</span>
      <input className="input" name={name} defaultValue={value} />
    </label>
  );
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <header className="flex items-center gap-3 px-6 py-3" style={{ background: "#fff", borderBottom: "1px solid var(--line)", color: "var(--ink)", flexWrap: "wrap" }}>
        <span className="font-bold text-lg tracking-tight"><span style={{ color: "var(--green-dark)" }}>PTS</span> Bulgaria</span>
        <span className="text-sm" style={{ color: "var(--muted)" }}>· {tr("header.labPortal")}</span>
      </header>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px" }}>
        <Link href="/lab" className="text-sm" style={{ color: "var(--muted)" }}>← {tr("lab.backToDashboard")}</Link>
        <h1 className="section-title" style={{ fontSize: 26, margin: "6px 0 16px" }}>{tr("lab.editProfile")}</h1>
        {review && (
          <div role="note" data-review-data className="card" style={{ padding: 14, marginBottom: 14, background: "var(--green-soft)" }}>
            {tr("lab.reviewData")}
          </div>
        )}
        {err && (
          <div role="alert" data-profile-error={err} className="card" style={{ padding: 14, marginBottom: 14, background: "#fbeeee", color: "#8f2f2f" }}>
            {err === "eik"
              ? "Не е записано: ЕИК не е валиден (9 или 13 цифри, контролна цифра). · Not saved: the ЕИК is not valid (9 or 13 digits, check digit)."
              : "Не е записано: телефонът не се разчита (цифри, интервали, + ( ) - . /). · Not saved: the phone does not read (digits, spaces, + ( ) - . /)."}
          </div>
        )}
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
        {/* part 1.5: the laboratory's own password (not for a development persona — no login behind it) */}
        {userId !== "dev-persona" && (
          <div className="card" style={{ padding: 24, marginTop: 16 }} data-change-password>
            <h2 className="field-label" style={{ fontSize: 15 }}>{tr("account.changePassword")}</h2>
            <PasswordForm mode="change" />
          </div>
        )}
      </main>
    </div>
  );
}
