import Link from "next/link";
import { listOpenSchemes } from "@/lib/store";
import { getServerT } from "@/lib/i18n-server";
import { typeLabel } from "@/lib/folders";
import { ONLINE_APPLICATIONS_OPEN, PDF_APPLICATION_URL } from "@/lib/online-applications";

// Render per-request so the open-scheme list reflects live data (not frozen at
// build) and the build doesn't call Supabase while compiling.
export const dynamic = "force-dynamic";

// Public landing for labs: the proficiency-testing schemes currently open for
// applications. No confidential data — title, object, dates, min participants.
export default async function ApplyHome() {
  const open = await listOpenSchemes();
  const { lang, tr } = await getServerT();

  return (
    <div>
      <h1 className="text-4xl font-bold text-center" style={{ letterSpacing: "0.5px" }}>
        {tr("apply.title")}
      </h1>
      <p className="text-center mt-2" style={{ color: "#555555" }}>
        {tr("apply.openSchemes")}
      </p>
      <div className="mx-auto mt-3" style={{ width: 60, height: 3, background: "var(--green)" }} />
      {/* 10.1: every started scheme — taking applications, under way, finished */}
      <p className="text-center mt-3"><Link href="/catalogue" data-catalogue-link style={{ color: "var(--done-ink)", fontWeight: 700 }}>{lang === "bg" ? "Каталог на всички схеми →" : "The catalogue of all schemes →"}</Link></p>
      {!ONLINE_APPLICATIONS_OPEN && (
        <div className="mt-6 mx-auto text-center" style={{ maxWidth: 620, color: "#7a5416" }}>
          <p>{tr("apply.closedBody")}</p>
          {/* 9.2: the laboratory applies in its portal — or with the PDF, until Реш. 146 */}
          <div className="mt-3 flex gap-3 justify-center flex-wrap" data-apply-paths>
            <a href="/lab/login" className="btn btn-primary inline-flex">{tr("apply.portalLink")}</a>
            <a href="/register" className="btn inline-flex">{tr("apply.registerLink")}</a>
            <a href={PDF_APPLICATION_URL} target="_blank" rel="noopener" className="btn inline-flex">{tr("apply.pdfLink")}</a>
          </div>
        </div>
      )}

      {open.length === 0 ? (
        <div className="mt-10 text-center" style={{ color: "#555555" }}>
          {tr("apply.noneOpen")}
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {open.map((s) => (
            <Link
              key={s.id}
              href={`/apply/${s.id}`}
              className="no-underline"
              style={{
                display: "block",
                background: "#ffffff",
                border: "1px solid #e3e9de",
                borderRadius: 14,
                padding: "18px 22px",
                color: "#3e3e3e",
              }}
            >
              <div className="flex items-center gap-3">
                <span style={{ fontWeight: 700, color: "var(--done-ink)" }}>{s.number}</span>
                <span
                  className="chip"
                  style={{ background: "var(--green-dark)", marginLeft: "auto" }}
                >
                  {typeLabel(s.type, lang)}
                </span>
              </div>
              <div className="mt-1" style={{ fontSize: "1.25rem", fontWeight: 700 }}>{lang === "bg" ? s.titleBg : s.titleEn}</div>
              <div className="mt-2 text-sm" style={{ color: "#456b2c" }}>
                {tr("apply.object")} {lang === "bg" ? s.objectBg : s.objectEn} · {tr("apply.min")} {s.minParticipants} {tr("apply.participants")}
              </div>
              <div className="mt-3" style={{ color: "var(--done-ink)", fontWeight: 700 }}>
                {ONLINE_APPLICATIONS_OPEN ? tr("apply.applyCta") : tr("apply.detailsCta")}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
