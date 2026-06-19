import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { getDoc } from "@/lib/documents";
import { listParticipants } from "@/lib/participants";
import DocViewer from "@/components/DocViewer";
import { getServerT } from "@/lib/i18n-server";

export default async function DocPage({
  params,
}: {
  params: Promise<{ id: string; doc: string }>;
}) {
  const { id, doc } = await params;
  const s = await getScheme(id);
  const def = getDoc(doc);
  if (!s || !def) notFound();
  const { lang, tr } = await getServerT();
  const docName = lang === "bg" ? def.nameBg : def.nameEn;

  // The Certificate is issued per participant — offer a lab selector + the
  // stored certificate number/date for each.
  const participants =
    def.key === "certificate"
      ? (await listParticipants(id)).map((p) => {
          const cert = s.certificates?.[p.code];
          return { code: p.code, labName: p.labName, certNo: cert?.no, certDate: cert?.date };
        })
      : [];

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {s.number}
      </Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        {docName}{" "}
        <span className="text-sm font-normal" style={{ color: "var(--muted)" }}>· {def.formNumber}</span>
      </h1>
      <Link href={`/schemes/${id}/edit`} className="btn mt-2 inline-flex">
        {tr("doc.editSchemeData")}
      </Link>

      {def.render ? (
        <DocViewer id={s.id} doc={def.key} number={s.number} name={docName} participants={participants} />
      ) : (
        <div className="card p-6 mt-4" style={{ color: "var(--muted)" }}>
          {tr("doc.notGenerated")}
        </div>
      )}
    </div>
  );
}
