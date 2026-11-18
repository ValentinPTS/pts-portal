import Link from "next/link";
import { requireSection, getViewer, schemesFor } from "@/lib/access";
import { getRoleContext, canManagePeople } from "@/lib/roles";
import { listSchemeSummaries } from "@/lib/store";
import { visibleSections } from "@/lib/admin-nav";
import { ROLE_LABEL } from "@/lib/role-model";
import { statusChip, typeLabel } from "@/lib/folders";
import { getServerT } from "@/lib/i18n-server";
import { listDeclarations } from "@/lib/staff-declarations";
import Icon from "@/components/ui/Icon";
import { SECTION_ICON } from "@/lib/ui-nav";

// «Табло» (plan part 2.7): the first section of the administrative panel — who you
// are in the portal (your roles, from the role model and the Orders, 2.1–2.6), the
// schemes you work in, and the sections open to you. Nothing here shows a laboratory.
// The redesign (R4): big and plain — the schemes and the sections as big tiles, as a scheme's «Всичко за схемата».
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireSection("dashboard");
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "en" ? en : bg);
  const label = (r: keyof typeof ROLE_LABEL) => ROLE_LABEL[r][lang === "en" ? "en" : "bg"];
  const viewer = await getViewer();
  const managesPeople = await canManagePeople(await getRoleContext());
  const scope = schemesFor(viewer, "codes.view");
  const schemes = (await listSchemeSummaries()).filter((s) => scope === "all" || scope.includes(s.id));
  const byId = new Map(schemes.map((s) => [s.id, s]));
  const sections = visibleSections(viewer, managesPeople).filter((s) => s.key !== "dashboard");
  const held = Object.entries(viewer.roles.schemes).flatMap(([schemeId, roles]) => roles.map((role) => ({ schemeId, role })));
  // one's own Ф 4.2-1 (2.8) — for a signed-in person of PTS
  const mine = viewer.email && !viewer.auditor ? (await listDeclarations({ personEmail: viewer.email })).find((d) => !d.voided) : undefined;

  const who = viewer.build
    ? L("Локална разработка: входът е изключен и всичко е отворено. На сайта така не става никога.", "Local development: sign-in is off and everything is open. On the site this never happens.")
    : viewer.auditor
      ? L("Одитор: само четене — кодове, резултати и дневника на всички схеми, без имена.", "Auditor: read-only — codes, results and the journal of every scheme, no names.")
      : !viewer.roles.permanent.length && !held.length
        ? L("Още нямате роля. Ролите възлага ръководителят на РТ провайдъра — постоянните и тези от Заповедта на всяка схема.", "You have no role yet. The head of the PT provider gives the roles — the permanent ones, and each scheme's from its Order.")
        : null;

  const h2 = { margin: 0, fontSize: 24, fontWeight: 600, color: "var(--ink)" } as const;
  return (
    <div data-dashboard className="flex flex-col gap-8">
      <div>
        <h1 className="ui-h1">{L("Табло", "Dashboard")}</h1>
        {who && <p data-dashboard-who style={{ margin: "16px 0 0", fontSize: 18, lineHeight: 1.5, color: "#555555", maxWidth: 680 }}>{who}</p>}
        {viewer.email && !viewer.auditor && (
          <p data-dashboard-declaration style={{ margin: "12px 0 0", fontSize: 17, lineHeight: 1.5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", color: mine ? "#555555" : "var(--red)" }}>
            <Icon name={mine ? "check" : "info"} size={22} />
            {mine
              ? <span>{L("Декларацията ви за конфиденциалност Ф 4.2-1 е подписана на", "Your confidentiality declaration Ф 4.2-1 was signed on")} {mine.signedOn.split("-").reverse().join(".")} · <a href={`/users/declarations/${mine.id}`} target="_blank" rel="noopener">{L("копието", "the scan")}</a></span>
              : <span>{L("Декларацията ви за конфиденциалност Ф 4.2-1 още не е записана. Ръководителят на РТ провайдъра я записва в «Потребители».", "Your confidentiality declaration Ф 4.2-1 is not on record yet. The head of the PT provider records it in «Users».")}</span>}
          </p>
        )}
      </div>

      {(viewer.roles.permanent.length > 0 || held.length > 0) && (
        <section className="ui-card" data-dashboard-roles>
          <h2 style={h2}>{L("Вашите роли", "Your roles")}</h2>
          <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10, fontSize: 17 }}>
            {viewer.roles.permanent.map((r) => (
              <li key={r} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Icon name="user" size={22} /><b>{label(r)}</b> <span style={{ color: "#555555" }}>· {L("постоянна", "permanent")}</span>
              </li>
            ))}
            {held.map(({ schemeId, role }) => (
              <li key={`${schemeId}:${role}`} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Icon name="user" size={22} /><b>{label(role)}</b> <span style={{ color: "#555555" }}>· {L("по Заповедта на", "by the Order of")}</span>
                <Link href={`/schemes/${schemeId}`} style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{byId.get(schemeId)?.number ?? schemeId}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {schemes.length > 0 && (
        <section data-dashboard-schemes style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={h2}>{L("Схемите, по които работите", "The schemes you work in")} <span style={{ color: "#555555", fontWeight: 500 }}>({schemes.length})</span></h2>
          <div className="ui-tiles">
            {schemes.slice(0, 20).map((s) => {
              const st = statusChip(s.status, lang);
              return (
                <Link key={s.id} href={`/schemes/${s.id}`} className="ui-tile">
                  <Icon name={s.type === "T" ? "flask" : "gear"} size={30} />
                  <span className="ui-tile-name" style={{ fontVariantNumeric: "tabular-nums" }}>{s.number}</span>
                  <span className="ui-tile-sub">{typeLabel(s.type, lang)}</span>
                  <span style={{ alignSelf: "flex-start", fontSize: 14, fontWeight: 700, padding: "4px 12px", borderRadius: 999, color: st.fg, background: st.bg }}>{st.label}</span>
                </Link>
              );
            })}
          </div>
          {schemes.length > 20 && <Link href="/" className="ui-btn" style={{ alignSelf: "flex-start" }}>{L("Всички в «Схеми»", "All of them in «Schemes»")}<Icon name="arrowRight" size={22} strokeWidth={2.4} /></Link>}
        </section>
      )}

      {sections.length > 0 && (
        <section data-dashboard-sections style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={h2}>{L("Разделите", "The sections")}</h2>
          <div className="ui-tiles">
            {sections.map((s) => (
              <Link key={s.key} href={s.href} className="ui-tile">
                <Icon name={SECTION_ICON[s.key]} size={30} />
                <span className="ui-tile-name">{lang === "en" ? s.en : s.bg}</span>
                {s.comesIn && <span className="ui-tile-sub">{L(`идва в част ${s.comesIn}`, `comes in part ${s.comesIn}`)}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
