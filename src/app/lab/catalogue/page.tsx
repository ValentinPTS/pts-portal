import Link from "next/link";
import { requireParticipant } from "@/lib/participant-session";
import { listStartedSchemes } from "@/lib/store";
import { isStarted } from "@/lib/visibility";
import { getServerT } from "@/lib/i18n-server";
import { catalogueRows, GROUPS, GROUP_TEXT, STATE_TEXT, activityText, takesApplications, wishOffered, announcedPrice, priceLines, subjectOf, wishOf, activeWish } from "@/lib/catalogue-model";
import { listWishes } from "@/lib/catalogue-wishes";
import { schemeFull } from "@/lib/waitlist-model";
import { listParticipants } from "@/lib/participants";
import { schemeNowMs } from "@/lib/clock";
import { fmtSchemeDate } from "@/lib/scheme-dates";
import ParticipantNav from "@/components/ParticipantNav";
import CatalogueWishButton from "@/components/CatalogueWishButton";

export const dynamic = "force-dynamic";

// «Каталог» in the portal (plan part 10.1; D15, К20, К25): the started schemes with their state, the
// released plan and invitation, and — for an approved organisation (Реш. 12) — the announced price
// (through announcedPrice: never the maximum, 3.7). «Уведоми ме при следваща» for a scheme that does
// not simply take an application now: the organisation is told when the next scheme of that subject
// starts — by a notice PTS releases (1.8).
export default async function LabCataloguePage() {
  const { user, entity, persona } = await requireParticipant();
  const { lang } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const approved = entity.state === "active";
  const started = (await listStartedSchemes()).filter(isStarted);
  const full = new Set((await Promise.all(started.filter((s) => s.status === "open").map(async (s) => (schemeFull(s, await listParticipants(s.id)) ? [s.id] : []) as string[]))).flat());
  const rows = catalogueRows(started, schemeNowMs, (s) => full.has(s.id));
  // before migration 0051 (or a failed read): no wishes shown — the page still opens (10.1 review)
  const wishes = await listWishes({ entityId: entity.id }).catch((e) => { console.error("[lab/catalogue] wishes:", (e as Error)?.message ?? e); return []; });
  const standing = wishes.filter(activeWish);
  const docLink = (id: string, doc: "plan" | "invitation", no: number) => (
    <a href={`/apply/${id}/${doc}?lang=${lg}`} target="_blank" rel="noopener" className="btn btn-sm" data-catalogue-doc={doc}>
      {doc === "plan" ? L(`План (ред. № ${no})`, `Plan (ed. No. ${no})`) : L(`Покана (ред. № ${no})`, `Invitation (ed. No. ${no})`)}
    </a>
  );
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <ParticipantNav lang={lg} active="catalogue" name={user.name} role={user.role} persona={persona} />
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }} data-lab-catalogue>
        <h1 className="section-title" style={{ fontSize: 26, margin: "0 0 8px" }}>{L("Каталог на схемите", "The schemes' catalogue")}</h1>
        {!approved && (
          <div role="note" data-catalogue-price-pending className="card" style={{ padding: 12, marginBottom: 12, background: "#fff8e6" }}>
            {L("Цените се виждат, когато PTS провери организацията («активно»).", "The prices show once PTS has checked the organisation («active»).")}
          </div>
        )}
        {standing.length > 0 && (
          <section className="card" data-catalogue-wishes style={{ padding: 12, marginBottom: 14 }}>
            <b>{L("Ще ви уведомим, когато започне следваща схема за:", "You will be told when the next scheme starts for:")}</b>
            <ul style={{ margin: "6px 0 0 18px" }}>
              {standing.map((w) => <li key={w.id} data-catalogue-wish-standing={w.id}>{L(w.objectBg || w.objectEn, w.objectEn || w.objectBg)} · {w.subject.split("|")[0] === "C" ? L("калибриране", "calibration") : w.subject.split("|")[0] === "S" ? L("вземане на проби", "sampling") : L("изпитване", "testing")} <CatalogueWishButton wishId={w.id} lang={lg} cancelOnly /></li>)}
            </ul>
          </section>
        )}
        {GROUPS.map((g) => (
          <section key={g} style={{ marginTop: 18 }} data-catalogue-group={g}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--green-dark)" }}>{GROUP_TEXT[g][lg]}</h2>
            {rows[g].length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>{L("Няма.", "None.")}</p>
            ) : (
              <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                {rows[g].map(({ scheme: s, state }) => {
                  const price = approved ? announcedPrice(s) : null;
                  const subject = subjectOf(s);
                  return (
                    <section key={s.id} className="card" data-catalogue-scheme={s.id} data-catalogue-state={state} style={{ padding: 14 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                        <b>{s.number}</b>
                        <span>{L(s.titleBg || s.titleEn, s.titleEn || s.titleBg)}</span>
                        <span className="text-sm" style={{ marginLeft: "auto", fontWeight: 700, color: takesApplications(state) ? "var(--green-dark)" : "#7a5a12" }}>{STATE_TEXT[state][lg]}</span>
                      </div>
                      <div className="text-sm" style={{ color: "var(--muted)" }}>
                        {L("Обект:", "Object:")} {L(s.objectBg || s.objectEn, s.objectEn || s.objectBg)} · {activityText(s, lg)}
                        {takesApplications(state) && s.dates?.applicationsDue ? ` · ${L("заявки до", "applications by")} ${fmtSchemeDate(s.dates.applicationsDue)}` : ""}
                      </div>
                      {approved && price && (
                        <ul data-catalogue-price className="text-sm" style={{ margin: "8px 0 0 18px" }}>
                          {priceLines(price, (s.activity ?? s.type) === "C", lg).map((line) => <li key={line}>{line}</li>)}
                        </ul>
                      )}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                        {s.sentToParticipants?.plan && s.releasedEditions?.plan && docLink(s.id, "plan", s.releasedEditions.plan.no)}
                        {s.sentToParticipants?.invitation && s.releasedEditions?.invitation && docLink(s.id, "invitation", s.releasedEditions.invitation.no)}
                        {takesApplications(state) && approved && <Link href={`/lab/apply/${s.id}`} className="btn btn-primary btn-sm" data-catalogue-apply={s.id}>{L("Заяви", "Apply")}</Link>}
                        {wishOffered(state) && subject && <CatalogueWishButton key={wishOf(wishes, entity.id, subject)?.id ?? "none"} schemeId={s.id} wishId={wishOf(wishes, entity.id, subject)?.id} lang={lg} />}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
