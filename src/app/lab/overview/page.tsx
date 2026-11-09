import Link from "next/link";
import { isProvisional } from "@/lib/coding-model";
import { requireParticipant, participantActor, participationsOf } from "@/lib/participant-session";
import { openLaboratories } from "@/lib/laboratories";
import { listForParticipations, listForEntity, withReadState, readerKey } from "@/lib/notifications";
import { listSchemes } from "@/lib/store";
import { isStarted } from "@/lib/visibility";
import { participationViews } from "@/lib/participation-view";
import { deadlineOrder } from "@/lib/participation-state-model";
import { getServerT } from "@/lib/i18n-server";
import { confirmDate } from "@/lib/profile-confirm-model";
import ParticipantNav from "@/components/ParticipantNav";
import MarkNoticesRead from "@/components/MarkNoticesRead";
import { ActionItems, ParticipationsTable } from "@/components/ParticipationLists";

export const dynamic = "force-dynamic";

// A participant's user's home (plan parts 4.6, 5.5; design §4 «Начало»): what asks for
// action now — a deadline, a delivery, a document — and the laboratory's active
// participations with their stage and next deadline; the finished ones in the archive.
// Every user sees all its entity's laboratories (К5) and switches between them; the
// laboratory is chosen by its id in the address, and only one of the user's own entity is
// ever shown. A scheme that has not started is not shown (Реш. 147). Its notices, read as
// THIS person read them (N28).
export default async function ParticipantOverviewPage({ searchParams }: { searchParams: Promise<{ lab?: string; view?: string }> }) {
  const ps = await requireParticipant();
  const { user, entity, persona } = ps;
  const { lang } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const [labs, parts, schemes] = await Promise.all([
    openLaboratories({ actor: participantActor(user.id), purpose: "lab.own" }, { entityId: entity.id }),
    participationsOf(ps),
    listSchemes(),
  ]);
  const started = new Set(schemes.filter((s) => isStarted(s)).map((s) => s.id));
  const mine = parts.filter((p) => started.has(p.schemeId));
  // the laboratories to switch between: the active ones, and any inactive one that has a participation
  const shown = labs.filter((l) => l.state === "active" || mine.some((p) => p.laboratoryId === l.id));
  const sp = await searchParams;
  const chosen = shown.find((l) => l.id === sp.lab) ?? shown.find((l) => mine.some((p) => p.laboratoryId === l.id)) ?? shown[0];
  const ofLab = chosen ? mine.filter((p) => p.laboratoryId === chosen.id) : [];
  // each participation from the record: its state, stage, next deadline, what it asks for (5.5)
  const views = chosen ? await participationViews(ofLab.map((p) => ({ participantId: p.participantId, schemeId: p.schemeId, labName: chosen.name, laboratoryId: chosen.id, country: entity.country })), { userId: user.id }) : [];
  // the nearest deadline first — by the instant it passes (a day alone at its end), none last
  const byDeadline = (a: (typeof views)[number], b: (typeof views)[number]) => deadlineOrder(a.deadline?.at) - deadlineOrder(b.deadline?.at) || a.scheme.number.localeCompare(b.scheme.number);
  const active = views.filter((v) => !v.finished).sort(byDeadline);
  const archived = views.filter((v) => v.finished).sort((a, b) => b.scheme.number.localeCompare(a.scheme.number));
  const archive = sp.view === "archive";
  // a failed read of the feed shows none, logged — the page still opens (1.1)
  const logged = (e: unknown) => { console.error("[lab/overview] notice feed:", (e as Error)?.message ?? e); return []; };
  // the participations' notices — and the organisation's own messages (5.10; Реш. 116), one feed, newest first
  const feed = [...(ofLab.length ? await listForParticipations(ofLab, 30).catch(logged) : []), ...await listForEntity(entity.id, 30).catch(logged)]
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 30);
  const notices = feed.length ? await withReadState(feed, readerKey.participant(user.id)).catch(logged) : [];
  const unread = notices.filter((n) => !n.readAt).length;
  const here = (extra: string) => `/lab/overview?${chosen ? `lab=${chosen.id}` : ""}${extra}`;

  // the notices — the participations' and the organisation's own messages (5.10)
  const noticeCard = (
            <section className="card" style={{ padding: "14px 18px" }}>
              <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
                <h2 className="field-label" style={{ fontSize: 15, margin: 0 }}>{L("Известия", "Notices")} {unread > 0 && <span data-unread={unread} aria-label={L(`${unread} непрочетени`, `${unread} unread`)} style={{ background: "var(--red)", color: "#fff", borderRadius: 999, padding: "0 7px", fontSize: 12 }}>{unread}</span>}</h2>
                {unread > 0 && <MarkNoticesRead lang={lg} ids={notices.map((n) => n.id)} />}
              </div>
              {notices.length === 0 ? <p className="text-sm" style={{ color: "var(--muted)" }}>{L("Няма известия.", "No notices.")}</p> : (
                <ul className="mt-1" style={{ listStyle: "none", padding: 0, margin: 0 }} data-notices>
                  {notices.map((n) => (
                    <li key={n.id} data-notice={n.id} data-notice-kind={n.kind} data-notice-read={n.readAt ? "1" : "0"} style={{ borderTop: "1px solid var(--line)", padding: "6px 0", fontWeight: n.readAt ? 400 : 700, whiteSpace: "pre-wrap" }}>
                      {!n.readAt && <span className="text-xs" style={{ color: "var(--red)", marginRight: 6 }}>● {L("ново", "new")}</span>}
                      <span className="text-xs" style={{ color: "var(--muted)", marginRight: 8 }}>{confirmDate(n.createdAt)}{n.code && !isProvisional(n.code) ? ` · ${n.code}` : ""}</span>{lg === "bg" ? n.bg : n.en}
                    </li>
                  ))}
                </ul>
              )}
            </section>
  );

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <ParticipantNav lang={lg} active="overview" name={user.name} role={user.role} persona={persona} />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 className="section-title" style={{ fontSize: 24, margin: 0 }}>{L("Начало", "Home")}</h1>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{entity.name}{chosen ? ` · ${chosen.name}${chosen.state === "inactive" ? ` (${L("неактивна", "inactive")})` : ""}` : ""}</div>
          </div>
          {shown.length > 1 && (
            // the laboratory switcher — only the user's own entity's (К5)
            <nav aria-label={L("Смени лаборатория", "Switch laboratory")} data-lab-switcher className="flex gap-2" style={{ flexWrap: "wrap" }}>
              {shown.map((l) => (
                <Link key={l.id} href={`/lab/overview?lab=${l.id}`} data-switch-lab={l.id} aria-current={chosen?.id === l.id ? "true" : undefined}
                  className="btn btn-sm" style={chosen?.id === l.id ? { background: "var(--green-dark)", color: "#fff", borderColor: "var(--green-dark)" } : undefined}>
                  {l.name}{l.state === "inactive" ? ` (${L("неактивна", "inactive")})` : ""}
                </Link>
              ))}
            </nav>
          )}
        </div>
        {!entity.confirmedAt && (
          <p role="note" data-unconfirmed className="text-sm" style={{ background: "#fff8e6", border: "1px solid #ecd9a8", borderRadius: 8, padding: "8px 10px", margin: 0 }}>
            {user.role === "admin" ? L("Данните на организацията чакат вашето потвърждение — ", "The organisation's data awaits your confirmation — ") : L("Данните на организацията чакат потвърждението на администратора на профила — ", "The organisation's data awaits the profile administrator's confirmation — ")}
            <Link href="/lab/confirm">{L("към данните", "to the data")}</Link>
          </p>
        )}
        {shown.length === 0 ? (
          <>
            <p className="text-sm" style={{ color: "var(--muted)" }}>{L("PTS още не е въвел лаборатория на организацията — пишете на office@ptsbg.eu.", "PTS has not entered a laboratory of the organisation yet — write to office@ptsbg.eu.")}</p>
            {/* the organisation's own messages reach it before it has a laboratory (5.10) */}
            {notices.length > 0 && noticeCard}
          </>
        ) : chosen && (
          <>
            {!archive && <ActionItems lang={lg} views={active} />}
            <section className="card" data-chosen-lab={chosen.id} style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, flex: 1 }}>{archive ? L("Архив", "Archive") : L("Моите участия", "My participations")}</h2>
                <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  {archive
                    ? <>{L("Приключилите участия. ", "The finished participations. ")}<Link href={here("")} data-view-active>{L("Към активните", "To the active ones")} ({active.length})</Link></>
                    : <>{L("Показани са активните. ", "The active ones are shown. ")}<Link href={here("&view=archive")} data-view-archive>{L("Приключилите са в архива", "The finished ones are in the archive")} ({archived.length})</Link></>}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "8px 18px 0" }}>
                {chosen.deliveryAddress}{chosen.mobileOffice ? ` · ${L("мобилен офис", "mobile office")}` : ""}{(chosen.accreditationNo || chosen.accreditationBody) ? ` · ${L("акредитация", "accreditation")} ${[chosen.accreditationNo, chosen.accreditationBody].filter(Boolean).join(", ")}` : ""}
              </div>
              {(archive ? archived : active).length === 0 ? (
                <p style={{ margin: 0, padding: "12px 18px 16px", fontSize: 13, color: "var(--muted)" }}>{archive ? L("Няма приключили участия.", "No finished participations.") : L("Тази лаборатория няма активни участия в портала.", "This laboratory has no active participations in the portal.")}</p>
              ) : (
                <div data-participations style={{ paddingTop: 8 }}>
                  <ParticipationsTable lang={lg} views={archive ? archived : active} archive={archive} showLab={false} />
                </div>
              )}
            </section>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>{L("Кодът е видим само за вашата лаборатория. При повече от едно участие в една схема всяко има свой код.", "The code is visible to your laboratory only. With more than one participation in a scheme, each has its own code.")}</p>

            {noticeCard}
          </>
        )}
      </main>
    </div>
  );
}
