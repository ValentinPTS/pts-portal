import Link from "next/link";
import { docsFor } from "@/lib/release-model";
import { getDoc } from "@/lib/documents";
import { isProvisional } from "@/lib/coding-model";
import { requireParticipant, participantActor, participationsOf } from "@/lib/participant-session";
import { openLaboratories } from "@/lib/laboratories";
import { listForParticipations, withReadState, readerKey } from "@/lib/notifications";
import { listSchemes } from "@/lib/store";
import { isStarted } from "@/lib/visibility";
import { getServerT } from "@/lib/i18n-server";
import { confirmDate } from "@/lib/profile-confirm-model";
import ParticipantNav from "@/components/ParticipantNav";
import MarkNoticesRead from "@/components/MarkNoticesRead";

export const dynamic = "force-dynamic";

// A participant's user's home (plan part 4.6): the laboratory switcher. Every user sees
// all its entity's laboratories (К5); for the one chosen, its participations — by the
// frozen copies in force (4.5) — and their notices, read as THIS person read them
// (N28). The laboratory is chosen by its id in the address, and only one of the
// user's own entity is ever shown. A scheme that has not started is not shown (Реш. 147).
export default async function ParticipantOverviewPage({ searchParams }: { searchParams: Promise<{ lab?: string }> }) {
  const ps = await requireParticipant();
  const { user, entity, persona } = ps;
  const { lang, tr } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const [labs, parts, schemes] = await Promise.all([
    openLaboratories({ actor: participantActor(user.id), purpose: "lab.own" }, { entityId: entity.id }),
    participationsOf(ps),
    listSchemes(),
  ]);
  const started = new Map(schemes.filter((s) => isStarted(s)).map((s) => [s.id, s]));
  const mine = parts.filter((p) => started.has(p.schemeId));
  // the laboratories to switch between: the active ones, and any inactive one that has a participation
  const shown = labs.filter((l) => l.state === "active" || mine.some((p) => p.laboratoryId === l.id));
  const asked = (await searchParams).lab;
  const chosen = shown.find((l) => l.id === asked) ?? shown.find((l) => mine.some((p) => p.laboratoryId === l.id)) ?? shown[0];
  const ofLab = chosen ? mine.filter((p) => p.laboratoryId === chosen.id) : [];
  // a failed read of the feed shows none, logged — the page still opens (1.1)
  const logged = (e: unknown) => { console.error("[lab/overview] notice feed:", (e as Error)?.message ?? e); return []; };
  const notices = ofLab.length ? await withReadState(await listForParticipations(ofLab, 30).catch(logged), readerKey.participant(user.id)).catch(logged) : [];
  const unread = notices.filter((n) => !n.readAt).length;
  const name = (id: string) => { const s = started.get(id); return s ? `${s.number}${(s.name?.trim() || (lg === "bg" ? s.titleBg : s.titleEn)) ? ` · ${s.name?.trim() || (lg === "bg" ? s.titleBg : s.titleEn)}` : ""}` : id; };
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <ParticipantNav lang={lg} active="overview" name={user.name} role={user.role} persona={persona} />
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px" }}>
        <h1 className="section-title" style={{ fontSize: 24, margin: "0 0 4px" }}>{entity.name}</h1>
        {!entity.confirmedAt && (
          <p role="note" data-unconfirmed className="text-sm" style={{ background: "#fff8e6", border: "1px solid #ecd9a8", borderRadius: 8, padding: "8px 10px" }}>
            {user.role === "admin" ? L("Данните на организацията чакат вашето потвърждение — ", "The organisation's data awaits your confirmation — ") : L("Данните на организацията чакат потвърждението на администратора на профила — ", "The organisation's data awaits the profile administrator's confirmation — ")}
            <Link href="/lab/confirm">{L("към данните", "to the data")}</Link>
          </p>
        )}
        {shown.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>{L("PTS още не е въвел лаборатория на организацията — пишете на office@ptsbg.eu.", "PTS has not entered a laboratory of the organisation yet — write to office@ptsbg.eu.")}</p>
        ) : (
          <>
            {/* the laboratory switcher — only the user's own entity's (К5) */}
            <nav aria-label={L("Лаборатории", "Laboratories")} data-lab-switcher className="flex gap-2 mt-3" style={{ flexWrap: "wrap" }}>
              {shown.map((l) => (
                <Link key={l.id} href={`/lab/overview?lab=${l.id}`} data-switch-lab={l.id} aria-current={chosen?.id === l.id ? "true" : undefined}
                  className="btn btn-sm" style={chosen?.id === l.id ? { background: "var(--green-dark)", color: "#fff", borderColor: "var(--green-dark)" } : undefined}>
                  {l.name}{l.state === "inactive" ? ` (${L("неактивна", "inactive")})` : ""}
                </Link>
              ))}
            </nav>
            {chosen && (
              <section className="card mt-3" style={{ padding: 18 }} data-chosen-lab={chosen.id}>
                <div className="text-sm" style={{ color: "var(--muted)" }}>{chosen.deliveryAddress}{chosen.mobileOffice ? ` · ${L("мобилен офис", "mobile office")}` : ""}{(chosen.accreditationNo || chosen.accreditationBody) ? ` · ${L("акредитация", "accreditation")} ${[chosen.accreditationNo, chosen.accreditationBody].filter(Boolean).join(", ")}` : ""}</div>
                <h2 className="field-label" style={{ fontSize: 15, marginTop: 12 }}>{L("Участия", "Participations")} ({ofLab.length})</h2>
                {ofLab.length === 0 ? <p className="text-sm" style={{ color: "var(--muted)" }}>{L("Тази лаборатория още няма участия в портала.", "This laboratory has no participations in the portal yet.")}</p> : (
                  <table className="w-full text-sm" style={{ borderCollapse: "collapse" }} data-participations>
                    <thead><tr style={{ color: "var(--muted)", textAlign: "left" }}><th className="p-1">{L("Схема", "Scheme")}</th><th className="p-1">{L("Код", "Code")}</th><th className="p-1">{L("Състояние", "State")}</th><th className="p-1">{L("Документи", "Documents")}</th></tr></thead>
                    <tbody>{ofLab.map((p) => <tr key={p.participantId} data-participation={isProvisional(p.code) ? undefined : p.code} data-participation-id={p.participantId} style={{ borderTop: "1px solid var(--line)" }}><td className="p-1">{name(p.schemeId)}</td><td className="p-1 font-mono">{isProvisional(p.code) ? L("кодът предстои", "code to come") : p.code}</td><td className="p-1">{tr(`pstatus.${p.status}`)}</td>
                      {/* what reaches it — to every participant, its participation, or this user by name (5.4) — each as its edition */}
                      <td className="p-1" data-docs>{docsFor(started.get(p.schemeId)!, { participantIds: [p.participantId], userId: user.id }).map((d) => (
                        <a key={d.key} href={`/lab/doc/${p.schemeId}/${d.key}?lang=${lg}&p=${encodeURIComponent(p.participantId)}`} data-doc={d.key} data-doc-level={d.level} style={{ display: "block" }}>
                          {(() => { const def = getDoc(d.key); return def ? (lg === "bg" ? def.nameBg : def.nameEn) : d.key; })()}{d.editionNo ? ` (${L("ред.", "ed.")} № ${d.editionNo})` : ""}{d.level === "user" ? L(" — до вас лично", " — to you personally") : d.level === "participation" ? L(" — само за това участие", " — for this participation alone") : ""}
                        </a>
                      ))}</td></tr>)}</tbody>
                  </table>
                )}
                <div className="flex items-center gap-3 mt-4" style={{ flexWrap: "wrap" }}>
                  <h2 className="field-label" style={{ fontSize: 15, margin: 0 }}>{L("Известия", "Notices")} {unread > 0 && <span data-unread={unread} aria-label={L(`${unread} непрочетени`, `${unread} unread`)} style={{ background: "var(--red)", color: "#fff", borderRadius: 999, padding: "0 7px", fontSize: 12 }}>{unread}</span>}</h2>
                  {unread > 0 && <MarkNoticesRead lang={lg} ids={notices.map((n) => n.id)} />}
                </div>
                {notices.length === 0 ? <p className="text-sm" style={{ color: "var(--muted)" }}>{L("Няма известия.", "No notices.")}</p> : (
                  <ul className="mt-1" style={{ listStyle: "none", padding: 0 }} data-notices>
                    {notices.map((n) => (
                      <li key={n.id} data-notice={n.id} data-notice-read={n.readAt ? "1" : "0"} style={{ borderTop: "1px solid var(--line)", padding: "6px 0", fontWeight: n.readAt ? 400 : 700 }}>
                        {!n.readAt && <span className="text-xs" style={{ color: "var(--red)", marginRight: 6 }}>● {L("ново", "new")}</span>}
                        <span className="text-xs" style={{ color: "var(--muted)", marginRight: 8 }}>{confirmDate(n.createdAt)}{n.code && !isProvisional(n.code) ? ` · ${n.code}` : ""}</span>{lg === "bg" ? n.bg : n.en}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
