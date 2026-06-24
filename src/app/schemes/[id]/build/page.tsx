import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { DOCUMENTS } from "@/lib/documents";
import { getServerT } from "@/lib/i18n-server";

export default async function BuildIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getScheme(id);
  if (!s) notFound();
  const { lang, tr } = await getServerT();

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {s.number}
      </Link>
      <h1 className="text-3xl font-bold mt-2" style={{ color: "var(--green-dark)", letterSpacing: "-0.01em" }}>
        {tr("build.title")}
      </h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
        {tr("build.subtitle")}
      </p>

      <div className="mt-5 grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
        {DOCUMENTS.map((d, i) => {
          const started = !!s.composed?.[d.key]?.length;
          return (
            <Link
              key={d.key}
              href={`/schemes/${id}/build/${d.key}`}
              className="card no-underline"
              style={{
                borderLeft: `4px solid ${started ? "var(--green-dark)" : "var(--line)"}`,
                color: "var(--ink)", padding: 18, minHeight: 156,
                display: "flex", flexDirection: "column", gap: 6,
              }}
            >
              {/* top row: number badge + form-number chip */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span
                  style={{
                    width: 34, height: 34, borderRadius: 999, flexShrink: 0,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 15,
                    ...(started
                      ? { background: "var(--green-dark)", color: "#fff" }
                      : { background: "#fff", color: "var(--green-dark)", border: "1.5px solid var(--green-light)" }),
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", background: "var(--canvas)", borderRadius: 6, padding: "3px 8px" }}>
                  {d.formNumber}
                </span>
              </div>
              <div className="font-bold" style={{ color: "var(--green-dark)", fontSize: 16, marginTop: 6 }}>
                {lang === "bg" ? d.nameBg : d.nameEn}
              </div>
              <div className="text-sm" style={{ color: "var(--muted)" }}>
                {lang === "bg" ? d.nameEn : d.nameBg}
              </div>
              <div style={{ marginTop: "auto", fontSize: 13, fontWeight: 700, color: started ? "var(--green-dark)" : "var(--muted)" }}>
                {started ? `${tr("build.started")} ✓` : `${tr("build.compose")} →`}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
