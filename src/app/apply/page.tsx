import Link from "next/link";
import { listSchemes } from "@/lib/store";
import { getServerT } from "@/lib/i18n-server";
import { typeLabel } from "@/lib/folders";

// Render per-request so the open-scheme list reflects live data (not frozen at
// build) and the build doesn't call Supabase while compiling.
export const dynamic = "force-dynamic";

// Public landing for labs: the proficiency-testing schemes currently open for
// applications. No confidential data — title, object, dates, min participants.
export default async function ApplyHome() {
  const open = (await listSchemes()).filter((s) => s.status === "open");
  const { lang, tr } = await getServerT();

  return (
    <div>
      <h1 className="text-4xl font-bold text-center" style={{ letterSpacing: "0.5px" }}>
        {tr("apply.title")}
      </h1>
      <p className="text-center mt-2" style={{ color: "#aab59c" }}>
        {tr("apply.openSchemes")}
      </p>
      <div className="mx-auto mt-3" style={{ width: 60, height: 3, background: "var(--green)" }} />

      {open.length === 0 ? (
        <div className="mt-10 text-center" style={{ color: "#aab59c" }}>
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
                background: "#1b2016",
                border: "1px solid #36422c",
                borderRadius: 14,
                padding: "18px 22px",
                color: "#e7ece1",
              }}
            >
              <div className="flex items-center gap-3">
                <span style={{ fontWeight: 700, color: "var(--green-light)" }}>{s.number}</span>
                <span
                  className="chip"
                  style={{ background: "var(--green-dark)", marginLeft: "auto" }}
                >
                  {typeLabel(s.type, lang)}
                </span>
              </div>
              <div className="mt-1" style={{ fontSize: "1.25rem", fontWeight: 700 }}>{lang === "bg" ? s.titleBg : s.titleEn}</div>
              <div className="mt-2 text-sm" style={{ color: "#cdd6c2" }}>
                {tr("apply.object")} {lang === "bg" ? s.objectBg : s.objectEn} · {tr("apply.min")} {s.minParticipants} {tr("apply.participants")}
              </div>
              <div className="mt-3" style={{ color: "var(--green-light)", fontWeight: 700 }}>
                {tr("apply.applyCta")}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
