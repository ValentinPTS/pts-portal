import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { DOCUMENTS } from "@/lib/documents";

export default async function BuildIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getScheme(id);
  if (!s) notFound();

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {s.number}
      </Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        Build documents
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Compose any document yourself from blocks + your snippet library. The auto-generated versions still work too — this is the editor on top.
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
              <div className="font-bold" style={{ color: "var(--green-dark)" }}>{d.nameEn}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>{d.nameBg}</div>
              <div className="text-xs font-bold mt-2" style={{ color: started ? "var(--green-dark)" : "var(--muted)" }}>
                {started ? "✎ started — edit" : "＋ compose"}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
