import Link from "next/link";
import { requireLab } from "@/lib/lab-auth";
import { listParticipationsForLab } from "@/lib/participants";
import { getSchemesByIds, listSchemes } from "@/lib/store";
import { metricsForScheme, scoreMetric } from "@/lib/scoring";
import { statusChip } from "@/lib/folders";
import { signOutLabAction } from "@/lib/auth-actions";
import { EmptyState } from "@/components/States";
import LabSchemeTabs from "@/components/LabSchemeTabs";
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
  // One fetch → the public buckets a lab may browse. Drafts are internal WIP and are
  // never shown to labs (confidentiality); running/report rounds a lab isn't in are
  // in progress and closed to new applicants, so they're not listed either.
  const allSchemes = await listSchemes();
  const openToJoin = allSchemes.filter((s) => s.status === "open" && !myIds.has(s.id));
  // Upcoming = a scheme the provider has explicitly ANNOUNCED to labs but not yet
  // opened (still draft). Only announced drafts appear — unannounced drafts stay
  // internal, so WIP never leaks. It becomes applyable once its status is Open.
  const upcoming = allSchemes.filter((s) => s.announced && s.status === "draft" && !myIds.has(s.id));
  const pastSchemes = allSchemes.filter((s) => s.status === "closed" && !myIds.has(s.id));

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

  const dateRange = (s: (typeof allSchemes)[number]) => {
    const ds = (s.schedule ?? []).map((x) => x.date).filter(Boolean);
    return ds.length > 1 ? `${ds[0]} – ${ds[ds.length - 1]}` : ds[0] ?? "";
  };

  // ── card renderers (one per bucket) ──────────────────────────────────────────
  const participCard = (it: Item) => {
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
  };

  const browseCard = (s: (typeof allSchemes)[number], mode: "open" | "upcoming" | "past") => {
    const range = dateRange(s);
    // Upcoming rounds are still Draft internally — show labs a friendly "Upcoming"
    // chip, never the raw internal status.
    const chip = mode === "upcoming"
      ? { label: lang === "bg" ? "Предстои" : "Upcoming", bg: "var(--green-soft)", fg: "var(--green-dark)" }
      : statusChip(s.status, lang);
    return (
      <div key={s.id} className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17 }}>{s.name?.trim() || (lang === "bg" ? s.titleBg : s.titleEn) || s.number}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{s.number}{range ? ` · ${range}` : ""}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, color: chip.fg, background: chip.bg }}>{chip.label}</span>
        {mode === "open" && <Link href={`/apply/${s.id}`} className="btn btn-primary btn-sm">{tr("lab.applyToParticipate")}</Link>}
      </div>
    );
  };

  // ── tab contents (rendered server-side, toggled by the client tab shell) ──────
  const participatingContent = items.length === 0 ? (
    <EmptyState title={tr("lab.noSchemesTitle")} body={tr("lab.noSchemesBody")} />
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{items.map(participCard)}</div>
  );
  const openContent = openToJoin.length === 0 ? (
    <p style={{ fontSize: 13, color: "var(--muted)" }}>{tr("lab.noOpen")}</p>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{openToJoin.map((s) => browseCard(s, "open"))}</div>
  );
  const upcomingContent = upcoming.length === 0 ? (
    <p style={{ fontSize: 13, color: "var(--muted)" }}>{lang === "bg" ? "Няма предстоящи схеми." : "No upcoming schemes announced yet."}</p>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{upcoming.map((s) => browseCard(s, "upcoming"))}</div>
  );
  const pastContent = pastSchemes.length === 0 ? (
    <p style={{ fontSize: 13, color: "var(--muted)" }}>{lang === "bg" ? "Няма минали схеми." : "No past schemes yet."}</p>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{pastSchemes.map((s) => browseCard(s, "past"))}</div>
  );

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
          {/* left: tabbed scheme browser (participating · open · past) */}
          <div style={{ flex: 1, minWidth: 320 }}>
            <LabSchemeTabs
              tabs={[
                { key: "participating", label: tr("lab.participatingNow"), count: items.length, content: participatingContent },
                { key: "open", label: lang === "bg" ? "Отворени" : "Open", count: openToJoin.length, content: openContent },
                { key: "upcoming", label: lang === "bg" ? "Предстоящи" : "Upcoming", count: upcoming.length, content: upcomingContent },
                { key: "past", label: lang === "bg" ? "Минали" : "Past", count: pastSchemes.length, content: pastContent },
              ]}
            />
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
