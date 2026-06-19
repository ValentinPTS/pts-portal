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
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        {tr("build.title")}
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {tr("build.subtitle")}
      </p>

      <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(235px,1fr))" }}>
        {DOCUMENTS.map((d, i) => {
          const started = !!s.composed?.[d.key]?.length;
          return (
            <Link
              key={d.key}
              href={`/schemes/${id}/build/${d.key}`}
              className="card p-3 no-underline"
              style={{ borderLeft: `4px solid ${started ? "var(--green-dark)" : "var(--line)"}`, color: "var(--ink)" }}
            >
              <div className="text-xs" style={{ color: "var(--muted)" }}>{i + 1}</div>
              <div className="font-bold" style={{ color: "var(--green-dark)" }}>{lang === "bg" ? d.nameBg : d.nameEn}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>{lang === "bg" ? d.nameEn : d.nameBg}</div>
              <div className="text-xs font-bold mt-2" style={{ color: started ? "var(--green-dark)" : "var(--muted)" }}>
                {started ? tr("build.started") : tr("build.compose")}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
