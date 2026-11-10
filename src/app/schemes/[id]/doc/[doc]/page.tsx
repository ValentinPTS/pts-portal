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
import CertificateSteps, { type CertRow } from "@/components/CertificateSteps";
import { certState, releasedBeforeCorrection, legacyIssued, scopeOf } from "@/lib/cert-model";
import { listSubmissions } from "@/lib/submissions";
import { versionInForce } from "@/lib/round-export-submissions";
import { pointKeys } from "@/lib/reference-values-model";
import { currentFinalList, finalSelectionsOf, inFinalRound } from "@/lib/announcement-model";
import { selectionsOf } from "@/lib/application-model";
import { issueInForce, reaches } from "@/lib/report-issue-model";
import { lockInForce, lockEntryOf, isNR } from "@/lib/submission-lock-model";
import { actorKeyNow } from "@/lib/identities";
import { sofiaToday, schemeNowMs } from "@/lib/clock";

export default async function DocPage({
  params, searchParams,
}: {
  params: Promise<{ id: string; doc: string }>;
  searchParams: Promise<{ cert?: string }>;
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
          // 7.7 review: no number for a participation that gets no certificate (N/R at the lock, off the final list)
          const e = lockEntryOf(lockInForce(s.submissionLocks), p.id);
          return { code: p.code, labName: reveal ? p.labName : undefined, certNo: reveal ? cert?.no : undefined, certDate: reveal ? cert?.date : undefined, noCert: !inFinalRound(s, p) || (!!e && isNR(e)) };
        })
      : [];
  // 7.7: the certificate's four steps, per participation on the final list, by its code
  let steps: { rows: CertRow[]; rInForce: number | null; canType: boolean; canCheck: boolean; canRelease: boolean; me: string; today: string } | null = null;
  if (def.key === "certificate") {
    const issue = issueInForce(s.reportIssues);
    const lock = lockInForce(s.submissionLocks);
    const legacy = legacyIssued(s);
    const parts = (await listParticipants(id)).filter((p) => inFinalRound(s, p));
    // the scope offered for each — from the version in force, else what it ran for (confirmed by the typist)
    const subs = issue ? await listSubmissions(id).catch(() => [] as Awaited<ReturnType<typeof listSubmissions>>) : [];
    const points = pointKeys(s.calibration ?? undefined);
    const final = currentFinalList(s);
    const rows: CertRow[] = parts.map((p) => {
      const cert = s.certificates?.[p.code] ?? null;
      const e = lockEntryOf(lock, p.id);
      let version: { data: unknown } | null = null;
      try { version = issue ? versionInForce(p, subs, s.submissionLocks, s.labUploads).sub : null; } catch { version = null; }
      const sel = final?.runs ? finalSelectionsOf(p, { runs: final.runs }, s.parameters.length) : selectionsOf(p, s.parameters.length);
      const offered = scopeOf(s, points, version, Object.entries(sel).filter(([, n]) => (n as number) > 0).map(([i]) => Number(i)));
      return { code: p.code, state: certState({ cert, issue, nr: !!e && isNR(e), reached: reaches(s.reportAccess, p.code), legacy }), cert, correctedSince: releasedBeforeCorrection(cert, issue), numberShown: reveal, offered: offered.items, offeredFrom: offered.from };
    });
    const day = sofiaToday(schemeNowMs(s));
    steps = {
      rows, rInForce: issue?.r ?? null,
      canType: (await mayNow("results.process", id)) || (await mayNow("scheme.edit", id)),
      canCheck: (await mayNow("results.process", id)) || (await mayNow("scheme.edit", id)) || (await mayNow("approve", id)),
      canRelease: await mayNow("approve", id),
      me: await actorKeyNow(), today: `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`,
    };
  }
  const sp = await searchParams;
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
      {steps && <CertificateSteps schemeId={s.id} lang={lang === "bg" ? "bg" : "en"} rows={steps.rows} rInForce={steps.rInForce} canType={steps.canType} canCheck={steps.canCheck} canRelease={steps.canRelease} me={steps.me} answer={sp.cert} today={steps.today} />}
    </div>
  );
}
