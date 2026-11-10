import Link from "next/link";
import { requireParticipant } from "@/lib/participant-session";
import { listOpenSchemes, getScheme } from "@/lib/store";
import { isStarted } from "@/lib/visibility";
import { isProvisional } from "@/lib/coding-model";
import { getServerT } from "@/lib/i18n-server";
import { applyOpenProblem } from "@/lib/lab-apply-model";
import { schemeNowMs } from "@/lib/clock";
import { fmtSchemeDate } from "@/lib/scheme-dates";
import ParticipantNav from "@/components/ParticipantNav";

export const dynamic = "force-dynamic";

// «Заявяване» (plan part 9.2): the schemes open for applications — started and taking them (never a
// draft, Реш. 147), the deadline not passed (on the round's own clock, Sofia's day), the final list not
// announced. An approved organisation only (Реш. 12): until PTS has checked it, the page says so.
export default async function LabApplyPage({ searchParams }: { searchParams: Promise<{ done?: string; code?: string; warn?: string }> }) {
  const { user, entity, persona } = await requireParticipant();
  const { lang } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const sp = await searchParams;
  const open = (await listOpenSchemes()).filter((s) => !applyOpenProblem(s, schemeNowMs(s)))
    .sort((a, b) => (a.dates?.applicationsDue ?? "9999").localeCompare(b.dates?.applicationsDue ?? "9999") || a.number.localeCompare(b.number));
  const approved = entity.state === "active";
  const doneScheme = sp.done ? await getScheme(sp.done) : null;
  const done = doneScheme && isStarted(doneScheme) ? doneScheme : null;
  // a provisional reference is never shown to the laboratory (5.3)
  const code = sp.code && !isProvisional(sp.code) ? sp.code : null;
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <ParticipantNav lang={lg} active="apply" name={user.name} role={user.role} persona={persona} />
      <main style={{ maxWidth: 820, margin: "0 auto", padding: "32px 24px" }}>
        <h1 className="section-title" style={{ fontSize: 26, margin: "0 0 8px" }}>{L("Заявяване на участие", "Apply to take part")}</h1>
        {done && (
          <div role="status" data-apply-done className="card" style={{ padding: 14, marginBottom: 14, background: "var(--green-soft)" }}>
            {L(`Заявката за ${done.number} е приета${code ? ` — код ${code}` : ""}. Участието е в «Начало».`, `The application for ${done.number} is received${code ? ` — code ${code}` : ""}. The participation is under «Home».`)}
            {sp.warn === "1" && <div data-apply-done-warning style={{ marginTop: 6, color: "#7a2e0e" }}>{L("Схемата изисква акредитация, а лабораторията няма въведен номер на акредитация — това не спира участието (Реш. 108).", "The scheme asks for accreditation and the laboratory has no accreditation number — this does not stop the participation (Decision 108).")}</div>}
          </div>
        )}
        {!approved ? (
          <div role="note" data-apply-entity-pending className="card" style={{ padding: 14, background: "#fff8e6" }}>
            {L("Заявки се подават, когато PTS провери организацията («активно»). Дотогава можете да прегледате данните ѝ в «Данните на организацията».", "Applications open once PTS has checked the organisation («active»). Meanwhile you can review its data under «The organisation's data».")}
          </div>
        ) : open.length === 0 ? (
          <div className="card" data-apply-none style={{ padding: 14, color: "var(--muted)" }}>{L("Сега няма схеми, които приемат заявки.", "No scheme takes applications now.")}</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {open.map((s) => (
              <section key={s.id} className="card" data-apply-scheme={s.id} style={{ padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 320px" }}>
                  <div><b>{s.number}</b> · {L(s.titleBg || s.titleEn, s.titleEn || s.titleBg)}</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>
                    {s.dates?.applicationsDue ? L(`Краен срок за заявки: ${fmtSchemeDate(s.dates.applicationsDue)}`, `Applications due: ${fmtSchemeDate(s.dates.applicationsDue)}`) : L("Без краен срок за заявки", "No deadline for applications")}
                    {" · "}{s.type === "C" ? L("калибриране", "calibration") : L("изпитване", "testing")}
                  </div>
                </div>
                <Link href={`/lab/apply/${s.id}`} className="btn btn-primary btn-sm" data-apply-open={s.id}>{L("Заяви", "Apply")}</Link>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
