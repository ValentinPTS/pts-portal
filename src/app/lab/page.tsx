import Link from "next/link";
import { requireLab } from "@/lib/lab-auth";
import { listParticipationsForLab } from "@/lib/participants";
import { getSchemesByIds } from "@/lib/store";
import { metricsForScheme, scoreMetric } from "@/lib/scoring";
import { statusChip } from "@/lib/folders";
import { signOutLabAction } from "@/lib/auth-actions";
import { EmptyState } from "@/components/States";

export const dynamic = "force-dynamic";

type Verdict = "ok" | "warn" | "action";
const VCHIP: Record<Verdict, { label: string; bg: string; fg: string }> = {
  ok: { label: "Satisfactory", bg: "#e8f1ea", fg: "#2b6744" },
  warn: { label: "Warning", bg: "#faf2e0", fg: "#9a6b22" },
  action: { label: "Action", bg: "#f6e7e6", fg: "#9e2b2b" },
};
function rank(v: string | null): Verdict | null {
  if (v === "satisfactory" || v === "A") return "ok";
  if (v === "warning") return "warn";
  if (v === "action" || v === "N") return "action";
  return null;
}

export default async function LabDashboard() {
  const { lab } = await requireLab();
  const parts = await listParticipationsForLab(lab.id);
  const schemes = await getSchemesByIds(parts.map((p) => p.schemeId));
  const byId = new Map(schemes.map((s) => [s.id, s] as const));

  const items = parts
    .map((p) => {
      const scheme = byId.get(p.schemeId);
      if (!scheme) return null;
      const isCal = scheme.type === "C";
      const scores = metricsForScheme(scheme)
        .map((m) => {
          const row = scoreMetric(scheme, m.key).rows.find((r) => r.code === p.code);
          if (!row || row.verdict === null) return null;
          const val = isCal ? row.en : row.z ?? row.zeta;
          const sym = isCal ? "Eₙ" : row.z !== null ? "z" : "ζ";
          return { label: m.labelEn, text: val === null || val === undefined ? "—" : `${sym} = ${val.toFixed(2)}`, v: rank(row.verdict) };
        })
        .filter((x): x is { label: string; text: string; v: Verdict | null } => !!x);
      const rs = scores.map((s) => s.v);
      const overall: Verdict | null = rs.includes("action") ? "action" : rs.includes("warn") ? "warn" : rs.includes("ok") ? "ok" : null;
      const reported = scheme.status === "report" || scheme.status === "closed";
      return { p, scheme, scores, overall, reported, hasCert: !!scheme.certificates?.[p.code] };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const kv = (label: string, value: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="field-label" style={{ marginBottom: 0 }}>{label}</span>
      <span style={{ fontSize: 14, color: "var(--ink)" }}>{value || "—"}</span>
    </div>
  );

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      {/* header */}
      <header className="flex items-center gap-3 px-6 py-3 text-white" style={{ background: "var(--green-dark)" }}>
        <span className="font-bold text-lg tracking-tight">PTS Bulgaria</span>
        <span className="text-sm opacity-80">· Laboratory portal</span>
        <span className="ml-auto text-sm" style={{ fontWeight: 600 }}>{lab.name}</span>
        <form action={signOutLabAction}>
          <button type="submit" style={{ background: "rgba(255,255,255,0.18)", color: "#fff", borderRadius: 999, padding: "7px 14px", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>Sign out</button>
        </form>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
          <h1 className="section-title" style={{ fontSize: 30 }}>Welcome, {lab.name}</h1>
          <span className="chip" style={{ background: "var(--green-dark)" }}>Your code · {parts[0]?.code ?? "—"}</span>
        </div>

        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* my schemes */}
          <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h2 className="section-title" style={{ fontSize: 20, flex: 1 }}>My schemes</h2>
              <Link href="/apply" className="btn btn-primary btn-sm">+ Apply to an open scheme</Link>
            </div>

            {items.length === 0 && (
              <EmptyState
                title="No schemes yet"
                body="When you’re approved for a proficiency testing scheme it appears here, with your results and documents."
                action={<Link href="/apply" className="btn btn-primary btn-sm" style={{ marginTop: 4 }}>Browse open schemes ↗</Link>}
              />
            )}

            {items.map(({ p, scheme, scores, overall, reported, hasCert }) => {
              const st = statusChip(scheme.status);
              return (
                <div key={p.id} className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17 }}>{scheme.name?.trim() || scheme.titleEn || scheme.number}</div>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>{scheme.number}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, color: st.fg, background: st.bg }}>{st.label}</span>
                  </div>

                  <div style={{ background: "#f7faf8", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {overall ? (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>Your result</span>
                          <span className="chip" style={{ background: VCHIP[overall].bg, color: VCHIP[overall].fg }}>{VCHIP[overall].label}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                          {scores.map((s, i) => (
                            <span key={i} style={{ fontSize: 12.5, color: "var(--muted)" }}>
                              {s.label}: <b style={{ color: s.v ? VCHIP[s.v].fg : "var(--ink)" }}>{s.text}</b>
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>Awaiting results — reporting in progress.</span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {reported ? (
                      <a href={`/lab/doc/${scheme.id}/report?lang=bg`} target="_blank" rel="noreferrer" className="btn btn-sm">↓ Final report</a>
                    ) : null}
                    {hasCert ? (
                      <a href={`/lab/doc/${scheme.id}/certificate?lang=bg`} target="_blank" rel="noreferrer" className="btn btn-sm">↓ Certificate</a>
                    ) : null}
                    {!reported && !hasCert && <span style={{ fontSize: 13, color: "var(--muted)" }}>Documents available after reporting.</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* profile + account */}
          <div style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 className="section-title" style={{ fontSize: 18, flex: 1 }}>Profile</h2>
                <Link href="/lab/profile" className="btn btn-sm">Edit</Link>
              </div>
              {kv("Laboratory", lab.name)}
              {kv("Accreditation certificate", lab.accreditationCert)}
              {kv("Contact person", lab.contactPerson)}
              {kv("Email", lab.email)}
              {kv("Phone", lab.phone)}
              {kv("Registered address", lab.registeredAddress)}
            </section>
            <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 className="section-title" style={{ fontSize: 18 }}>Account &amp; security</h2>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>Two-factor authentication is optional for labs — you can enable it for extra protection.</p>
              <form action={signOutLabAction}><button type="submit" className="btn btn-sm">Sign out</button></form>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
