import Link from "next/link";
import { requireSection, getViewer, schemesFor } from "@/lib/access";
import { getRoleContext, canManagePeople } from "@/lib/roles";
import { listSchemeSummaries } from "@/lib/store";
import { visibleSections } from "@/lib/admin-nav";
import { ROLE_LABEL } from "@/lib/role-model";
import { statusChip, typeLabel } from "@/lib/folders";
import { getServerT } from "@/lib/i18n-server";
import { listDeclarations } from "@/lib/staff-declarations";

// «Табло» (plan part 2.7): the first section of the administrative panel — who you
// are in the portal (your roles, from the role model and the Orders, 2.1–2.6), the
// schemes you work in, and the sections open to you. Nothing here shows a laboratory.
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

  return (
    <div data-dashboard className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{L("Табло", "Dashboard")}</h1>
        {who && <p data-dashboard-who className="mt-2 text-sm" style={{ color: "var(--muted)", maxWidth: 680 }}>{who}</p>}
        {viewer.email && !viewer.auditor && (
          <p data-dashboard-declaration className="mt-2 text-sm" style={{ color: mine ? "var(--muted)" : "var(--red)" }}>
            {mine
              ? <>{L("Декларацията ви за конфиденциалност Ф 4.2-1 е подписана на", "Your confidentiality declaration Ф 4.2-1 was signed on")} {mine.signedOn.split("-").reverse().join(".")} · <a href={`/users/declarations/${mine.id}`} target="_blank" rel="noopener">{L("копието", "the scan")}</a></>
              : L("Декларацията ви за конфиденциалност Ф 4.2-1 още не е записана. Ръководителят на РТ провайдъра я записва в «Потребители».", "Your confidentiality declaration Ф 4.2-1 is not on record yet. The head of the PT provider records it in «Users».")}
          </p>
        )}
      </div>

      {(viewer.roles.permanent.length > 0 || held.length > 0) && (
        <section className="card" style={{ padding: "14px 16px" }} data-dashboard-roles>
          <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15 }}>{L("Вашите роли", "Your roles")}</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {viewer.roles.permanent.map((r) => <li key={r}><b>{label(r)}</b> <span style={{ color: "var(--muted)" }}>· {L("постоянна", "permanent")}</span></li>)}
            {held.map(({ schemeId, role }) => (
              <li key={`${schemeId}:${role}`}>
                <b>{label(role)}</b> <span style={{ color: "var(--muted)" }}>· {L("по Заповедта на", "by the Order of")}</span>{" "}
                <Link href={`/schemes/${schemeId}`} className="font-mono text-xs">{byId.get(schemeId)?.number ?? schemeId}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {schemes.length > 0 && (
        <section data-dashboard-schemes>
          <h2 className="font-bold mb-2" style={{ color: "var(--green-dark)", fontSize: 15 }}>{L("Схемите, по които работите", "The schemes you work in")} <span style={{ color: "var(--muted)", fontWeight: 500 }}>({schemes.length})</span></h2>
          <div className="card overflow-hidden" style={{ overflowX: "auto" }}>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <tbody>
                {schemes.slice(0, 20).map((s) => {
                  const st = statusChip(s.status, lang);
                  return (
                    <tr key={s.id} style={{ borderTop: "1px solid var(--line)" }}>
                      <td className="p-2" style={{ whiteSpace: "nowrap" }}><Link href={`/schemes/${s.id}`} className="font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>{s.number}</Link></td>
                      <td className="p-2" style={{ color: "var(--muted)" }}>{typeLabel(s.type, lang)}</td>
                      <td className="p-2"><span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, color: st.fg, background: st.bg }}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {schemes.length > 20 && <Link href="/" className="text-sm mt-2 inline-block">{L("Всички в «Схеми»", "All of them in «Schemes»")} →</Link>}
        </section>
      )}

      {sections.length > 0 && (
        <section data-dashboard-sections>
          <h2 className="font-bold mb-2" style={{ color: "var(--green-dark)", fontSize: 15 }}>{L("Разделите", "The sections")}</h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
            {sections.map((s) => (
              <Link key={s.key} href={s.href} className="card no-underline" style={{ padding: "12px 14px", color: "var(--ink)" }}>
                <div className="font-bold" style={{ color: "var(--green-dark)" }}>{lang === "en" ? s.en : s.bg}</div>
                {s.comesIn && <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{L(`идва в част ${s.comesIn}`, `comes in part ${s.comesIn}`)}</div>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
