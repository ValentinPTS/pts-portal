import Link from "next/link";
import { requireLab } from "@/lib/lab-auth";
import { listParticipationsForLab } from "@/lib/participants";
import { getSchemesByIds, listSchemes } from "@/lib/store";
import { metricsForScheme, scoreMetric } from "@/lib/scoring";
import { statusChip } from "@/lib/folders";
import { signOutLabAction } from "@/lib/auth-actions";
import { EmptyState } from "@/components/States";
import LanguageToggle from "@/components/LanguageToggle";
import { getServerT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

type Verdict = "ok" | "warn" | "action";
const VCHIP: Record<Verdict, { bg: string; fg: string }> = {
  ok: { bg: "#e3eeda", fg: "#456b2c" },
  warn: { bg: "#faf2e0", fg: "#9a6b22" },
  action: { bg: "#fbeae1", fg: "#cf4911" },
};
function rank(v: string | null): Verdict | null {
  if (v === "satisfactory" || v === "A") return "ok";
  if (v === "warning") return "warn";
  if (v === "action" || v === "N") return "action";
  return null;
}

// Map the participant's status (+ the scheme's phase) to one of 5 lab-facing
// stages: Applied → Approved → Samples → Results → Report.
const STAGE_KEYS = ["stage.applied", "stage.approved", "stage.samples", "stage.results", "stage.report"];
function stageIndex(pStatus: string, sStatus: string): number {
  if (sStatus === "closed" || sStatus === "report") return 4;
  switch (pStatus) {
    case "applied": return 0;
    case "approved": case "invoiced": case "paid": return 1;
    case "dispatched": case "received": return 2;
    case "submitted": return 3;
    case "scored": return 4;
    default: return 1;
  }
}

export default async function LabDashboard() {
  const { lab } = await requireLab();
  const { lang, tr } = await getServerT();
  const parts = await listParticipationsForLab(lab.id);
  const schemes = await getSchemesByIds(parts.map((p) => p.schemeId));
  const byId = new Map(schemes.map((s) => [s.id, s] as const));
  const myIds = new Set(parts.map((p) => p.schemeId));
  const openToJoin = (await listSchemes()).filter((s) => s.status === "open" && !myIds.has(s.id));

  const schemeName = (s: (typeof schemes)[number]) => s.name?.trim() || (lang === "bg" ? s.titleBg : s.titleEn) || s.number;

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
          return { label: lang === "bg" ? m.labelBg : m.labelEn, text: val === null || val === undefined ? "—" : `${sym} = ${val.toFixed(2)}`, v: rank(row.verdict) };
        })
        .filter((x): x is { label: string; text: string; v: Verdict | null } => !!x);
      const rs = scores.map((s) => s.v);
      const overall: Verdict | null = rs.includes("action") ? "action" : rs.includes("warn") ? "warn" : rs.includes("ok") ? "ok" : null;
      const deadline = scheme.schedule?.[scheme.schedule.length - 1]?.date ?? "";
      return {
        p, scheme, scores, overall,
        stage: stageIndex(p.status, scheme.status),
        completed: scheme.status === "closed",
        reported: scheme.status === "report" || scheme.status === "closed",
        hasCert: !!scheme.certificates?.[p.code],
        deadline,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  type Item = (typeof items)[number];
  const active = items.filter((it) => !it.completed);
  const completed = items.filter((it) => it.completed);

  const kv = (label: string, value: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="field-label" style={{ marginBottom: 0 }}>{label}</span>
      <span style={{ fontSize: 14, color: "var(--ink)" }}>{value || "—"}</span>
    </div>
  );

  const Stepper = ({ idx }: { idx: number }) => (
    <div style={{ position: "relative", display: "flex", margin: "14px 2px 4px" }}>
      <div style={{ position: "absolute", top: 8, left: "9%", right: "9%", height: 2, background: "var(--line)" }} />
      <div style={{ position: "absolute", top: 8, left: "9%", width: `${idx * 20 + 1}%`, height: 2, background: "var(--green-dark)" }} />
      {STAGE_KEYS.map((s, i) => {
        const done = i < idx, cur = i === idx;
        return (
          <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, zIndex: 1 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: done ? "var(--green-dark)" : "#fff", border: `2px solid ${done || cur ? "var(--green-dark)" : "var(--line)"}`, boxShadow: cur ? "0 0 0 3px var(--green-soft)" : "none" }} />
            <div style={{ fontSize: 10, color: i <= idx ? "var(--ink)" : "var(--muted)", textAlign: "center", lineHeight: 1.2 }}>{tr(s)}</div>
          </div>
        );
      })}
    </div>
  );

  const resultBlock = (scores: Item["scores"], overall: Verdict | null, awaiting: string) => (
    <div style={{ background: "#f7faf8", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      {overall ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{tr("lab.yourResult")}</span>
            <span className="chip" style={{ background: VCHIP[overall].bg, color: VCHIP[overall].fg }}>{tr(`verdict.${overall}`)}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
            {scores.map((s, i) => (
              <span key={i} style={{ fontSize: 12.5, color: "var(--muted)" }}>{s.label}: <b style={{ color: s.v ? VCHIP[s.v].fg : "var(--ink)" }}>{s.text}</b></span>
            ))}
          </div>
        </>
      ) : (
        <span style={{ fontSize: 13, color: "var(--muted)" }}>{awaiting}</span>
      )}
    </div>
  );

  const docButtons = (it: Item) => (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {it.reported ? <a href={`/lab/doc/${it.scheme.id}/report?lang=${lang}`} target="_blank" rel="noreferrer" className="btn btn-sm">{tr("lab.finalReport")}</a> : null}
      {it.hasCert ? <a href={`/lab/doc/${it.scheme.id}/certificate?lang=${lang}`} target="_blank" rel="noreferrer" className="btn btn-sm">{tr("lab.certificate")}</a> : null}
      {!it.reported && !it.hasCert && <span style={{ fontSize: 13, color: "var(--muted)" }}>{tr("lab.docsAfter")}</span>}
    </div>
  );

  const sectionTitle = (text: string) => <h2 className="section-title" style={{ fontSize: 19, marginTop: 6 }}>{text}</h2>;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <header className="flex items-center gap-3 px-6 py-3" style={{ background: "#fff", borderBottom: "1px solid var(--line)", color: "var(--ink)" }}>
        <span className="font-bold text-lg tracking-tight"><span style={{ color: "var(--green-dark)" }}>PTS</span> Bulgaria</span>
        <span className="text-sm" style={{ color: "var(--muted)" }}>· {tr("header.labPortal")}</span>
        <span className="ml-auto text-sm" style={{ fontWeight: 700 }}>{lab.name}</span>
        <LanguageToggle />
        <form action={signOutLabAction}>
          <button type="submit" className="btn btn-sm">{tr("common.signOut")}</button>
        </form>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
          <h1 className="section-title" style={{ fontSize: 30 }}>{tr("lab.welcomePrefix")} {lab.name}</h1>
          <span className="chip" style={{ background: "var(--green-dark)" }}>{tr("lab.yourCode")} · {parts[0]?.code ?? "—"}</span>
        </div>

        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* left: schemes by stage / participation */}
          <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 14 }}>

            {items.length === 0 && (
              <EmptyState
                title={tr("lab.noSchemesTitle")}
                body={tr("lab.noSchemesBody")}
                action={<Link href="/apply" className="btn btn-primary btn-sm" style={{ marginTop: 4 }}>{tr("lab.browseOpen")}</Link>}
              />
            )}

            {active.length > 0 && sectionTitle(tr("lab.participatingNow"))}
            {active.map((it) => {
              const st = statusChip(it.scheme.status, lang);
              const awaiting = it.deadline ? `${tr("lab.awaitingResults")} · ${tr("lab.deadline")} ${it.deadline}` : tr("lab.awaitingResults");
              return (
                <div key={it.p.id} className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17 }}>{schemeName(it.scheme)}</div>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>{it.scheme.number}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, color: st.fg, background: st.bg }}>{st.label}</span>
                  </div>
                  <Stepper idx={it.stage} />
                  {resultBlock(it.scores, it.overall, awaiting)}
                  {docButtons(it)}
                </div>
              );
            })}

            {completed.length > 0 && sectionTitle(tr("lab.completed"))}
            {completed.map((it) => {
              const st = statusChip(it.scheme.status, lang);
              return (
                <div key={it.p.id} className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17 }}>{schemeName(it.scheme)}</div>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>{it.scheme.number}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, color: st.fg, background: st.bg }}>{st.label}</span>
                  </div>
                  {resultBlock(it.scores, it.overall, tr("lab.docsAfter"))}
                  {docButtons(it)}
                </div>
              );
            })}

            {sectionTitle(tr("lab.openToJoin"))}
            {openToJoin.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>{tr("lab.noOpen")}</p>}
            {openToJoin.map((s) => {
              const st = statusChip(s.status, lang);
              return (
                <div key={s.id} className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17 }}>{s.name?.trim() || (lang === "bg" ? s.titleBg : s.titleEn) || s.number}</div>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>{s.number}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, color: st.fg, background: st.bg }}>{st.label}</span>
                  <Link href={`/apply/${s.id}`} className="btn btn-primary btn-sm">{tr("lab.applyToParticipate")}</Link>
                </div>
              );
            })}
          </div>

          {/* right: profile + account */}
          <div style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 className="section-title" style={{ fontSize: 18, flex: 1 }}>{tr("lab.profile")}</h2>
                <Link href="/lab/profile" className="btn btn-sm">{tr("common.edit")}</Link>
              </div>
              {kv(tr("lab.field.laboratory"), lab.name)}
              {kv(tr("lab.field.accreditationCert"), lab.accreditationCert)}
              {kv(tr("lab.field.contactPerson"), lab.contactPerson)}
              {kv(tr("lab.field.email"), lab.email)}
              {kv(tr("lab.field.phone"), lab.phone)}
              {kv(tr("lab.field.registeredAddress"), lab.registeredAddress)}
            </section>
            <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 className="section-title" style={{ fontSize: 18 }}>{tr("lab.accountSecurity")}</h2>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>{tr("lab.twoFactorOptional")}</p>
              <form action={signOutLabAction}><button type="submit" className="btn btn-sm">{tr("common.signOut")}</button></form>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
