import Link from "next/link";
import { requireCap, mayNow, requireDocView } from "@/lib/access";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { getDoc, isRestrictedDoc } from "@/lib/documents";
import { listParticipants, withoutIdentity } from "@/lib/participants";
import { namesFor } from "@/lib/identities";
import DocViewer from "@/components/DocViewer";
import { getServerT } from "@/lib/i18n-server";
import { requireStaff } from "@/lib/roles";
import { logActivity } from "@/lib/activity";

export default async function DocPage({
  params,
}: {
  params: Promise<{ id: string; doc: string }>;
}) {
  await requireStaff(); // read gate: manager/staff/auditor only
  const { id, doc } = await params;
  await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  if (isRestrictedDoc(doc)) await requireCap("names.view", id); // F 7.2.1-6 = names ↔ codes (part 0.2)
  await requireDocView(doc, id); // the Order: the staff it assigns roles to (Реш. 149, 2.6)
  const s = await getScheme(id);
  const def = getDoc(doc);
  if (!s || !def) notFound();
  const { lang, tr } = await getServerT();
  const docName = lang === "bg" ? def.nameBg : def.nameEn;

  // The Certificate is issued per participant — offer a lab selector + the
  // stored certificate number/date for each.
  // The lab picker lists codes; only a manager also sees the names (§4.2).
  const reveal = def.key === "certificate" && (await mayNow("names.view", id));
  const participants =
    def.key === "certificate"
      ? (reveal ? await namesFor(id, await listParticipants(id)) : (await listParticipants(id)).map(withoutIdentity)).map((p) => {
          const cert = s.certificates?.[p.code];
          // a certificate's number is the public register's key to the laboratory (Реш. 115):
          // with its code, only for who sees the names here (§4.2, 2.9)
          return { code: p.code, labName: reveal ? p.labName : undefined, certNo: reveal ? cert?.no : undefined, certDate: reveal ? cert?.date : undefined };
        })
      : [];
  // the picker shows each code with its laboratory's name — in the journal (1.9)
  if (reveal && participants.length) await logActivity("names.viewed", { schemeId: id, subject: "doc:certificate", summary: "Laboratory names shown with their codes — the certificate picker" });

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {s.number}
      </Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        {docName}{" "}
        {def.formNumber && <span className="text-sm font-normal" style={{ color: "var(--muted)" }}>· {def.formNumber}</span>}
      </h1>
      <Link href={`/schemes/${id}/edit`} className="btn mt-2 inline-flex">
        {tr("doc.editSchemeData")}
      </Link>

      {def.render ? (
        <DocViewer id={s.id} doc={def.key} number={s.number} name={docName} participants={participants} canIssue={reveal} />
      ) : (
        <div className="card p-6 mt-4" style={{ color: "var(--muted)" }}>
          {tr("doc.notGenerated")}
        </div>
      )}
    </div>
  );
}
