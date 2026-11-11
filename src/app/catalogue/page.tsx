import Link from "next/link";
import { listStartedSchemes } from "@/lib/store";
import { isStarted } from "@/lib/visibility";
import { getServerT } from "@/lib/i18n-server";
import { catalogueRows, GROUPS, GROUP_TEXT, STATE_TEXT, activityText, takesApplications } from "@/lib/catalogue-model";
import { schemeFull } from "@/lib/waitlist-model";
import { listParticipants } from "@/lib/participants";
import { schemeNowMs } from "@/lib/clock";
import { fmtSchemeDate } from "@/lib/scheme-dates";
import { PDF_APPLICATION_URL } from "@/lib/online-applications";

export const dynamic = "force-dynamic";

// The public catalogue (plan part 10.1; D15, Реш. 121, 147; К1, К19, К25). Every STARTED scheme —
// taking applications, under way, finished — with its state in words. Never a draft (Реш. 147),
// never a count, free places or the maximum (К1; 3.7): «Запълнена» is a label (К19). The documents
// are on each scheme's page (its released plan and invitation, D15); applying is in the portal or
// with the PDF; «Уведоми ме при следваща» is in the portal, for its signed-in users only (К25).
export default async function CataloguePage() {
  const { lang } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const started = (await listStartedSchemes()).filter(isStarted);
  // «Запълнена» asked only of a scheme taking applications — the count stays on the server
  const full = new Set((await Promise.all(started.filter((s) => s.status === "open").map(async (s) => (schemeFull(s, await listParticipants(s.id)) ? [s.id] : []) as string[]))).flat());
  const rows = catalogueRows(started, schemeNowMs, (s) => full.has(s.id));
  const card = { display: "block", background: "#1b2016", border: "1px solid #36422c", borderRadius: 14, padding: "16px 20px", color: "#e7ece1" } as const;
  return (
    <div data-catalogue>
      <h1 className="text-4xl font-bold text-center" style={{ letterSpacing: "0.5px" }}>{L("Каталог на схемите", "The schemes' catalogue")}</h1>
      <p className="text-center mt-2" style={{ color: "#aab59c", maxWidth: 680, marginInline: "auto" }}>
        {L("Схемите за изпитване за пригодност на PTS — които приемат заявки, които са в ход и които са приключили. Планът и поканата на всяка са на страницата ѝ.",
          "PTS's proficiency-testing schemes — those taking applications, those under way and those finished. Each one's plan and invitation are on its page.")}
      </p>
      <div className="mt-4 flex gap-3 justify-center flex-wrap" data-catalogue-paths>
        <a href="/lab/login" className="btn btn-primary inline-flex">{L("Вход в портала", "Sign in to the portal")}</a>
        <a href="/register" className="btn inline-flex">{L("Регистрация на организация", "Register an organisation")}</a>
        <a href={PDF_APPLICATION_URL} target="_blank" rel="noopener" className="btn inline-flex">{L("Формуляр за заявка (PDF)", "The application form (PDF)")}</a>
      </div>
      <p className="text-center text-sm mt-3" style={{ color: "#aab59c" }} data-catalogue-wish-note>
        {L("«Уведоми ме при следваща» — в портала, за влезлите потребители на организация.", "«Notify me of the next» — in the portal, for the signed-in users of an organisation.")}
      </p>
      {GROUPS.map((g) => (
        <section key={g} className="mt-8" data-catalogue-group={g}>
          <h2 className="text-xl font-bold" style={{ color: "var(--green-light)" }}>{GROUP_TEXT[g][lg]}</h2>
          {rows[g].length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "#aab59c" }}>{L("Няма.", "None.")}</p>
          ) : (
            <div className="mt-3 grid gap-3">
              {rows[g].map(({ scheme: s, state }) => (
                <Link key={s.id} href={`/apply/${s.id}`} className="no-underline" style={card} data-catalogue-scheme={s.id} data-catalogue-state={state}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span style={{ fontWeight: 700, color: "var(--green-light)" }}>{s.number}</span>
                    <span className="chip" style={{ background: "var(--green-dark)" }}>{activityText(s, lg)}</span>
                    <span className="text-sm" style={{ marginLeft: "auto", fontWeight: 700, color: takesApplications(state) ? "var(--green-light)" : "#f0c98a" }}>{STATE_TEXT[state][lg]}</span>
                  </div>
                  <div className="mt-1" style={{ fontSize: "1.15rem", fontWeight: 700 }}>{L(s.titleBg || s.titleEn, s.titleEn || s.titleBg)}</div>
                  <div className="mt-1 text-sm" style={{ color: "#cdd6c2" }}>
                    {L("Обект:", "Object:")} {L(s.objectBg || s.objectEn, s.objectEn || s.objectBg)}
                    {takesApplications(state) && s.dates?.applicationsDue ? ` · ${L("заявки до", "applications by")} ${fmtSchemeDate(s.dates.applicationsDue)}` : ""}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
